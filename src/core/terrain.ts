import type {TerrainKey} from './terrainDefs';
import {TERRAIN_DEFS} from './terrainDefs';
import {applyBiomeModifiers, detectBiome} from './biomes';
import {terrainPositions} from './world'; // use sets for fast lookup

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

function getWeightsForContext(neighborTerrains: TerrainKey[], biomeTerrains: TerrainKey[]) {
    const key = makeCacheKey(neighborTerrains, biomeTerrains);
    const cached = terrainWeightCache.get(key);
    if (cached) return cached;

    // Base weights copy per terrain type
    const weights: Record<TerrainKey, number> = {
        forest: TERRAIN_DEFS.forest.baseWeight,
        plains: TERRAIN_DEFS.plains.baseWeight,
        water: TERRAIN_DEFS.water.baseWeight,
        mountain: TERRAIN_DEFS.mountain.baseWeight,
        mine: TERRAIN_DEFS.mine.baseWeight,
        ruin: TERRAIN_DEFS.ruin.baseWeight,
        towncenter: 0,
    };

    // Apply adjacency deltas
    neighborTerrains.forEach(nt => {
        for (const key of Object.keys(TERRAIN_DEFS) as TerrainKey[]) {
            const delta = TERRAIN_DEFS[key].adjacency[nt];
            if (delta !== undefined) weights[key] += delta;
        }
    });

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
        const distFromCenter = hexDistanceFromOrigin(q, r);
        for (const key of Object.keys(candidate) as TerrainKey[]) {
            const def = TERRAIN_DEFS[key];
            if (!def) continue;
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

    const entries = (Object.entries(candidate) as [TerrainKey, number][]) // exclude towncenter
        .filter(([k, w]) => k !== 'towncenter' && w > 0 && w !== Infinity && !Number.isNaN(w));
    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    if (total <= 0) return {biome, terrain: 'plains'};
    let roll = Math.random() * total;
    for (const [terrain, w] of entries) {
        if (roll < w) return {biome, terrain};
        roll -= w;
    }
    return {biome, terrain: 'plains'};
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
