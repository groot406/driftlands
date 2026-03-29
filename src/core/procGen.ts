// Procedural generation utilities for title background
// Separate from gameplay world so it never conflicts with save/state.
// Provides deterministic lightweight hash + terrain selection + cached hex tile canvas.

import { TERRAIN_DEFS, type TerrainKey, type TerrainVariationDef, type TerrainSide } from './terrainDefs';
import { applyBiomeModifiers, detectBiome } from './biomes';
import { getDecorativeSelectionForTerrain } from './tileVisuals';
import { applyRegionalTerrainBias, noise01 } from './worldVariation';

// Precompute terrain keys once to avoid repeated Object.keys casts
const TERRAIN_KEYS = Object.keys(TERRAIN_DEFS) as TerrainKey[];
const DEFAULT_TERRAIN: TerrainKey = 'plains';

function getFallbackTerrainKey(): TerrainKey {
  return TERRAIN_KEYS[0] ?? DEFAULT_TERRAIN;
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
      const roll = noise01(nq, nr, 1);
      const len = TERRAIN_KEYS.length;
      const idx = len > 0 ? Math.min(Math.floor(roll * len), len - 1) : -1;
      const candidate: TerrainKey = (len > 0 && idx >= 0) ? (TERRAIN_KEYS[idx] ?? getFallbackTerrainKey()) : DEFAULT_TERRAIN;
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
    const jitter = (noise01(q, r, t.length) - 0.5) * 0.8;
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
  applyRegionalTerrainBias(finalWeights, q, r);

  // Weighted pick using deterministic roll
  let total = 0;
  for (const t of TERRAIN_KEYS) total += finalWeights[t] || 0;
  if (total <= 0) {
    // Fallback: choose the highest base weight terrain
    let best: TerrainKey = getFallbackTerrainKey();
    for (const t of TERRAIN_KEYS) {
      if (TERRAIN_DEFS[t].baseWeight > TERRAIN_DEFS[best].baseWeight) best = t;
    }
    typeCache.set(k, best);
    return best;
  }

  const roll = noise01(q, r, 42) * total;
  let acc = 0;
  for (const t of TERRAIN_KEYS) {
    acc += finalWeights[t] || 0;
    if (roll <= acc) {
      typeCache.set(k, t);
      return t;
    }
  }
  // Numerical edge fallback
  let first: TerrainKey = getFallbackTerrainKey();
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
  const terrain = getTileType(q, r);
  const selection = getDecorativeSelectionForTerrain(q, r, terrain, side => getNeighborBySide(q, r, side));
  return { terrain, variant: selection.variant };
}

// Derive sprite key for image loading: prefer variant assetKey/key, else terrain assetKey or terrain key
export function getTileSpriteKey(q: number, r: number): string {
  const terrain = getTileType(q, r);
  return getDecorativeSelectionForTerrain(q, r, terrain, side => getNeighborBySide(q, r, side)).assetKey;
}
