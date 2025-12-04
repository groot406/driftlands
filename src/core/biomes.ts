import type {TerrainKey} from './terrainDefs';

export type BiomeKey = 'forest' | 'mountain' | 'lake' | 'plains' | 'dessert' | 'snow' | 'dirt';

export interface BiomeDef {
    // terrain counts required to trigger biome
    when: Partial<Record<TerrainKey, number>>;

    // Optional restriction list: only these terrains can spawn inside biome
    allowedTerrains?: TerrainKey[];

    // Additive weight adjustments applied
    weightAdjust?: Partial<Record<TerrainKey, number>>;

    // variantKey -> multiplier applied to ageMs
    variantGrowthScale?: Record<string, number>;
}

export const BIOME_DEFS: Record<BiomeKey, BiomeDef> = {
    forest: {
        when: {'forest': 4},
        allowedTerrains: ['forest', 'plains'],
        weightAdjust: {forest: 20, plains: 1},
        variantGrowthScale: { young_forest: 0.8 }
    },
    mountain: {
        when: {'mountain': 3},
        allowedTerrains: ['mountain', 'plains', "snow"],
        weightAdjust: {mountain: 10, snow: 1},
        variantGrowthScale: { young_forest: 1.3 }
    },
    lake: {
        when: {'water': 5},
        allowedTerrains: ['water', 'plains', 'forest'],
        weightAdjust: {water: 10, plains: 1, forest: 0.5},
        variantGrowthScale: { young_forest: 0.9, dirt_tilled: 2 }
    },
    plains: {
        when: {'plains': 4},
        allowedTerrains: ['plains', 'forest', 'mountain', 'water', 'grain'],
        weightAdjust: {plains: 20},
        variantGrowthScale: { young_forest: 1 }
    },
    dessert: {
        when: {'dessert': 2},
        allowedTerrains: ['dessert', 'plains', 'dirt', 'mountain'],
        weightAdjust: {dessert: 20, plains: 0.5},
        variantGrowthScale: { young_forest: 3.5, dirt_tilled: 0.3 }
    },
    snow: {
        when: {'snow': 2},
        allowedTerrains: ['snow', 'mountain', 'plains', 'dessert', 'dirt'],
        weightAdjust: {snow: 20, mountain: 1, plains: 0.5},
        variantGrowthScale: { young_forest: 2.4 }
    },
    dirt: {
        when: {'dirt': 2},
        allowedTerrains: ['dirt', 'mountain', 'plains', 'forest', 'dessert', 'snow'],
        weightAdjust: {dirt: 20, snow: 8, mountain: 1, plains: 0.5},
        variantGrowthScale: { young_forest: 1.2 }
    }
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
