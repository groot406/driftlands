import type {TerrainKey} from './terrainDefs';
import {TERRAIN_DEFS} from './terrainDefs';
import {applyBiomeModifiers, countTerrainOccurrences, detectBiome} from './biomes';
import {terrainPositions} from './terrainRegistry';
import {applyRegionalTerrainBias} from './worldVariation';
import { isStoryTerrainUnlocked } from '../shared/story/progressionState.ts';

export {TERRAIN_DEFS};

// Memoization cache: key built from sorted neighbor & biome terrain lists
// Stores immutable weight map + detected biome. Random roll still executed per call.
const terrainWeightCache = new Map<string, { biome: string | null; weights: Record<TerrainKey, number> }>();

function makeCacheKey(neighborTerrains: TerrainKey[], biomeTerrains: TerrainKey[]) {
    // Sorting makes order-independent; duplicates retained to reflect counts.
    const nKey = neighborTerrains.slice().sort().join(',');
    const bKey = biomeTerrains.slice().sort().join(',');
    return nKey + '|' + bKey;
}

// Build a fresh base weight map from current TERRAIN_DEFS (no hard-coded keys)
function buildBaseWeights(): Record<TerrainKey, number> {
    const weights = {} as Record<TerrainKey, number>;
    for (const key of Object.keys(TERRAIN_DEFS) as TerrainKey[]) {
        // towncenter (and any future special terrains) can define baseWeight=0 to avoid selection
        const def = TERRAIN_DEFS[key];
        weights[key] = def?.baseWeight ?? 0;
    }
    return weights;
}

const TERRAIN_CLUSTER_STRENGTH: Partial<Record<TerrainKey, number>> = {
    plains: 1.1,
    forest: 1.2,
    water: 1.45,
    mountain: 1.35,
    dirt: 1.05,
    snow: 1.2,
    dessert: 1.18,
    grain: 1.12,
    vulcano: 0.4,
};

function applyContinuityBias(
    weights: Record<TerrainKey, number>,
    neighborTerrains: TerrainKey[],
    biomeTerrains: TerrainKey[],
) {
    const immediateCounts = countTerrainOccurrences(neighborTerrains);
    const localCounts = countTerrainOccurrences(biomeTerrains);
    let dominantTerrain: TerrainKey | null = null;
    let dominantCount = 0;

    for (const terrain of Object.keys(localCounts) as TerrainKey[]) {
        const count = localCounts[terrain] ?? 0;
        if (count > dominantCount) {
            dominantTerrain = terrain;
            dominantCount = count;
        }
    }

    for (const terrain of Object.keys(TERRAIN_DEFS) as TerrainKey[]) {
        if (terrain === 'towncenter') continue;
        const immediate = immediateCounts[terrain] ?? 0;
        const local = localCounts[terrain] ?? 0;
        if (immediate === 0 && local === 0) continue;

        const outerRing = Math.max(0, local - immediate);
        const strength = TERRAIN_CLUSTER_STRENGTH[terrain] ?? 1;
        const continuity =
            ((immediate * 6)
            + (Math.max(0, immediate - 1) * 7)
            + (outerRing * 2.5)
            + (Math.max(0, local - 4) * 2.5))
            * strength;

        weights[terrain] = Math.max(0, (weights[terrain] ?? 0) + continuity);
    }

    if (dominantTerrain && dominantCount >= 6 && (immediateCounts[dominantTerrain] ?? 0) >= 3) {
        for (const terrain of Object.keys(TERRAIN_DEFS) as TerrainKey[]) {
            if (terrain === 'towncenter' || terrain === dominantTerrain) continue;
            const local = localCounts[terrain] ?? 0;
            if (local === 0) {
                weights[terrain] *= 0.72;
            } else if (local === 1) {
                weights[terrain] *= 0.86;
            }
        }
    }

    const snowyBadlands = (localCounts.snow ?? 0) >= 3 && (localCounts.dessert ?? 0) >= 2;
    if (snowyBadlands) {
        weights.plains += 6;
        weights.dirt += 8;
        weights.mountain += 6;
        weights.snow *= 0.85;
        weights.dessert *= 0.85;
    }

    const aridShore = (localCounts.water ?? 0) >= 4 && (localCounts.dessert ?? 0) >= 2;
    if (aridShore) {
        weights.plains += 6;
        weights.dirt += 5;
        weights.forest += 2;
        weights.water *= 0.92;
        weights.dessert *= 0.86;
    }

    const woodedCoast = (localCounts.water ?? 0) >= 4 && (localCounts.forest ?? 0) >= 4;
    if (woodedCoast) {
        weights.plains += 4;
        weights.dirt += 2;
    }
}

