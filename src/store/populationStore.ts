import { terrainPositions, variantPositions } from '../core/terrainRegistry';
import { tileIndex } from '../core/world';
import { axialDistanceCoords } from '../shared/game/hex';
import type { Tile } from '../core/types/Tile';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import {
    type PressureState,
    type SettlementSupportCounts,
    computeControlledTileIds,
    computeControlledTileIdsForTC,
    computeControlledTileIdsForWatchtower,
    getSettlementSupportSnapshot,
} from './settlementSupportStore';

// --- Constants ---

/** Base population provided by each town center. */
export const TC_BASE_POPULATION = 15;

/** Additional population provided by each starter house within a town center's reach. */
export const HOUSE_POPULATION_BONUS = 2;

/** Food consumed per settler per minute. */
export const FOOD_PER_SETTLER_PER_MINUTE = 1;

/** Minutes without food before a settler dies. */
export const HUNGER_GRACE_MINUTES = 3;

/** Minimum population — cannot drop below this even from hunger. */
export const MIN_POPULATION = 1;

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
    /** Per-settlement support counts. */
    settlements: SettlementSupportCounts[];
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

export function getPopulationState(): Readonly<PopulationState> {
    return state;
}

export function resetPopulationState() {
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
    let beds = 0;
    for (const variantKey of HOUSE_VARIANT_KEYS) {
        const positions = variantPositions[variantKey];
        if (!positions) continue;
        for (const tileId of positions) {
            const tile = tileIndex[tileId];
            if (!tile || !controlledTileIds.has(tile.id)) {
                continue;
            }
            beds += HOUSE_BED_CAPACITY_BY_VARIANT[variantKey];
        }
    }

    state.max = maxPop;
    state.beds = beds;

    // Clamp current to max (cannot exceed TC capacity)
    if (state.current > state.max) {
        state.current = state.max;
    }

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
export function growPopulation(): boolean {
    if (state.current >= state.max) return false;
    if (state.current >= state.beds) return false;

    state.current++;
    broadcastPopulationState();
    return true;
}

/**
 * Kill a settler (e.g. from hunger). Returns true if a settler died.
 */
export function killSettler(): boolean {
    if (state.current <= MIN_POPULATION) {
        return false;
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
    state.settlements = snapshot.settlements.map((settlement) => ({ ...settlement }));
}

/**
 * Initialize population for a new game (after world generation).
 * Starts at MIN_POPULATION — growth happens passively on food ticks.
 */
export function initializePopulation() {
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
    settlements: SettlementSupportCounts[];
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
        settlements: state.settlements.map((settlement) => ({ ...settlement })),
    };
}

export function loadPopulationSnapshot(snapshot: PopulationSnapshot) {
    state.current = snapshot.current;
    state.max = snapshot.max;
    state.beds = snapshot.beds ?? 0;
    state.hungerMs = snapshot.hungerMs;
    state.lastFoodTickMs = Date.now();
    state.supportCapacity = snapshot.supportCapacity ?? 0;
    state.activeTileCount = snapshot.activeTileCount ?? 0;
    state.inactiveTileCount = snapshot.inactiveTileCount ?? 0;
    state.pressureState = snapshot.pressureState ?? 'stable';
    state.settlements = snapshot.settlements?.map((settlement) => ({ ...settlement })) ?? [];
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
        settlements: state.settlements.map((settlement) => ({ ...settlement })),
    });
}

export function broadcastPopulationState() {
    broadcastPopulationUpdate();
}
