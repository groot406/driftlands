// Biome detection and modifiers.
// A biome is inferred from the composition of neighboring terrains.
// Threshold-based heuristic; can evolve later.
import type { TerrainKey } from './terrainDefs';

export type BiomeKey = 'forest' | 'mountain' | 'lake' | 'plains';

export interface BiomeDef {
  // Optional restriction list: only these terrains can spawn inside biome
  allowedTerrains?: TerrainKey[];
  // Additive weight adjustments applied after adjacency deltas
  weightAdjust?: Partial<Record<TerrainKey, number>>;
  // Multipliers applied after additive adjustments
  weightMultiplier?: number;
}

export const BIOME_DEFS: Record<BiomeKey, BiomeDef> = {
  forest: {
    allowedTerrains: ['forest', 'plains', 'ruin'],
    weightAdjust: { forest: 3, ruin: 0.25, plains: 1 },
    weightMultiplier: 1.1,
  },
  mountain: {
    allowedTerrains: ['mountain', 'mine', 'ruin', 'plains'],
    weightAdjust: { mountain: 3, mine: 1.5, ruin: 0.25 },
    weightMultiplier: 1.05,
  },
  lake: {
    allowedTerrains: ['water', 'plains', 'forest'],
    weightAdjust: { water: 2, plains: 1, forest: 0.5 },
    weightMultiplier: 1.1,
  },
  plains: {
    allowedTerrains: ['plains', 'forest', 'mountain', 'water', 'ruin'],
    weightAdjust: { plains: 3 },
    weightMultiplier: 1.0,
  },
};

export function detectBiome(neighborTerrains: TerrainKey[]): BiomeKey | null {
  if (!neighborTerrains.length) return null;
  const counts: Record<string, number> = {};
  neighborTerrains.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  const get = (k: TerrainKey) => counts[k] || 0;

  // Wasteland: ruins cluster or ruin + mine presence
  if (get('forest') >= 4) return 'forest';
    if (get('mountain') >= 4) return 'mountain';
    if (get('plains') >= 4) return 'plains';
    if (get('water') >= 5) return 'lake';
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
        weights[key] *= 0.1; // heavily penalize but not remove to keep fallback diversity
      }
    }
  }
  // Apply multiplier last
  if (def.weightMultiplier && def.weightMultiplier !== 1) {
    for (const key of Object.keys(weights) as TerrainKey[]) {
      weights[key] *= def.weightMultiplier;
    }
  }
  return weights;
}

