import { terrainPositions, variantPositions } from '../core/terrainRegistry';
import { tileIndex } from '../core/world';
import { axialDistanceCoords } from '../shared/game/hex';
import type { Tile } from '../core/types/Tile';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import {
    type PressureState,
    type SettlementSupportCounts,
    type SettlementPopulationInput,
    computeControlledTileIds,
    computeControlledTileIdsForTC,
    computeControlledTileIdsForWatchtower,
    getSettlementSupportSnapshot,
} from './settlementSupportStore';

// --- Constants ---

/** Maximum population capacity unlocked by each town center. */
export const TC_BASE_POPULATION = 15;

/** Food consumed per settler per minute. */
export const FOOD_PER_SETTLER_PER_MINUTE = 1;

/** Minutes without food before a settler dies. */
export const HUNGER_GRACE_MINUTES = 3;

/** Minimum population — the landing can sit empty until housing is built. */
export const MIN_POPULATION = 0;

// --- House variant keys (must match terrainDefs) ---

export const HOUSE_VARIANT_KEYS = ['plains_house', 'dirt_house', 'plains_stone_house', 'dirt_stone_house', 'plains_glass_house', 'dirt_glass_house'] as const;

const HOUSE_BED_CAPACITY_BY_VARIANT: Record<(typeof HOUSE_VARIANT_KEYS)[number], number> = {
    plains_house: 2,
    dirt_house: 2,
    plains_stone_house: 4,
    dirt_stone_house: 4,
    plains_glass_house: 6,
    dirt_glass_house: 6,
};

// --- State ---

export interface PopulationState {
    /** Current settler count. */
    current: number;
    /** Maximum population capacity (determined by town centers only). */
    max: number;
    /** Available beds (determined by houses within TC reach). */
    beds: number;
    /** Accumulated hunger time in ms (resets when food is consumed). */
    hungerMs: number;
    /** Timestamp of last food consumption tick. */
    lastFoodTickMs: number;
    /** Total support slots available for non-towncenter tiles. */
    supportCapacity: number;
    /** Active non-towncenter tile count. */
    activeTileCount: number;
    /** Inactive non-towncenter tile count. */
    inactiveTileCount: number;
    /** Current colony pressure readout. */
    pressureState: PressureState;
    /** Per-settlement population and support counts. */
    settlements: SettlementPopulationSnapshot[];
}

export interface SettlementPopulationSnapshot extends SettlementSupportCounts {
    current: number;
    max: number;
    beds: number;
    hungerMs: number;
    pressureState: PressureState;
}

const state: PopulationState = {
    current: 0,
    max: 0,
    beds: 0,
    hungerMs: 0,
    lastFoodTickMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
};

const settlementPopulation = new Map<string, PopulationState>();

function createSettlementPopulationState(): PopulationState {
    return {
        current: MIN_POPULATION,
        max: 0,
        beds: 0,
        hungerMs: 0,
        lastFoodTickMs: 0,
        supportCapacity: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        pressureState: 'stable',
        settlements: [],
    };
}

function cloneSettlementPopulationSnapshot(settlement: SettlementPopulationSnapshot): SettlementPopulationSnapshot {
    return { ...settlement };
}

function refreshAggregatePopulation() {
    state.current = Array.from(settlementPopulation.values())
        .reduce((total, settlementState) => total + settlementState.current, 0);
}

function refreshSettlementPopulationSnapshots() {
    state.settlements = state.settlements.map((settlement) => {
        const settlementState = getOrCreateSettlementPopulationState(settlement.settlementId);
        return {
            ...settlement,
            current: settlementState.current,
            max: settlementState.max,
            beds: settlementState.beds,
            hungerMs: settlementState.hungerMs,
            pressureState: settlementState.pressureState,
        };
    });
}

function getOrCreateSettlementPopulationState(settlementId: string) {
    let settlementState = settlementPopulation.get(settlementId);
    if (!settlementState) {
        settlementState = createSettlementPopulationState();
        settlementPopulation.set(settlementId, settlementState);
    }

    return settlementState;
}

