import { terrainPositions } from '../../core/terrainRegistry';
import { SIDE_NAMES, type Tile } from '../../core/types/Tile';
import type { TerrainKey } from './terrainDefs';
import { axialDistanceCoords, axialDistanceFromOrigin } from './hex';
import { isTileWalkable } from './navigation';
import { ensureTileExists, tileIndex } from './world';

function findNearestTile(
  q: number,
  r: number,
  tileIds: Iterable<string>,
  predicate?: (tile: Tile) => boolean,
): Tile | null {
  let best: Tile | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const id of tileIds) {
    const tile = tileIndex[id];
    if (!tile) continue;
    if (predicate && !predicate(tile)) continue;

    const dist = axialDistanceCoords(q, r, tile.q, tile.r);
    if (dist < bestDist) {
      bestDist = dist;
      best = tile;
    }
  }

  return best;
}

export function findNearestTerrainTile(
  q: number,
  r: number,
  terrain: TerrainKey,
  predicate?: (tile: Tile) => boolean,
): Tile | null {
  return findNearestTile(q, r, terrainPositions[terrain], predicate);
}

export function findNearestTowncenterTile(q: number, r: number): Tile | null {
  return (
    findNearestTerrainTile(q, r, 'towncenter')
    ?? (() => {
      const origin = ensureTileExists(0, 0);
      return origin.terrain === 'towncenter' ? origin : null;
    })()
  );
}

export function getDistanceToNearestTowncenter(q: number, r: number) {
  const towncenter = findNearestTowncenterTile(q, r);
  if (!towncenter) {
    return axialDistanceFromOrigin(q, r);
  }

  return axialDistanceCoords(q, r, towncenter.q, towncenter.r);
}

export function getTileProgressionDistance(tile: Pick<Tile, 'q' | 'r'> | null | undefined) {
  if (!tile) {
    return 0;
  }

  return getDistanceToNearestTowncenter(tile.q, tile.r);
}

export function findNearestWalkableNeighborToTerrain(
  q: number,
  r: number,
  terrain: TerrainKey,
): Tile | null {
  let best: Tile | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const id of terrainPositions[terrain]) {
    const sourceTile = tileIndex[id];
    if (!sourceTile?.discovered) continue;

    const neighbors = sourceTile.neighbors ?? ensureTileExists(sourceTile.q, sourceTile.r).neighbors;
    if (!neighbors) continue;

    for (const side of SIDE_NAMES) {
      const neighbor = neighbors[side];
      if (!neighbor?.discovered || !isTileWalkable(neighbor)) continue;

      const dist = axialDistanceCoords(q, r, neighbor.q, neighbor.r);
      if (dist < bestDist) {
        bestDist = dist;
        best = neighbor;
      }
    }
  }

  return best;
}
