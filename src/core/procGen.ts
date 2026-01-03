// Procedural generation utilities for title background
// Separate from gameplay world so it never conflicts with save/state.
// Provides deterministic lightweight hash + terrain selection + cached hex tile canvas.

import { TERRAIN_DEFS, type TerrainKey, type TerrainVariationDef, type TerrainSide } from './terrainDefs';
import { applyBiomeModifiers, detectBiome } from './biomes';

// Precompute terrain keys once to avoid repeated Object.keys casts
const TERRAIN_KEYS = Object.keys(TERRAIN_DEFS) as TerrainKey[];

// 32-bit integer hash based on coordinates (q,r)
export function hash32(q: number, r: number): number {
  let x = (q * 374761393) ^ (r * 668265263);
  x = (x ^ (x >>> 13)) * 1274126177;
  x = (x ^ (x >>> 16));
  return x >>> 0; // ensure unsigned
}

// Normalized float 0..1
function n01(q: number, r: number, salt = 10): number {
  return hash32(q + salt * 17, r - salt * 31) / 0xffffffff;
}

// Axial hex neighbor deltas (pointy-top orientation consistent with game)
const NEIGHBOR_DELTAS: Array<[number, number]> = [
  [+1, 0], [+1, -1], [0, -1], [-1, 0], [-1, +1], [0, +1]
];
// Side order mapping to neighbor deltas (a..f)
const SIDE_ORDER: TerrainSide[] = ['a','b','c','d','e','f'];

// Deterministic cache for selected terrain types to avoid recomputation in neighbor lookups
const typeCache = new Map<string, TerrainKey>();
function key(q: number, r: number): string { return `${q}:${r}`; }

