import type {TerrainKey} from './terrainDefs';
import {TERRAIN_DEFS} from './terrainDefs';
import { detectBiome, applyBiomeModifiers } from './biomes';

export {TERRAIN_DEFS};

export function weightedTerrainChoice(neighborTerrains: TerrainKey[], biomeTerrains: TerrainKey[]): TerrainKey {
    const weights: Record<TerrainKey, number> = {
        forest: TERRAIN_DEFS.forest.baseWeight,
        plains: TERRAIN_DEFS.plains.baseWeight,
        water: TERRAIN_DEFS.water.baseWeight,
        mountain: TERRAIN_DEFS.mountain.baseWeight,
        mine: TERRAIN_DEFS.mine.baseWeight,
        ruin: TERRAIN_DEFS.ruin.baseWeight,
        towncenter: 0,
    };
    neighborTerrains.forEach(nt => {
        for (const key of Object.keys(TERRAIN_DEFS) as TerrainKey[]) {
            const delta = TERRAIN_DEFS[key].adjacency[nt];
            if (delta !== undefined) weights[key] += delta;
        }
    });
    // Detect biome from neighbors and apply biome modifiers
    const biome = detectBiome(biomeTerrains);
    applyBiomeModifiers(biome, weights);

    const entries = (Object.entries(weights) as [TerrainKey, number][]) // exclude towncenter by weight
        .filter(([k, w]) => k !== 'towncenter' && w > 0 && w !== Infinity && !Number.isNaN(w));
    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    if (total <= 0) return 'plains';
    let roll = Math.random() * total;
    for (const [terrain, w] of entries) {
        if (roll < w) return terrain;
        roll -= w;
    }
    return 'plains';
}
