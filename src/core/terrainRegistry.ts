import { TERRAIN_DEFS } from './terrainDefs';
import type { TerrainKey } from './terrainDefs';

// Dynamically derive terrain position sets from definitions
export const terrainPositions: Record<TerrainKey, Set<string>> = Object.fromEntries(
  Object.keys(TERRAIN_DEFS).map(k => [k, new Set<string>()])
) as Record<TerrainKey, Set<string>>;

// Collect all variant keys declared across terrain definitions
const variantKeys = new Set<string>();
for (const def of Object.values(TERRAIN_DEFS)) {
  for (const v of def.variations ?? []) variantKeys.add(v.key);
}
export const variantPositions: Record<string, Set<string>> = Object.fromEntries(
  Array.from(variantKeys).map(k => [k, new Set<string>()])
) as Record<string, Set<string>>;

export function getVariantSet(key: string): Set<string> {
  let s = variantPositions[key];
  if (!s) { s = new Set<string>(); variantPositions[key] = s; }
  return s;
}

export function resetTerrainRegistry() {
  for (const positions of Object.values(terrainPositions)) positions.clear();
  for (const positions of Object.values(variantPositions)) positions.clear();
}

export function indexTileInRegistry(tile: { id: string; terrain: TerrainKey | null; variant?: string | null }) {
  if (tile.terrain) terrainPositions[tile.terrain].add(tile.id);
  if (tile.variant) getVariantSet(tile.variant).add(tile.id);
}

export function updateTileVariantIndex(tileId: string, prev: string | null | undefined, next: string | null | undefined) {
  if (prev && variantPositions[prev]) variantPositions[prev].delete(tileId);
  if (next) {
    const set = getVariantSet(next);
    set.add(tileId);
  }
}
