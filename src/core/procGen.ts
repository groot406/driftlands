// Procedural generation utilities for title background
// Separate from gameplay world so it never conflicts with save/state.
// Provides deterministic lightweight hash + terrain selection + cached hex tile canvas.

import { TERRAIN_DEFS, type TerrainKey, type TerrainVariationDef, type TerrainSide } from './terrainDefs';
import { getClimateProfile, getWorldGenerationSeed, noise01 } from './worldVariation';
import { resolveWorldTile } from './worldGeneration';

// Deterministic cache for selected terrain types to avoid recomputation in neighbor lookups
const typeCache = new Map<string, TerrainKey>();
function key(q: number, r: number): string { return `${getWorldGenerationSeed()}:${q}:${r}`; }

// Axial hex neighbor deltas (pointy-top orientation consistent with game)
const NEIGHBOR_DELTAS: Array<[number, number]> = [
  [+1, 0], [+1, -1], [0, -1], [-1, 0], [-1, +1], [0, +1]
];
// Side order mapping to neighbor deltas (a..f)
const SIDE_ORDER: TerrainSide[] = ['a','b','c','d','e','f'];
const titleSelectionCache = new Map<string, TitleSpriteSelection>();
const TITLE_VARIANT_BASE_WEIGHT_MULTIPLIER = 0.42;

const TITLE_EXTRA_VARIANTS: Partial<Record<TerrainKey, TerrainVariationDef[]>> = {
  water: [
    { key: 'water_reflections', weight: 16, decorative: true },
    { key: 'water_shallows', weight: 14, decorative: true },
    { key: 'water_foam', weight: 9, decorative: true },
    { key: 'water_reeds', weight: 8, decorative: true },
    { key: 'water_islets', weight: 6, decorative: true },
  ],
  forest: [
    { key: 'young_forest', weight: 5, decorative: true, overlayAssetKey: false },
  ],
  grain: [
    { key: 'grain_patchwork', weight: 7, decorative: true },
  ],
  snow: [
    { key: 'snow_pines', weight: 6, decorative: true },
  ],
};

interface TitleSpriteSelection {
  terrain: TerrainKey;
  variant: TerrainVariationDef | null;
  assetKey: string;
}

function getBaseWorldTerrain(q: number, r: number): TerrainKey {
  return resolveWorldTile(q, r).terrain;
}

function countBaseWaterNeighbors(q: number, r: number): number {
  let waterNeighbors = 0;
  for (const [dq, dr] of NEIGHBOR_DELTAS) {
    if (getBaseWorldTerrain(q + dq, r + dr) === 'water') {
      waterNeighbors++;
    }
  }
  return waterNeighbors;
}

function getTitleLandFillTerrain(q: number, r: number): TerrainKey {
  const counts = new Map<TerrainKey, number>();

  for (const [dq, dr] of NEIGHBOR_DELTAS) {
    const terrain = getBaseWorldTerrain(q + dq, r + dr);
    if (terrain !== 'water' && terrain !== 'vulcano' && terrain !== 'towncenter') {
      counts.set(terrain, (counts.get(terrain) ?? 0) + 2);
    }
  }

  for (let dq = -2; dq <= 2; dq++) {
    for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
      if (dq === 0 && dr === 0) continue;
      const terrain = getBaseWorldTerrain(q + dq, r + dr);
      if (terrain !== 'water' && terrain !== 'vulcano' && terrain !== 'towncenter') {
        counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
      }
    }
  }

  if (counts.size > 0) {
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  }

  const roll = noise01(q, r, 1609);
  if (roll < 0.42) return 'plains';
  if (roll < 0.62) return 'dirt';
  if (roll < 0.8) return 'forest';
  if (roll < 0.91) return 'grain';
  if (roll < 0.97) return 'mountain';
  return 'dessert';
}

function shouldThinTitleWater(q: number, r: number): boolean {
  const waterNeighbors = countBaseWaterNeighbors(q, r);
  const roll = (noise01(q, r, 1433) * 0.72) + (noise01(q + r, q - r, 1434) * 0.28);
  const landChance = waterNeighbors <= 2
    ? 0.84
    : waterNeighbors === 3
      ? 0.65
      : waterNeighbors === 4
        ? 0.42
        : waterNeighbors === 5
          ? 0.19
          : 0.06;

  return roll < landChance;
}

// Title/background tiles start from the game resolver, then apply presentation-only tweaks.
export function getTileType(q: number, r: number): TerrainKey {
  const k = key(q, r);
  const cached = typeCache.get(k);
  if (cached) return cached;

  const generated = getBaseWorldTerrain(q, r);
  if (generated === 'water' && shouldThinTitleWater(q, r)) {
    const terrain = getTitleLandFillTerrain(q, r);
    typeCache.set(k, terrain);
    return terrain;
  }

  typeCache.set(k, generated);
  return generated;
}

