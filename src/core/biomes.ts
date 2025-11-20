import type {TerrainKey} from './terrainDefs';

export type BiomeKey = 'forest' | 'mountain' | 'lake' | 'plains';

export interface BiomeDef {
    // terrain counts required to trigger biome
    when: Partial<Record<TerrainKey, number>>;

    // Optional restriction list: only these terrains can spawn inside biome
    allowedTerrains?: TerrainKey[];

    // Additive weight adjustments applied
    weightAdjust?: Partial<Record<TerrainKey, number>>;
}

export const BIOME_DEFS: Record<BiomeKey, BiomeDef> = {
    forest: {
        when: {'forest': 4},
        allowedTerrains: ['forest', 'plains', 'ruin'],
        weightAdjust: {forest: 3, ruin: 0.25, plains: 1},
    },
    mountain: {
        when: {'mountain': 4},
        allowedTerrains: ['mountain', 'mine', 'ruin', 'plains'],
        weightAdjust: {mountain: 3, mine: 1.5, ruin: 0.25},
    },
    lake: {
        when: {'water': 5},
        allowedTerrains: ['water', 'plains', 'forest'],
        weightAdjust: {water: 2, plains: 1, forest: 0.5},
    },
    plains: {
        when: {'plains': 4},
        allowedTerrains: ['plains', 'forest', 'mountain', 'water', 'ruin'],
        weightAdjust: {plains: 3},
    },
};

export function detectBiome(neighborTerrains: TerrainKey[]): BiomeKey | null {
    if (!neighborTerrains.length) return null;
    const counts: Record<string, number> = {};
    neighborTerrains.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
    });
    const get = (k: TerrainKey) => counts[k] || 0;

    for (const [biomeKey, def] of Object.entries(BIOME_DEFS) as [BiomeKey, BiomeDef][]) {
        let matches = true;
        for (const [terrainKey, requiredCount] of Object.entries(def.when) as [TerrainKey, number][]) {
            if (get(terrainKey) < requiredCount) {
                matches = false;
                break;
            }
        }
        if (matches) return biomeKey;
    }
    return null;
}

export function applyBiomeModifiers(
    biome: BiomeKey | null,
    weights: Record<TerrainKey, number>
): Record<TerrainKey, number> {
    if (!biome) return weights;
    const def = BIOME_DEFS[biome];
    if (!def) return weights;
    // Apply additive adjustments
    if (def.weightAdjust) {
        for (const [k, v] of Object.entries(def.weightAdjust) as [TerrainKey, number][]) {
            weights[k] = (weights[k] ?? 0) + v;
        }
    }

    // Restrict allowed terrains if specified
    if (def.allowedTerrains) {
        for (const key of Object.keys(weights) as TerrainKey[]) {
            if (!def.allowedTerrains.includes(key)) {
                weights[key] = 0; // heavily penalize but not remove to keep fallback diversity
            }
        }
    }

    return weights;
}

