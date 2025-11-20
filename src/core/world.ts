import { ref } from 'vue';
import { weightedTerrainChoice } from './terrain';
import type { TerrainKey } from './terrainDefs';

// Types extracted from idleStore
export type Terrain = TerrainKey;
export type ResourceType = 'wood' | 'ore' | 'stone' | 'food' | 'crystal' | 'artifact';
export interface Tile {
  id: string;
  q: number;
  r: number;
  biome: string | null;
  terrain: Terrain | null;
  discovered: boolean;
}
export interface Road { id: string; a: string; b: string; }

// Reactive world version bump for UI invalidation
export const worldVersion = ref(0);

// World data containers
export const tiles: Tile[] = [];
export const tileIndex: Record<string, Tile> = {};
const radiusOffsetCache = new Map<number, Array<[number, number]>>();
export const worldOuterRadius = ref(0);
// Per-axis discovered radius caches
const maxRadiusByQ = new Map<number, number>();
const maxRadiusByR = new Map<number, number>();

// Generation progress refs
export const generationInProgress = ref(false);
export const generationStatus = ref('');
export const generationProgress = ref(0); // 0-1
export const generationCompleted = ref(0);
export const generationTotal = ref(0);

// Internal world bounds tracking
let minQ = 0, maxQ = 0, minR = 0, maxR = 0;

export function axialKey(q: number, r: number) {
  return `${q},${r}`;
}

export function hexDistance(q: number, r: number): number {
  const dq = Math.abs(q);
  const dr = Math.abs(r);
  const ds = Math.abs(-q - r);
  return Math.max(dq, dr, ds);
}

function indexTile(t: Tile) {
  tileIndex[t.id] = t;
  if (t.q < minQ) minQ = t.q;
  if (t.q > maxQ) maxQ = t.q;
  if (t.r < minR) minR = t.r;
  if (t.r > maxR) maxR = t.r;
  const dist = hexDistance(t.q, t.r);
  if (dist > worldOuterRadius.value) worldOuterRadius.value = dist;
  const qKey = t.q;
  const rKey = t.r;
  const prevQ = maxRadiusByQ.get(qKey) ?? 0;
  if (dist > prevQ) maxRadiusByQ.set(qKey, dist);
  const prevR = maxRadiusByR.get(rKey) ?? 0;
  if (dist > prevR) maxRadiusByR.set(rKey, dist);
}

export function ensureTileExists(q: number, r: number): Tile {
  const id = axialKey(q, r);
  let t = tileIndex[id];
  if (!t) {
    t = { id, q, r, terrain: null, biome: null, discovered: false };
    tiles.push(t);
    indexTile(t);
  }
  return t;
}

export function ensureTileNeighbors(tile: Tile) {
  const neighbors: Array<[number, number]> = [
    [tile.q + 1, tile.r], [tile.q + 1, tile.r - 1], [tile.q, tile.r - 1],
    [tile.q - 1, tile.r], [tile.q - 1, tile.r + 1], [tile.q, tile.r + 1]
  ];
  neighbors.forEach(([q, r]) => ensureTileExists(q, r));
}

export function getNeighborTerrains(tile: Tile, radius: number = 1): Terrain[] {
  const neighbors: TerrainKey[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      if (dq === 0 && dr === 0) continue;
      const nt = tileIndex[axialKey(tile.q + dq, tile.r + dr)];
      if (nt && nt.discovered && nt.terrain) neighbors.push(nt.terrain);
    }
  }
  return neighbors;
}

export function discoverTile(tile: Tile) {
  if (tile.discovered && tile.terrain) return;
  if (tile.q === 0 && tile.r === 0) {
    tile.terrain = 'towncenter';
    tile.discovered = true;
    return;
  }
  const neighborTerrains = getNeighborTerrains(tile);
  const biomeTerrains = getNeighborTerrains(tile, 2);
  const generated = weightedTerrainChoice(neighborTerrains, biomeTerrains);
  tile.biome = generated.biome;
  tile.terrain = generated.terrain;
  tile.discovered = true;
  if (!tileIndex[tile.id]) indexTile(tile);
  ensureTileNeighbors(tile);
  worldVersion.value++;
}

