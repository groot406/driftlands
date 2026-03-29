import { SIDE_NAMES, type Tile } from '../../core/types/Tile';
import { ensureTileExists } from './world';

export function collectTerrainCluster(origin: Tile, maxSize = 999): Tile[] {
  if (!origin.discovered || !origin.terrain) return [];

  const terrain = origin.terrain;
  const visited = new Set<string>();
  const cluster: Tile[] = [];
  const queue: Tile[] = [origin];

  while (queue.length && visited.size < maxSize) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    if (!current.discovered || current.terrain !== terrain) continue;

    visited.add(current.id);
    cluster.push(current);

    const neighbors = current.neighbors ?? ensureTileExists(current.q, current.r).neighbors!;
    for (const side of SIDE_NAMES) {
      const next = neighbors[side];
      if (!next) continue;
      if (!visited.has(next.id) && next.discovered && next.terrain === terrain) {
        queue.push(next);
      }
    }
  }

  return cluster;
}
