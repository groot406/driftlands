import { terrainPositions } from '../core/terrainRegistry';
import { variantPositions } from '../core/terrainRegistry';
import { tileIndex } from '../core/world';
import { axialDistanceCoords } from '../shared/game/hex';
import type { Tile } from '../core/types/Tile';
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';

// --- Constants ---

/** Base population provided by each town center. */
export const TC_BASE_POPULATION = 10;

/** Additional population provided by each house within a town center's reach. */
export const HOUSE_POPULATION_BONUS = 2;

/** Reach radius (in hex distance) from a town center. */
export const TC_REACH_RADIUS = 8;

/** Additional reach radius (in hex distance) from a watchtower position. */
export const WATCHTOWER_REACH_EXTENSION = 5;

/** Food consumed per settler per minute. */
export const FOOD_PER_SETTLER_PER_MINUTE = 1;

/** Minutes without food before a settler dies. */
export const HUNGER_GRACE_MINUTES = 3;

/** Minimum population — cannot drop below this even from hunger. */
export const MIN_POPULATION = 1;

// --- House variant keys (must match terrainDefs) ---

export const HOUSE_VARIANT_KEYS = ['plains_house', 'dirt_house'] as const;
const WATCHTOWER_VARIANT_KEYS = ['plains_watchtower', 'dirt_watchtower', 'mountains_watchtower'] as const;

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
}

const state: PopulationState = {
    current: 0,
    max: 0,
    beds: 0,
    hungerMs: 0,
    lastFoodTickMs: 0,
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
}

// --- Reach Calculation ---

/**
 * Returns the set of tile IDs that are within reach of any town center,
 * including watchtower extensions.
 */
export function computeReachTileIds(): Set<string> {
    return computeReachTileIdsFromTownCenters(getTownCenters());
}

/**
 * Returns the set of tile IDs within reach of a specific town center tile,
 * including watchtower extensions for that TC.
 */
export function computeReachTileIdsForTC(tcQ: number, tcR: number): Set<string> {
    return computeReachTileIdsFromTownCenters([{ q: tcQ, r: tcR }]);
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
    const townCenter = findNearestTownCenterForWatchtower(wtQ, wtR);
    if (!townCenter) {
        return new Set<string>();
    }

    return computeReachTileIdsForTC(townCenter.q, townCenter.r);
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

    // Count houses within reach of any TC
    const globalReach = computeReachTileIds();
    let houseCount = 0;
    for (const variantKey of HOUSE_VARIANT_KEYS) {
        const positions = variantPositions[variantKey];
        if (!positions) continue;
        for (const tileId of positions) {
            if (globalReach.has(tileId)) {
                houseCount++;
            }
        }
    }

    const beds = houseCount * HOUSE_POPULATION_BONUS;

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
    broadcastPopulationUpdate();
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
    broadcastPopulationUpdate();
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
    broadcastPopulationUpdate();
    return true;
}

/**
 * Set the accumulated hunger time in ms.
 * Used by the population system to track hunger between food ticks.
 */
export function setHungerMs(ms: number) {
    state.hungerMs = ms;
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
    broadcastPopulationUpdate();
}

// --- Snapshot for protocol ---

export interface PopulationSnapshot {
    current: number;
    max: number;
    beds: number;
    hungerMs: number;
}

export function getPopulationSnapshot(): PopulationSnapshot {
    return {
        current: state.current,
        max: state.max,
        beds: state.beds,
        hungerMs: state.hungerMs,
    };
}

export function loadPopulationSnapshot(snapshot: PopulationSnapshot) {
    state.current = snapshot.current;
    state.max = snapshot.max;
    state.beds = snapshot.beds ?? 0;
    state.hungerMs = snapshot.hungerMs;
    state.lastFoodTickMs = Date.now();
}

// --- Broadcast ---

function broadcastPopulationUpdate() {
    broadcast({
        type: 'population:update',
        current: state.current,
        max: state.max,
        beds: state.beds,
        hungerMs: state.hungerMs,
    });
}

// --- Helpers ---

function addTilesInRadius(centerQ: number, centerR: number, radius: number, set: Set<string>) {
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            set.add(`${centerQ + dq},${centerR + dr}`);
        }
    }
}

function getTownCenters(): Tile[] {
    const townCenters: Tile[] = [];
    for (const tcId of terrainPositions.towncenter) {
        const tc = tileIndex[tcId];
        if (tc) townCenters.push(tc);
    }
    return townCenters;
}

function getWatchtowerTiles(): Tile[] {
    const watchtowerTiles: Tile[] = [];
    for (const variantKey of WATCHTOWER_VARIANT_KEYS) {
        const positions = variantPositions[variantKey];
        if (!positions) continue;
        for (const tileId of positions) {
            const tile = tileIndex[tileId];
            if (tile) watchtowerTiles.push(tile);
        }
    }
    return watchtowerTiles;
}

function computeReachTileIdsFromTownCenters(townCenters: Array<Pick<Tile, 'q' | 'r'>>): Set<string> {
    const reachSet = new Set<string>();
    const watchtowerTiles = getWatchtowerTiles();
    const activatedWatchtowers = new Set<string>();

    for (const tc of townCenters) {
        addTilesInRadius(tc.q, tc.r, TC_REACH_RADIUS, reachSet);
    }

    let changed = true;
    while (changed) {
        changed = false;

        for (const watchtower of watchtowerTiles) {
            if (activatedWatchtowers.has(watchtower.id)) continue;
            if (!reachSet.has(watchtower.id)) continue;

            activatedWatchtowers.add(watchtower.id);
            addTilesInRadius(watchtower.q, watchtower.r, WATCHTOWER_REACH_EXTENSION, reachSet);
            changed = true;
        }
    }

    return reachSet;
}