export function getPopulationBySettlementInput(): SettlementPopulationInput {
    const populationBySettlementId: Record<string, number> = {};
    for (const [settlementId, settlementState] of settlementPopulation.entries()) {
        populationBySettlementId[settlementId] = settlementState.current;
    }

    return populationBySettlementId;
}

export function getSettlementPopulationState(settlementId: string | null | undefined): Readonly<PopulationState> | null {
    if (!settlementId) {
        return null;
    }

    return settlementPopulation.get(settlementId) ?? null;
}

export function initializeSettlementPopulation(settlementId: string) {
    const settlementState = getOrCreateSettlementPopulationState(settlementId);
    settlementState.current = MIN_POPULATION;
    settlementState.hungerMs = 0;
    settlementState.lastFoodTickMs = Date.now();
    recalculatePopulationLimits();
    return settlementState;
}

export function getPopulationState(): Readonly<PopulationState> {
    return state;
}

export function resetPopulationState() {
    settlementPopulation.clear();
    state.current = 0;
    state.max = 0;
    state.beds = 0;
    state.hungerMs = 0;
    state.lastFoodTickMs = 0;
    state.supportCapacity = 0;
    state.activeTileCount = 0;
    state.inactiveTileCount = 0;
    state.pressureState = 'stable';
    state.settlements = [];
}

// --- Reach Calculation ---

/**
 * Returns the set of tile IDs that are within reach of any town center,
 * including watchtower extensions.
 */
export function computeReachTileIds(): Set<string> {
    return computeControlledTileIds();
}

/**
 * Returns the set of tile IDs within reach of a specific town center tile,
 * including watchtower extensions for that TC.
 */
export function computeReachTileIdsForTC(tcQ: number, tcR: number): Set<string> {
    return computeControlledTileIdsForTC(tcQ, tcR);
}

/**
 * Returns the nearest town center whose base reach contains this watchtower.
 */
export function findNearestTownCenterForWatchtower(wtQ: number, wtR: number): Tile | null {
    let nearestTownCenter: Tile | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const watchtowerId = `${wtQ},${wtR}`;
    for (const tcId of terrainPositions.towncenter) {
        const tc = tileIndex[tcId];
        if (!tc) continue;
        const reach = computeReachTileIdsForTC(tc.q, tc.r);
        if (!reach.has(watchtowerId)) continue;
        const distance = axialDistanceCoords(tc.q, tc.r, wtQ, wtR);
        if (distance < nearestDistance) {
            nearestTownCenter = tc;
            nearestDistance = distance;
        }
    }

    return nearestTownCenter;
}

/**
 * Returns the full merged reach of the town center that powers this watchtower.
 */
export function computeReachTileIdsForWatchtower(wtQ: number, wtR: number): Set<string> {
    return computeControlledTileIdsForWatchtower(wtQ, wtR);
}

/**
 * Check if a tile at (q, r) is within reach of any town center.
 */
export function isTileWithinReach(q: number, r: number): boolean {
    return computeReachTileIds().has(`${q},${r}`);
}

// --- Population Calculation ---

/**
 * Recalculate max population (from TCs) and beds (from houses within reach).
 * Max population is determined solely by town centers.
 * Beds are determined by houses within TC reach.
 */
