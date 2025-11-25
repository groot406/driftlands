import { tileIndex, worldVersion } from './world';
import type { Tile } from './world';
import { TERRAIN_DEFS } from './terrainDefs';
import { BIOME_DEFS } from './biomes';

// Track tiles with aging variants
const agingTiles = new Set<string>();

export function registerAgingTile(tile: Tile) {
  if (!tile.variant) return;
  const def = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
  const variantDef = def?.variations?.find(v => v.key === tile.variant);
  if (variantDef?.growth) agingTiles.add(tile.id);
}

// Re-register tiles loaded from persistence
export function registerExistingAgingTiles(tiles: Tile[]) {
  for (const t of tiles) {
    if (!t.discovered || !t.terrain || !t.variant) continue;
    const def = TERRAIN_DEFS[t.terrain];
    const variantDef = def?.variations?.find(v => v.key === t.variant);
    if (variantDef?.growth) agingTiles.add(t.id);
  }
}

export function getEffectiveAgeMs(tile: Tile, growth: { ageMs: number }): number {
  const biome = tile.biome as keyof typeof BIOME_DEFS | null;
  if (!biome) return growth.ageMs;
  const mult = BIOME_DEFS[biome]?.variantGrowthScale?.[tile.variant ?? ''];
  if (!mult || mult === 1) return growth.ageMs;
  return growth.ageMs * mult;
}

export function updateTileGrowth(nowMs: number = Date.now()) {
  if (agingTiles.size === 0) return;
  const toRemove: string[] = [];
  for (const id of agingTiles) {
    const t = tileIndex[id];
    if (!t || !t.discovered || !t.terrain || !t.variant) { toRemove.push(id); continue; }
    const def = TERRAIN_DEFS[t.terrain];
    const variantDef = def?.variations?.find(v => v.key === t.variant);
    if (!variantDef?.growth) { toRemove.push(id); continue; }
    const started = t.variantSetMs ?? 0;
    if (!started) { toRemove.push(id); continue; }
    const { next } = variantDef.growth;
    const effectiveAge = getEffectiveAgeMs(t, variantDef.growth);
    if (nowMs - started >= effectiveAge) {
      // Transition
      t.variant = next; // next null means return to base terrain representation
      t.variantSetMs = next ? nowMs : undefined;
      if (next) {
        // If chain continues, keep tracking
        const nextDef = def?.variations?.find(v => v.key === next);
        if (!nextDef?.growth) {
          toRemove.push(id);
        }
      } else {
        toRemove.push(id);
      }
      worldVersion.value++;
    }
  }
  for (const id of toRemove) agingTiles.delete(id);
}