// Optional: color mapping for terrain using TERRAIN_DEFS
export function terrainColor(t: TerrainKey): string {
  return TERRAIN_DEFS[t]?.color ?? '#444f53';
}

// Build a cached hex tile canvas for faster draws.
const tileCache = new Map<TerrainKey, HTMLCanvasElement>();

export interface HexGeom { HEX_SIZE: number; }

export function getCachedTile(t: TerrainKey, geom: HexGeom): HTMLCanvasElement {
  const existing = tileCache.get(t);
  if (existing) return existing;
  const size = (geom.HEX_SIZE * 2) - 2; // draw span similar to game tiles minus small spacing
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const w = size;
  const h = size;

  // Clip to hex
  g.save();
  g.beginPath();
  g.moveTo(0.5 * w, 0);
  g.lineTo(w, 0.25 * h);
  g.lineTo(w, 0.75 * h);
  g.lineTo(0.5 * w, h);
  g.lineTo(0, 0.75 * h);
  g.lineTo(0, 0.25 * h);
  g.closePath();
  g.clip();

  // Base fill
  g.fillStyle = terrainColor(t);
  g.fillRect(0, 0, w, h);

  // Subtle texture variation: lighter/darker splotches
  const splotchCount = 4;
  for (let i = 0; i < splotchCount; i++) {
    const sx = noise01(i * 7, t.length, 501) * w;
    const sy = noise01(t.length, i * 11, 502) * h;
    const sr = w * (0.12 + noise01(i, t.length, 503) * 0.18);
    const lighter = i % 2 === 0;
    const sGrad = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    if (lighter) {
      sGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
      sGrad.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      sGrad.addColorStop(0, 'rgba(0,0,0,0.06)');
      sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    g.fillStyle = sGrad;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
  }

  // Terrain-specific micro-details
  const detailCount = 3 + Math.floor(noise01(t.length, 0, 510) * 3);
  for (let i = 0; i < detailCount; i++) {
    const dx = noise01(i * 3, t.length * 2, 520) * w * 0.7 + w * 0.15;
    const dy = noise01(t.length * 2, i * 5, 521) * h * 0.7 + h * 0.15;

    if (t === 'plains' || t === 'grain') {
      // Grass blade
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(dx, dy);
      g.lineTo(dx + (noise01(i, 0, 530) - 0.5) * 4, dy - 3 - noise01(0, i, 531) * 3);
      g.stroke();
    } else if (t === 'dirt' || t === 'mountain') {
      // Pebble dot
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.arc(dx, dy, 0.8 + noise01(i, 0, 540), 0, Math.PI * 2);
      g.fill();
    } else if (t === 'dessert') {
      // Sand grain
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.beginPath();
      g.arc(dx, dy, 0.5 + noise01(i, 0, 550) * 0.8, 0, Math.PI * 2);
      g.fill();
    } else if (t === 'water') {
      // Ripple arc
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(dx, dy, 2 + noise01(i, 0, 560) * 3, 0, Math.PI * 0.6);
      g.stroke();
    } else if (t === 'snow') {
      // Ice sparkle
      g.fillStyle = 'rgba(255,255,255,0.12)';
      const sparkleSize = 0.6 + noise01(i, 0, 570) * 0.6;
      g.fillRect(dx - sparkleSize / 2, dy - sparkleSize / 2, sparkleSize, sparkleSize);
    } else if (t === 'forest') {
      // Tree dot cluster
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath();
      g.arc(dx, dy, 1.2 + noise01(i, 0, 580) * 1.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Inner glow matching terrain hue
  const innerGlow = g.createRadialGradient(w * 0.45, h * 0.38, 0, w * 0.5, h * 0.5, w * 0.48);
  innerGlow.addColorStop(0, 'rgba(255,255,255,0.07)');
  innerGlow.addColorStop(0.6, 'rgba(255,255,255,0.02)');
  innerGlow.addColorStop(1, 'rgba(0,0,0,0.05)');
  g.fillStyle = innerGlow;
  g.fillRect(0, 0, w, h);

  g.restore();

  tileCache.set(t, c);
  return c;
}

// Helper to fetch neighbor terrain by side
function getNeighborBySide(q: number, r: number, side: TerrainSide): TerrainKey | null {
  const idx = SIDE_ORDER.indexOf(side);
  if (idx < 0 || idx >= NEIGHBOR_DELTAS.length) return null;
  const d = NEIGHBOR_DELTAS[idx];
  if (!d) return null;
  const nq = q + d[0]; const nr = r + d[1];
  return getTileType(nq, nr) ?? null;
}

export interface TileSelection { terrain: TerrainKey; variant: TerrainVariationDef | null }

export function getTileSelection(q: number, r: number): TileSelection {
  const selection = getTitleSpriteSelection(q, r);
  return { terrain: selection.terrain, variant: selection.variant };
}

// Derive sprite key for image loading: prefer variant assetKey/key, else terrain assetKey or terrain key
export function getTileSpriteKey(q: number, r: number): string {
  return getTitleSpriteSelection(q, r).assetKey;
}

function getSelectionCacheKey(q: number, r: number, terrain: TerrainKey): string {
  const neighborSignature = SIDE_ORDER.map(side => getNeighborBySide(q, r, side) ?? '_').join('.');
  return `${getWorldGenerationSeed()}:${q},${r}:${terrain}:${neighborSignature}`;
}

function matchesTitleVariantConstraints(
  q: number,
  r: number,
  variant: TerrainVariationDef,
  getNeighborTerrain: (side: TerrainSide) => TerrainKey | null,
): boolean {
  const climate = getClimateProfile(q, r);

  if (variant.minMoisture !== undefined && climate.moisture < variant.minMoisture) return false;
  if (variant.maxMoisture !== undefined && climate.moisture > variant.maxMoisture) return false;
  if (variant.minTemperature !== undefined && climate.temperature < variant.minTemperature) return false;
  if (variant.maxTemperature !== undefined && climate.temperature > variant.maxTemperature) return false;
  if (variant.minRuggedness !== undefined && climate.ruggedness < variant.minRuggedness) return false;
  if (variant.maxRuggedness !== undefined && climate.ruggedness > variant.maxRuggedness) return false;

  for (const constraint of variant.constraints ?? []) {
    const neighbor = getNeighborTerrain(constraint.side);
    if (!neighbor) {
      if (constraint.allowUndiscovered) continue;
      return false;
    }
    if (!constraint.anyOf.includes(neighbor)) return false;
  }

  return true;
}

function getTitleVariantPool(terrain: TerrainKey): TerrainVariationDef[] {
  const def = TERRAIN_DEFS[terrain];
  const byKey = new Map<string, TerrainVariationDef>();

  for (const variant of def.decorativeVariants ?? []) {
    if ((variant.weight ?? 1) > 0) {
      byKey.set(variant.key, variant);
    }
  }

  for (const variant of def.variations ?? []) {
    if (variant.decorative && (variant.weight ?? 1) > 0) {
      byKey.set(variant.key, variant);
    }
  }

  for (const variant of TITLE_EXTRA_VARIANTS[terrain] ?? []) {
    byKey.set(variant.key, variant);
  }

  return Array.from(byKey.values());
}

function getTitleSpriteSelection(q: number, r: number): TitleSpriteSelection {
  const terrain = getTileType(q, r);
  const cacheKey = getSelectionCacheKey(q, r, terrain);
  const cached = titleSelectionCache.get(cacheKey);
  if (cached) return cached;

  const def = TERRAIN_DEFS[terrain];
  const baseAssetKey = def.assetKey ?? terrain;
  const variants = getTitleVariantPool(terrain);
  const eligible = variants.filter(variant => (
    matchesTitleVariantConstraints(q, r, variant, side => getNeighborBySide(q, r, side))
  ));

  if (!eligible.length) {
    const selection = { terrain, variant: null, assetKey: baseAssetKey };
    titleSelectionCache.set(cacheKey, selection);
    return selection;
  }

  const baseWeight = Math.max(0, (def.decorativeBaseWeight ?? 18) * TITLE_VARIANT_BASE_WEIGHT_MULTIPLIER);
  const variantWeight = eligible.reduce((sum, variant) => sum + Math.max(0, variant.weight ?? 1), 0);
  const total = baseWeight + variantWeight;

  if (total <= 0) {
    const selection = { terrain, variant: null, assetKey: baseAssetKey };
    titleSelectionCache.set(cacheKey, selection);
    return selection;
  }

  let roll = ((noise01(q, r, 811) * 0.58) + (noise01(q + r, r - q, 812) * 0.42)) * total;
  if (roll < baseWeight) {
    const selection = { terrain, variant: null, assetKey: baseAssetKey };
    titleSelectionCache.set(cacheKey, selection);
    return selection;
  }

  roll -= baseWeight;
  for (const variant of eligible) {
    const weight = Math.max(0, variant.weight ?? 1);
    if (roll <= weight) {
      const selection = {
        terrain,
        variant,
        assetKey: variant.assetKey ?? variant.key,
      };
      titleSelectionCache.set(cacheKey, selection);
      return selection;
    }
    roll -= weight;
  }

  const fallback = eligible[eligible.length - 1];
  const selection = {
    terrain,
    variant: fallback ?? null,
    assetKey: fallback?.assetKey ?? fallback?.key ?? baseAssetKey,
  };
  titleSelectionCache.set(cacheKey, selection);
  return selection;
}