export function recalculatePopulationLimits(): { max: number; beds: number } {
    const tcCount = terrainPositions.towncenter.size;
    const maxPop = tcCount * TC_BASE_POPULATION;
    const controlledTileIds = computeControlledTileIds();
    const bedsBySettlementId = new Map<string, number>();
    const maxBySettlementId = new Map<string, number>();

    for (const tcId of terrainPositions.towncenter) {
        const tile = tileIndex[tcId];
        if (!tile?.discovered || tile.terrain !== 'towncenter') continue;
        maxBySettlementId.set(tile.id, (maxBySettlementId.get(tile.id) ?? 0) + TC_BASE_POPULATION);
        getOrCreateSettlementPopulationState(tile.id);
    }

    let beds = 0;
    for (const variantKey of HOUSE_VARIANT_KEYS) {
        const positions = variantPositions[variantKey];
        if (!positions) continue;
        for (const tileId of positions) {
            const tile = tileIndex[tileId];
            if (!tile || !controlledTileIds.has(tile.id)) {
                continue;
            }
            const houseBeds = HOUSE_BED_CAPACITY_BY_VARIANT[variantKey];
            beds += houseBeds;
            const settlementId = tile.ownerSettlementId ?? tile.controlledBySettlementId ?? null;
            if (settlementId) {
                bedsBySettlementId.set(settlementId, (bedsBySettlementId.get(settlementId) ?? 0) + houseBeds);
            }
        }
    }

    state.max = maxPop;
    state.beds = beds;

    // Clamp current to max (cannot exceed TC capacity)
    if (state.current > state.max) {
        state.current = state.max;
    }

    for (const [settlementId, settlementState] of settlementPopulation.entries()) {
        settlementState.max = maxBySettlementId.get(settlementId) ?? 0;
        settlementState.beds = bedsBySettlementId.get(settlementId) ?? 0;
        if (settlementState.current > settlementState.max) {
            settlementState.current = settlementState.max;
        }
    }
    refreshAggregatePopulation();
    refreshSettlementPopulationSnapshots();

    return { max: maxPop, beds };
}

/**
 * Called when a new TC, house or watchtower is built, to update population limits.
 * Recalculates max and beds but does NOT auto-grow settlers.
 * Population growth happens passively on the food tick.
 */
export function onBuildingCompleted() {
    recalculatePopulationLimits();
    broadcastPopulationState();
}

/**
 * Attempt to grow population by one settler.
 * Growth happens only when:
 *   1. current < beds (house capacity)
 *   2. current < max (TC capacity)
 * The caller (populationSystem) is responsible for checking food availability.
 * Returns true if a settler was added.
 */
export function growPopulation(settlementId?: string | null): boolean {
    if (settlementId) {
        const settlementState = getOrCreateSettlementPopulationState(settlementId);
        if (settlementState.current >= settlementState.max) return false;
        if (settlementState.current >= settlementState.beds) return false;

        settlementState.current++;
        refreshAggregatePopulation();
        refreshSettlementPopulationSnapshots();
        broadcastPopulationState();
        return true;
    }

    if (state.current >= state.max) return false;
    if (state.current >= state.beds) return false;

    const candidate = Array.from(settlementPopulation.entries())
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
        .find(([, settlementState]) => settlementState.current < settlementState.max && settlementState.current < settlementState.beds);
    if (candidate) {
        candidate[1].current++;
        refreshAggregatePopulation();
        refreshSettlementPopulationSnapshots();
        broadcastPopulationState();
        return true;
    }

    state.current++;
    broadcastPopulationState();
    return true;
}

/**
 * Kill a settler (e.g. from hunger). Returns true if a settler died.
 */
export function killSettler(settlementId?: string | null): boolean {
    if (settlementId) {
        const settlementState = settlementPopulation.get(settlementId);
        if (!settlementState || settlementState.current <= MIN_POPULATION) {
            return false;
        }

        settlementState.current--;
        refreshAggregatePopulation();
        refreshSettlementPopulationSnapshots();
        broadcastPopulationState();
        return true;
    }

    if (state.current <= MIN_POPULATION) {
        return false;
    }

    const candidate = Array.from(settlementPopulation.entries())
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
        .find(([, settlementState]) => settlementState.current > MIN_POPULATION);
    if (candidate) {
        candidate[1].current--;
        refreshAggregatePopulation();
        refreshSettlementPopulationSnapshots();
        broadcastPopulationState();
        return true;
    }

    state.current--;
    broadcastPopulationState();
    return true;
}

/**
 * Set the accumulated hunger time in ms.
 * Used by the population system to track hunger between food ticks.
 */
export function setHungerMs(ms: number) {
    state.hungerMs = ms;
}

