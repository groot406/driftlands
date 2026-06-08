import { SIDE_NAMES, type Tile } from '../../core/types/Tile.ts';
import { ensureTileExists } from '../game/world.ts';

export const MINE_BASE_ORE_RESERVE = 48;
export const MINE_ORE_PER_MOUNTAIN_TILE = 16;
export const MINE_BASE_ORE_PER_WORKER = 3;
export const MINE_MAX_ORE_PER_WORKER = 9;
const MINE_CLUSTER_OUTPUT_SCALE = 1.45;

function getNeighbors(tile: Tile) {
    return tile.neighbors ?? ensureTileExists(tile.q, tile.r).neighbors;
}

export function listMountainClusterTiles(origin: Tile | null | undefined): Tile[] {
    if (!origin?.discovered || origin.terrain !== 'mountain') {
        return [];
    }

    const visited = new Set<string>();
    const queue: Tile[] = [origin];
    const cluster: Tile[] = [];

    while (queue.length > 0) {
        const tile = queue.shift()!;
        if (visited.has(tile.id)) {
            continue;
        }

        visited.add(tile.id);
        if (!tile.discovered || tile.terrain !== 'mountain') {
            continue;
        }

        cluster.push(tile);

        const neighbors = getNeighbors(tile);
        if (!neighbors) {
            continue;
        }

        for (const side of SIDE_NAMES) {
            const neighbor = neighbors[side];
            if (neighbor && !visited.has(neighbor.id)) {
                queue.push(neighbor);
            }
        }
    }

    cluster.sort((a, b) => a.id.localeCompare(b.id));
    return cluster;
}

export function getMineClusterOreCapacity(clusterSize: number) {
    if (clusterSize <= 0) {
        return 0;
    }

    return MINE_BASE_ORE_RESERVE + (clusterSize * MINE_ORE_PER_MOUNTAIN_TILE);
}

export function getMineOrePerWorker(clusterSize: number) {
    if (clusterSize <= 0) {
        return 0;
    }

    const clusterBonus = Math.floor(Math.sqrt(Math.max(0, clusterSize - 1)) * MINE_CLUSTER_OUTPUT_SCALE);
    return Math.min(MINE_MAX_ORE_PER_WORKER, MINE_BASE_ORE_PER_WORKER + clusterBonus);
}

export function getMineOrePerCycle(tile: Tile | null | undefined, assignedWorkers: number) {
    if (!tile || assignedWorkers <= 0) {
        return 0;
    }

    return getMineOrePerWorker(listMountainClusterTiles(tile).length) * assignedWorkers;
}