function getRadiusOffsets(radius: number): Array<[number, number]> {
  let cached = radiusOffsetCache.get(radius);
  if (cached) return cached;
  const arr: Array<[number, number]> = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      arr.push([dq, dr]);
    }
  }
  radiusOffsetCache.set(radius, arr);
  return arr;
}

export function getTilesInRadius(centerQ: number, centerR: number, radius: number): Tile[] {
  const offsets = getRadiusOffsets(radius);
  const list: Tile[] = [];
  for (const [dq, dr] of offsets) {
    const t = tileIndex[axialKey(centerQ + dq, centerR + dr)];
    if (t) list.push(t);
  }
  return list;
}

export function ensurePlaceholderRadius(radius: number) {
  if (radius <= worldOuterRadius.value) return;
  const old = worldOuterRadius.value;
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const dist = hexDistance(q, r);
      if (dist > radius || dist <= old) continue;
      ensureTileExists(q, r);
    }
  }
  worldOuterRadius.value = Math.max(worldOuterRadius.value, radius);
}

export function getMaxRadiusFor(q: number, r: number, offset: number): number {
  const iq = Math.round(q);
  const ir = Math.round(r);
  const radQs: number[] = [maxRadiusByQ.get(iq) ?? worldOuterRadius.value];
  const radRs: number[] = [maxRadiusByR.get(ir) ?? worldOuterRadius.value];
  const checkRange = offset;
  for (let d = -checkRange; d <= checkRange; d++) {
    const radQ = maxRadiusByQ.get(iq + d);
    if (radQ !== undefined) radQs.push(radQ);
    const radR = maxRadiusByR.get(ir + d);
    if (radR !== undefined) radRs.push(radR);
  }
  return Math.min(worldOuterRadius.value, Math.max(...radQs), Math.max(...radRs));
}

// Async progressive generation
export async function generateInitialWorld(discoverRadius: number = 4, frameTimeBudgetMs: number = 8) {
  if (generationInProgress.value || generationProgress.value >= 1) return;
  generationInProgress.value = true;
  generationStatus.value = 'Preparing world...';
  generationProgress.value = 0;
  generationCompleted.value = 0;

  discoverTile(ensureTileExists(0, 0));
  const placeholderRadius = discoverRadius + 1;
  const coords: Array<{ q: number; r: number; dist: number }> = [];
  for (let q = 0; q <= placeholderRadius; q++) {
    for (let r = 0; r <= placeholderRadius; r++) {
      const variants: [number, number][] = [[q, r], [-q, r], [q, -r], [-q, -r]];
      for (const [sq, sr] of variants) {
        const dist = hexDistance(sq, sr);
        if (dist > placeholderRadius) continue;
        if (sq === 0 && sr === 0) continue;
        coords.push({ q: sq, r: sr, dist });
      }
    }
  }
  generationTotal.value = coords.length;
  generationStatus.value = 'Generating world...';
  let index = 0;
  function step() {
    const start = performance.now();
    while (index < coords.length && (performance.now() - start) < frameTimeBudgetMs) {
      const entry = coords[index]!;
      index++;
      const { q, r, dist } = entry;
      const t = ensureTileExists(q, r);
      if (dist <= discoverRadius) discoverTile(t);
      generationCompleted.value = index;
    }
    generationProgress.value = generationTotal.value === 0 ? 1 : generationCompleted.value / generationTotal.value;
    generationStatus.value = generationProgress.value >= 1 ? 'Finalizing...' : `Generating tiles ${generationCompleted.value} / ${generationTotal.value}`;
    worldVersion.value++;
    if (index < coords.length) {
      requestAnimationFrame(step);
    } else {
      generationStatus.value = 'World ready';
      generationProgress.value = 1;
      generationInProgress.value = false;
      worldVersion.value++;
    }
  }
  requestAnimationFrame(step);
}

const WORLD_SIZE = 1; // previous seed constant
export function startWorldGeneration(radius: number = WORLD_SIZE) {
  generateInitialWorld(radius);
}