export function setSupportMetrics(snapshot: ReturnType<typeof getSettlementSupportSnapshot>) {
    state.supportCapacity = snapshot.supportCapacity;
    state.activeTileCount = snapshot.activeTileCount;
    state.inactiveTileCount = snapshot.inactiveTileCount;
    state.pressureState = snapshot.pressureState;
    state.settlements = snapshot.settlements.map((settlement) => {
        const settlementState = getOrCreateSettlementPopulationState(settlement.settlementId);
        settlementState.supportCapacity = settlement.supportCapacity;
        settlementState.activeTileCount = settlement.activeTileCount;
        settlementState.inactiveTileCount = settlement.inactiveTileCount;
        settlementState.pressureState = snapshot.pressureState;

        return {
            ...settlement,
            current: settlementState.current,
            max: settlementState.max,
            beds: settlementState.beds,
            hungerMs: settlementState.hungerMs,
            pressureState: settlementState.pressureState,
        };
    });
}

/**
 * Initialize population for a new game (after world generation).
 * Starts at zero; growth happens passively once houses provide beds.
 */
export function initializePopulation() {
    settlementPopulation.clear();
    recalculatePopulationLimits();
    state.current = MIN_POPULATION;
    state.hungerMs = 0;
    state.lastFoodTickMs = Date.now();
    broadcastPopulationState();
}

// --- Snapshot for protocol ---

export interface PopulationSnapshot {
    current: number;
    max: number;
    beds: number;
    hungerMs: number;
    supportCapacity: number;
    activeTileCount: number;
    inactiveTileCount: number;
    pressureState: PressureState;
    settlements: SettlementPopulationSnapshot[];
}

export function getPopulationSnapshot(): PopulationSnapshot {
    return {
        current: state.current,
        max: state.max,
        beds: state.beds,
        hungerMs: state.hungerMs,
        supportCapacity: state.supportCapacity,
        activeTileCount: state.activeTileCount,
        inactiveTileCount: state.inactiveTileCount,
        pressureState: state.pressureState,
        settlements: state.settlements.map(cloneSettlementPopulationSnapshot),
    };
}

export function loadPopulationSnapshot(snapshot: PopulationSnapshot) {
    settlementPopulation.clear();
    state.current = snapshot.current;
    state.max = snapshot.max;
    state.beds = snapshot.beds ?? 0;
    state.hungerMs = snapshot.hungerMs;
    state.lastFoodTickMs = Date.now();
    state.supportCapacity = snapshot.supportCapacity ?? 0;
    state.activeTileCount = snapshot.activeTileCount ?? 0;
    state.inactiveTileCount = snapshot.inactiveTileCount ?? 0;
    state.pressureState = snapshot.pressureState ?? 'stable';
    state.settlements = snapshot.settlements?.map(cloneSettlementPopulationSnapshot) ?? [];
    for (const settlement of state.settlements) {
        const settlementState = getOrCreateSettlementPopulationState(settlement.settlementId);
        settlementState.current = settlement.current;
        settlementState.max = settlement.max;
        settlementState.beds = settlement.beds;
        settlementState.hungerMs = settlement.hungerMs;
        settlementState.lastFoodTickMs = Date.now();
        settlementState.supportCapacity = settlement.supportCapacity;
        settlementState.activeTileCount = settlement.activeTileCount;
        settlementState.inactiveTileCount = settlement.inactiveTileCount;
        settlementState.pressureState = state.pressureState;
    }
}

// --- Broadcast ---

function broadcastPopulationUpdate() {
    broadcast({
        type: 'population:update',
        current: state.current,
        max: state.max,
        beds: state.beds,
        hungerMs: state.hungerMs,
        supportCapacity: state.supportCapacity,
        activeTileCount: state.activeTileCount,
        inactiveTileCount: state.inactiveTileCount,
        pressureState: state.pressureState,
        settlements: state.settlements.map(cloneSettlementPopulationSnapshot),
    });
}

export function broadcastPopulationState() {
    broadcastPopulationUpdate();
}
