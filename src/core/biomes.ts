import type {TerrainKey} from './terrainDefs';

export type BiomeKey = 'forest' | 'mountain' | 'lake' | 'plains' | 'dessert' | 'snow' | 'dirt';

export interface BiomeDef {
    // terrain counts required to trigger biome
    when: Partial<Record<TerrainKey, number>>;

    // Optional restriction list: only these terrains can spawn inside biome
    allowedTerrains?: TerrainKey[];

    // Terrains outside the allowed list are damped by this multiplier instead of being removed.
    disallowedMultiplier?: number;

    // Additive weight adjustments applied
    weightAdjust?: Partial<Record<TerrainKey, number>>;

    // variantKey -> multiplier applied to ageMs
    variantGrowthScale?: Record<string, number>;
}

export const BIOME_DEFS: Record<BiomeKey, BiomeDef> = {
    forest: {
        when: {'forest': 5},
        allowedTerrains: ['forest', 'plains', 'dirt', 'grain'],
        disallowedMultiplier: 0.18,
        weightAdjust: {forest: 28, plains: 6, dirt: 2, grain: 2},
        variantGrowthScale: { young_forest: 0.8 }
    },
    mountain: {
        when: {'mountain': 4},
        allowedTerrains: ['mountain', 'snow', 'plains', 'dirt', 'forest'],
        disallowedMultiplier: 0.14,
        weightAdjust: {mountain: 24, snow: 5, plains: 3, dirt: 2, forest: 1},
        variantGrowthScale: { young_forest: 1.3 }
    },
    lake: {
        when: {'water': 6},
        allowedTerrains: ['water', 'plains', 'forest', 'dirt'],
        disallowedMultiplier: 0.08,
        weightAdjust: {water: 28, plains: 6, forest: 4, dirt: 2},
        variantGrowthScale: { young_forest: 0.9, dirt_tilled: 2 }
    },
    plains: {
        when: {'plains': 7},
        allowedTerrains: ['plains', 'forest', 'grain', 'dirt', 'water'],
        disallowedMultiplier: 0.35,
        weightAdjust: {plains: 22, grain: 7, forest: 3, dirt: 2, water: 1},
        variantGrowthScale: { young_forest: 1 }
    },
    dessert: {
        when: {'dessert': 4},
        allowedTerrains: ['dessert', 'dirt', 'plains', 'mountain', 'water'],
        disallowedMultiplier: 0.12,
        weightAdjust: {dessert: 28, dirt: 6, plains: 3, mountain: 3, water: 1},
        variantGrowthScale: { young_forest: 3.5, dirt_tilled: 0.3 }
    },
    snow: {
        when: {'snow': 4},
        allowedTerrains: ['snow', 'mountain', 'plains', 'forest', 'dirt', 'water'],
        disallowedMultiplier: 0.12,
        weightAdjust: {snow: 28, mountain: 7, forest: 2, plains: 2, dirt: 1},
        variantGrowthScale: { young_forest: 2.4 }
    },
    dirt: {
        when: {'dirt': 5},
        allowedTerrains: ['dirt', 'plains', 'forest', 'grain', 'mountain', 'water', 'dessert', 'snow'],
        disallowedMultiplier: 0.28,
        weightAdjust: {dirt: 20, plains: 5, forest: 3, grain: 2, mountain: 2, water: 1},
        variantGrowthScale: { young_forest: 1.2 }
    }
};

export function countTerrainOccurrences(terrains: TerrainKey[]): Partial<Record<TerrainKey, number>> {
    const counts: Partial<Record<TerrainKey, number>> = {};
    terrains.forEach((terrain) => {
        counts[terrain] = (counts[terrain] ?? 0) + 1;
    });
    return counts;
}

function scoreBiome(def: BiomeDef, counts: Partial<Record<TerrainKey, number>>): number | null {
    let requiredTotal = 0;
    let matchedTotal = 0;
    let matchedKinds = 0;

    for (const [terrainKey, requiredCount] of Object.entries(def.when) as [TerrainKey, number][]) {
        const count = counts[terrainKey] ?? 0;
        if (count < requiredCount) {
            return null;
        }
        requiredTotal += requiredCount;
        matchedTotal += count;
        matchedKinds++;
    }

    return (requiredTotal * 2) + ((matchedTotal - requiredTotal) * 0.8) + (matchedKinds * 3);
}

export function detectBiome(neighborTerrains: TerrainKey[]): BiomeKey | null {
    if (!neighborTerrains.length) return null;
    const counts = countTerrainOccurrences(neighborTerrains);
    let winner: { biome: BiomeKey; score: number } | null = null;

    for (const [biomeKey, def] of Object.entries(BIOME_DEFS) as [BiomeKey, BiomeDef][]) {
        const score = scoreBiome(def, counts);
        if (score === null) continue;
        if (!winner || score > winner.score) {
            winner = { biome: biomeKey, score };
        }
    }

    return winner?.biome ?? null;
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
        const multiplier = Math.max(0, Math.min(1, def.disallowedMultiplier ?? 0.18));
        for (const key of Object.keys(weights) as TerrainKey[]) {
            if (!def.allowedTerrains.includes(key)) {
                weights[key] = Math.max(0, (weights[key] ?? 0) * multiplier);
            }
        }
    }

    return weights;
}
