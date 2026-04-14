import { SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile.ts';
import { isTileWalkable } from './navigation.ts';
import { tileIndex } from './world.ts';

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
  a: [0, -1],
  b: [1, -1],
  c: [1, 0],
  d: [0, 1],
  e: [-1, 1],
  f: [-1, 0],
};

export function isDockLandAccessTile(tile: Tile | null | undefined) {
  return !!tile && tile.discovered && tile.terrain !== 'water' && isTileWalkable(tile);
}

export function listDockAccessTiles(tile: Tile | null | undefined) {
  if (!tile || tile.terrain !== 'water') {
    return [];
  }

  const result: Tile[] = [];
  for (const side of SIDE_NAMES) {
    const [dq, dr] = SIDE_DELTAS[side];
    const neighbor = tile.neighbors?.[side] ?? tileIndex[`${tile.q + dq},${tile.r + dr}`] ?? null;
    if (isDockLandAccessTile(neighbor)) {
      result.push(neighbor);
    }
  }

  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
