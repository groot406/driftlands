import { resolveWorldTile } from '../../core/worldGeneration.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { SIDE_NAMES, type TileSide } from '../../core/types/Tile.ts';

export const HARBOR_WATER_BODY_THRESHOLD = 12;

const HARBOR_VARIANT_KEYS = new Set([
  'plains_harbor',
  'dirt_harbor',
]);

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
  a: [0, -1],
  b: [1, -1],
  c: [1, 0],
  d: [0, 1],
  e: [-1, 1],
  f: [-1, 0],
};

function key(q: number, r: number) {
  return `${q},${r}`;
}

function axialDistance(a: { q: number; r: number }, b: { q: number; r: number }) {
  return (Math.abs(a.q - b.q)
    + Math.abs(a.q + a.r - b.q - b.r)
    + Math.abs(a.r - b.r)) / 2;
}

function isGeneratedWater(q: number, r: number) {
  return resolveWorldTile(q, r).terrain === 'water';
}

export function isHarborTile(tile: Tile | null | undefined) {
  return !!tile?.variant && HARBOR_VARIANT_KEYS.has(tile.variant);
}

export function listAdjacentGeneratedWater(tile: Pick<Tile, 'q' | 'r'> | null | undefined) {
  if (!tile) {
    return [];
  }

  const result: Array<{ q: number; r: number }> = [];
  for (const side of SIDE_NAMES) {
    const [dq, dr] = SIDE_DELTAS[side];
    const q = tile.q + dq;
    const r = tile.r + dr;
    if (isGeneratedWater(q, r)) {
      result.push({ q, r });
    }
  }

  return result;
}

export function countConnectedGeneratedWater(
  start: { q: number; r: number },
  cap: number = HARBOR_WATER_BODY_THRESHOLD,
) {
  if (cap <= 0 || !isGeneratedWater(start.q, start.r)) {
    return 0;
  }

  const visited = new Set<string>();
  const queue = [start];
  visited.add(key(start.q, start.r));

  for (let index = 0; index < queue.length && visited.size < cap; index++) {
    const current = queue[index]!;
    for (const side of SIDE_NAMES) {
      const [dq, dr] = SIDE_DELTAS[side];
      const q = current.q + dq;
      const r = current.r + dr;
      const coordKey = key(q, r);
      if (visited.has(coordKey) || !isGeneratedWater(q, r)) {
        continue;
      }

      visited.add(coordKey);
      queue.push({ q, r });
      if (visited.size >= cap) {
        break;
      }
    }
  }

  return visited.size;
}

export function getAdjacentWaterBodySize(
  tile: Pick<Tile, 'q' | 'r'> | null | undefined,
  cap: number = HARBOR_WATER_BODY_THRESHOLD,
) {
  let largest = 0;
  for (const water of listAdjacentGeneratedWater(tile)) {
    largest = Math.max(largest, countConnectedGeneratedWater(water, cap));
    if (largest >= cap) {
      return largest;
    }
  }

  return largest;
}

export function hasLargeWaterBodyAdjacent(
  tile: Pick<Tile, 'q' | 'r'> | null | undefined,
  threshold: number = HARBOR_WATER_BODY_THRESHOLD,
) {
  return getAdjacentWaterBodySize(tile, threshold) >= threshold;
}

export interface HarborShipRoute {
  dock: { q: number; r: number };
  origin: { q: number; r: number };
  path: Array<{ q: number; r: number }>;
}

export function findHarborShipRoute(
  tile: Pick<Tile, 'q' | 'r'> | null | undefined,
  maxDistance: number = 18,
): HarborShipRoute | null {
  const docks = listAdjacentGeneratedWater(tile);
  if (!tile || docks.length === 0) {
    return null;
  }

  let best: HarborShipRoute | null = null;
  let bestDistance = -1;
  let bestPathLength = -1;

  for (const dock of docks) {
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    const coords = new Map<string, { q: number; r: number }>();
    const queue = [dock];
    const dockKey = key(dock.q, dock.r);
    visited.add(dockKey);
    parent.set(dockKey, null);
    coords.set(dockKey, dock);

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      for (const side of SIDE_NAMES) {
        const [dq, dr] = SIDE_DELTAS[side];
        const next = { q: current.q + dq, r: current.r + dr };
        const nextKey = key(next.q, next.r);
        if (visited.has(nextKey) || !isGeneratedWater(next.q, next.r)) {
          continue;
        }

        if (axialDistance(dock, next) > maxDistance) {
          continue;
        }

        visited.add(nextKey);
        parent.set(nextKey, key(current.q, current.r));
        coords.set(nextKey, next);
        queue.push(next);
      }
    }

    for (const coord of coords.values()) {
      const distance = axialDistance(tile, coord);
      const coordKey = key(coord.q, coord.r);
      const path: Array<{ q: number; r: number }> = [];
      let cursor: string | null | undefined = coordKey;
      while (cursor) {
        const step = coords.get(cursor);
        if (step) {
          path.push(step);
        }
        cursor = parent.get(cursor);
      }

      const pathLength = path.length;
      if (
        distance > bestDistance
        || (distance === bestDistance && pathLength > bestPathLength)
        || (distance === bestDistance && pathLength === bestPathLength && coordKey.localeCompare(key(best?.origin.q ?? 0, best?.origin.r ?? 0)) < 0)
      ) {
        bestDistance = distance;
        bestPathLength = pathLength;
        best = {
          dock,
          origin: coord,
          path,
        };
      }
    }
  }

  return best;
}
