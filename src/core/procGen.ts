// Procedural generation utilities for title background
// Separate from gameplay world so it never conflicts with save/state.
// Provides deterministic lightweight hash + terrain selection + cached hex tile canvas.

export type ProcTerrain = 'water' | 'mountain' | 'ruin' | 'forest' | 'plains';

// 32-bit integer hash based on coordinates (q,r)
export function hash32(q: number, r: number): number {
  let x = (q * 374761393) ^ (r * 668265263);
  x = (x ^ (x >>> 13)) * 1274126177;
  x = (x ^ (x >>> 16));
  return x >>> 0; // ensure unsigned
}

// Normalized float 0..1
function n01(q: number, r: number, salt = 0): number {
  return hash32(q + salt * 17, r - salt * 31) / 0xffffffff;
}

// Deterministic terrain selection with simple distribution thresholds.
// Intent: atmospheric mix; more forest+plains, sparse water/mountains/ruins.
export function getTileType(q: number, r: number): ProcTerrain {
  const v = n01(q, r);
  if (v < 0.045) return 'water';
  if (v < 0.085) return 'mountain';
  if (v < 0.105) return 'ruin';
  // Secondary noise to diversify forest/plains patches
  const v2 = n01(q, r, 2);
  return v2 < 0.55 ? 'forest' : 'plains';
}

// Optional: color mapping for terrain (muted palette; blurred later)
export function terrainColor(t: ProcTerrain): string {
  switch (t) {
    case 'water': return '#123d68';
    case 'mountain': return '#5b5f68';
    case 'ruin': return '#6b4f4f';
    case 'forest': return '#1f5130';
    case 'plains': return '#5d7d3a';
  }
}

// Build a cached hex tile canvas for faster draws.
const tileCache = new Map<ProcTerrain, HTMLCanvasElement>();

export interface HexGeom { HEX_SIZE: number; }

export function getCachedTile(t: ProcTerrain, geom: HexGeom): HTMLCanvasElement {
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