// Deterministic terrain selection using TERRAIN_DEFS + adjacency + biome modifiers
export function getTileType(q: number, r: number): TerrainKey {
  const k = key(q, r);
  const cached = typeCache.get(k);
  if (cached) return cached;

  // Gather neighbor terrain types deterministically (will recursively populate cache)
  const neighborTerrains: TerrainKey[] = [];
  for (const [dq, dr] of NEIGHBOR_DELTAS) {
    const nq = q + dq;
    const nr = r + dr;
    const nk = key(nq, nr);
    const existing = typeCache.get(nk);
    if (existing) {
      neighborTerrains.push(existing);
    } else {
      // Use a cheap pre-roll based purely on noise for neighbors not yet computed to break symmetry
      const roll = n01(nq, nr, 1);
      const len = TERRAIN_KEYS.length;
      const idx = len > 0 ? Math.min(Math.floor(roll * len), len - 1) : -1;
      const candidate: TerrainKey = (len > 0 && idx >= 0) ? (TERRAIN_KEYS[idx] ?? TERRAIN_KEYS[0]) : ('plains' as TerrainKey);
      neighborTerrains.push(candidate);
    }
  }

  // Initialize weights from baseWeight, respecting minDistanceFromCenter
  const dist = Math.sqrt(q*q + r*r);
  const weights: Record<TerrainKey, number> = {} as Record<TerrainKey, number>;
  TERRAIN_KEYS.forEach(t => {
    const def = TERRAIN_DEFS[t];
    const minDist = def.minDistanceFromCenter ?? 0;
    const base = dist < minDist ? 0 : def.baseWeight;
    // Add a tiny deterministic jitter to avoid ties
    const jitter = (n01(q, r, t.length) - 0.5) * 0.8;
    weights[t] = Math.max(0, base + jitter);
  });

  // Apply adjacency deltas based on neighbor terrains
  for (const nt of neighborTerrains) {
    for (const t of TERRAIN_KEYS) {
      const adj = TERRAIN_DEFS[t].adjacency?.[nt];
      if (adj) weights[t] = Math.max(0, (weights[t] ?? 0) + adj);
    }
  }

  // Detect biome and apply biome-specific modifiers
  const biome = detectBiome(neighborTerrains) ?? 'plains';

  const finalWeights = applyBiomeModifiers(biome, weights);

  // Weighted pick using deterministic roll
  let total = 0;
  for (const t of TERRAIN_KEYS) total += finalWeights[t] || 0;
  if (total <= 0) {
    // Fallback: choose the highest base weight terrain
    let best: TerrainKey = 'plains' as TerrainKey;
    if (TERRAIN_KEYS.length > 0) best = TERRAIN_KEYS[0];
    for (const t of TERRAIN_KEYS) {
      if (TERRAIN_DEFS[t].baseWeight > TERRAIN_DEFS[best].baseWeight) best = t;
    }
    typeCache.set(k, best);
    return best;
  }

  const roll = n01(q, r, 42) * total;
  let acc = 0;
  for (const t of TERRAIN_KEYS) {
    acc += finalWeights[t] || 0;
    if (roll <= acc) {
      typeCache.set(k, t);
      return t;
    }
  }
  // Numerical edge fallback
  let first: TerrainKey = 'plains' as TerrainKey;
  if (TERRAIN_KEYS.length > 0) first = TERRAIN_KEYS[0];
  typeCache.set(k, first);
  return first;
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
  g.fillStyle = terrainColor(t);
  g.beginPath();
  g.moveTo(0.5 * w, 0);
  g.lineTo(w, 0.25 * h);
  g.lineTo(w, 0.75 * h);
  g.lineTo(0.5 * w, h);
  g.lineTo(0, 0.75 * h);
  g.lineTo(0, 0.25 * h);
  g.closePath();
  g.fill();
  // Subtle inner highlight
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.beginPath();
  g.moveTo(0.5 * w, 2);
  g.lineTo(w-2, 0.25 * h + 1);
  g.lineTo(w-2, 0.55 * h);
  g.lineTo(0.5 * w, h-2);
  g.lineTo(2, 0.55 * h);
  g.lineTo(2, 0.25 * h + 1);
  g.closePath();
  g.fill();
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

// Select a valid variant for a terrain given neighbors; returns the variant def or null.
export function selectVariant(q: number, r: number, terrain: TerrainKey): TerrainVariationDef | null {
  const def = TERRAIN_DEFS[terrain];
  const variants = def.variations ?? [];
  if (!variants.length) return null;

  // 75% chance to have no variant
    const rollNoVariant = n01(q, r, 99);
    if (rollNoVariant < 0.85) return null;

  // Filter by constraints
  const eligible: TerrainVariationDef[] = variants.filter(v => {
    const constraints = v.constraints ?? [];
    for (const c of constraints) {
      const neighbor = getNeighborBySide(q, r, c.side);
      if (!neighbor) {
        if (c.allowUndiscovered) continue; else return false;
      }
      if (!c.anyOf.includes(neighbor)) return false;
    }
    return true;
  });
  const pool = eligible.length ? eligible : variants; // if none matched, fall back to any

  // Weighted pick using variationBaseWeight * variant.weight
  const baseW = def.variationBaseWeight ?? 1;
  let total = 0;
  for (const v of pool) total += (v.weight ?? 1) * baseW;
  const roll = n01(q, r, 77) * total;
  let acc = 0;
  for (const v of pool) {
    acc += (v.weight ?? 1) * baseW;
    if (roll <= acc) return v;
  }
  return pool[0] ?? null;
}

export interface TileSelection { terrain: TerrainKey; variant: TerrainVariationDef | null }

export function getTileSelection(q: number, r: number): TileSelection {
  const terrain = getTileType(q, r);
  const variant = selectVariant(q, r, terrain);
  return { terrain, variant };
}

// Derive sprite key for image loading: prefer variant assetKey/key, else terrain assetKey or terrain key
export function getTileSpriteKey(q: number, r: number): string {
  const { terrain, variant } = getTileSelection(q, r);
  if (variant) return (variant.assetKey ?? variant.key);
  return (TERRAIN_DEFS[terrain].assetKey ?? terrain);
}
