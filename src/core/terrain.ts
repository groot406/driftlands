import type {TerrainKey} from './terrainDefs';
import {TERRAIN_DEFS} from './terrainDefs';
import {applyBiomeModifiers, detectBiome} from './biomes';

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

export function weightedTerrainChoice(neighborTerrains: TerrainKey[], biomeTerrains: TerrainKey[]): {biome: string|null, terrain: TerrainKey} {
    const { biome, weights } = getWeightsForContext(neighborTerrains, biomeTerrains);

    const entries = (Object.entries(weights) as [TerrainKey, number][]) // exclude towncenter by weight
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

// Lightweight cache trimming heuristic (optional). Prevent unbounded growth.
// Called lazily; if cache exceeds threshold, clear oldest half.
if (terrainWeightCache.size > 2000) {
    let i = 0;
    for (const k of terrainWeightCache.keys()) {
        if (i++ % 2 === 0) terrainWeightCache.delete(k);
    }
}