function getWeightsForContext(neighborTerrains: TerrainKey[], biomeTerrains: TerrainKey[]) {
    const key = makeCacheKey(neighborTerrains, biomeTerrains);
    const cached = terrainWeightCache.get(key);
    if (cached) return cached;

    // Base weights copy per terrain type (dynamic)
    const weights: Record<TerrainKey, number> = buildBaseWeights();

    // Apply adjacency deltas
    neighborTerrains.forEach(nt => {
        for (const tKey of Object.keys(TERRAIN_DEFS) as TerrainKey[]) {
            const def = TERRAIN_DEFS[tKey];
            if (!def) continue;
            const delta = def.adjacency?.[nt];
            if (delta !== undefined) weights[tKey] += delta;
        }
    });

    applyContinuityBias(weights, neighborTerrains, biomeTerrains);

    // Detect biome from neighbors and apply biome modifiers
    const biome = detectBiome(biomeTerrains);
    applyBiomeModifiers(biome, weights);

    const entry = { biome, weights };
    terrainWeightCache.set(key, entry);
    return entry;
}

function hexDistanceFromOrigin(q: number, r: number): number {
    const dq = Math.abs(q);
    const dr = Math.abs(r);
    const ds = Math.abs(-q - r);
    return Math.max(dq, dr, ds);
}

// Remove unused hexDistanceBetween; cache offsets for separation radii
const separationOffsetCache = new Map<number, Array<[number, number]>>();
function getSeparationOffsets(radius: number): Array<[number, number]> {
    let cached = separationOffsetCache.get(radius);
    if (cached) return cached;
    const arr: Array<[number, number]> = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            arr.push([dq, dr]);
        }
    }
    separationOffsetCache.set(radius, arr);
    return arr;
}

export function weightedTerrainChoice(neighborTerrains: TerrainKey[], biomeTerrains: TerrainKey[], q?: number, r?: number): {biome: string|null, terrain: TerrainKey} {
    const { biome, weights } = getWeightsForContext(neighborTerrains, biomeTerrains);

    const candidate: Record<TerrainKey, number> = { ...weights };

    if (q !== undefined && r !== undefined) {
        applyRegionalTerrainBias(candidate, q, r);
        const distFromCenter = hexDistanceFromOrigin(q, r);
        for (const key of Object.keys(candidate) as TerrainKey[]) {
            const def = TERRAIN_DEFS[key];
            if (!def) continue;
            if (!isStoryTerrainUnlocked(key)) {
                candidate[key] = 0;
                continue;
            }
            if (def.minDistanceFromCenter !== undefined && distFromCenter < def.minDistanceFromCenter) {
                candidate[key] = 0;
                continue;
            }
            if (def.minSeparation !== undefined && def.minSeparation > 0) {
                const radius = def.minSeparation - 1;
                if (radius >= 0) {
                    const offsets = getSeparationOffsets(radius);
                    for (const [dq, dr] of offsets) {
                        const keyStr = (q + dq) + ',' + (r + dr);
                        if (terrainPositions[key].has(keyStr)) {
                            candidate[key] = 0;
                            break;
                        }
                    }
                }
            }
        }
    }

    const entries = (Object.entries(candidate) as [TerrainKey, number][]) // exclude towncenter by weight=0
        .filter(([k, w]) => k !== 'towncenter' && w > 0 && w !== Infinity && !Number.isNaN(w));
    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    if (total <= 0) return {biome, terrain: 'plains'}; // fallback terrain if all weights zero
    let roll = Math.random() * total;
    for (const [terrain, w] of entries) {
        if (roll < w) return {biome, terrain};
        roll -= w;
    }
    return {biome, terrain: 'plains'}; // safety fallback
}

export function resetTerrainWeightCache() {
    terrainWeightCache.clear();
}

// Lightweight cache trimming heuristic (optional). Prevent unbounded growth.
// Called lazily; if cache exceeds threshold, clear oldest half.
if (terrainWeightCache.size > 2000) {
    let i = 0;
    for (const k of terrainWeightCache.keys()) {
        if (i++ % 2 === 0) terrainWeightCache.delete(k);
    }
}
