import type { Hero } from '../../core/types/Hero';
import type { TaskType } from '../../core/types/Task';
import { SIDE_NAMES, type Tile, type TileSide } from '../../core/types/Tile';
import { TERRAIN_DEFS } from '../../core/terrainDefs.ts';
import { resolveWorldTile } from '../../core/worldGeneration.ts';
import { axialDistanceCoords } from '../game/hex';
import { listBridgeAccessTiles, listTunnelAccessTiles } from '../game/bridges.ts';
import { listDockAccessTiles } from '../game/docks.ts';
import { isTileWalkable } from '../game/navigation';
import {
    findNearestActiveAdjacentAccessTile,
    isTileActive,
    listActiveAdjacentAccessTiles,
} from '../game/state/settlementSupportStore';
import { tileIndex } from '../game/world';

const ADJACENT_ACTIVE_ACCESS_TASKS = new Set<string>([
    'buildDock',
    'buildBridge',
    'buildTunnel',
]);

const ADJACENT_WALKABLE_ACCESS_TASKS = new Set<string>([
    'harvestWaterLilies',
    'placeWaterLilies',
]);

export function taskUsesAdjacentActiveAccess(taskType: TaskType | string | null | undefined) {
    return !!taskType && ADJACENT_ACTIVE_ACCESS_TASKS.has(taskType);
}

export function taskUsesAdjacentWalkableAccess(taskType: TaskType | string | null | undefined) {
    return !!taskType && ADJACENT_WALKABLE_ACCESS_TASKS.has(taskType);
}

export function taskUsesAdjacentAccess(taskType: TaskType | string | null | undefined) {
    return taskUsesAdjacentActiveAccess(taskType) || taskUsesAdjacentWalkableAccess(taskType);
}

export type TaskAccessMode = 'tile' | 'adjacent_active' | 'adjacent_walkable';

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
    a: [0, -1],
    b: [1, -1],
    c: [1, 0],
    d: [0, 1],
    e: [-1, 1],
    f: [-1, 0],
};

function isHiddenTileWalkable(tile: Tile | null | undefined) {
    if (!tile) {
        return false;
    }

    if (tile.terrain) {
        return isTileWalkable(tile);
    }

    const resolved = resolveWorldTile(tile.q, tile.r);
    return !!TERRAIN_DEFS[resolved.terrain]?.walkable;
}

export function getTaskAccessMode(
    taskType: TaskType | string | null | undefined,
    tile: Tile | null | undefined,
): TaskAccessMode {
    if (taskUsesAdjacentActiveAccess(taskType)) {
        return 'adjacent_active';
    }

    if (taskUsesAdjacentWalkableAccess(taskType)) {
        return 'adjacent_walkable';
    }

    if (tile && !isHiddenTileWalkable(tile)) {
        return 'adjacent_walkable';
    }

    return 'tile';
}

function listAdjacentWalkableAccessTiles(tile: Tile | null | undefined) {
    if (!tile) return [];

    const result: Tile[] = [];
    for (const side of SIDE_NAMES) {
        const [dq, dr] = SIDE_DELTAS[side];
        const neighbor = tile.neighbors?.[side] ?? tileIndex[`${tile.q + dq},${tile.r + dr}`] ?? null;
        if (neighbor?.discovered && isTileWalkable(neighbor)) {
            result.push(neighbor);
        }
    }

    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
}

function listBridgeAdjacentActiveAccessTiles(tile: Tile | null | undefined) {
    return listBridgeAccessTiles(tile).filter((candidate) => candidate.discovered && isTileActive(candidate));
}

function listDockAdjacentActiveAccessTiles(tile: Tile | null | undefined) {
    return listDockAccessTiles(tile).filter((candidate) => isTileActive(candidate));
}

function listTunnelAdjacentActiveAccessTiles(tile: Tile | null | undefined) {
    return listTunnelAccessTiles(tile).filter((candidate) => candidate.discovered && isTileActive(candidate));
}

function findNearestCandidateByDistance(candidates: Tile[], fromQ: number, fromR: number) {
    let best: Tile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const distance = axialDistanceCoords(fromQ, fromR, candidate.q, candidate.r);
        if (distance < bestDistance || (distance === bestDistance && candidate.id.localeCompare(best?.id ?? candidate.id) < 0)) {
            best = candidate;
            bestDistance = distance;
        }
    }

    return best;
}

export function listTaskAccessTiles(
    taskType: TaskType | string | null | undefined,
    tile: Tile | null | undefined,
) {
    if (taskType === 'buildDock') {
        return listDockAdjacentActiveAccessTiles(tile);
    }

    if (taskType === 'buildBridge') {
        return listBridgeAdjacentActiveAccessTiles(tile);
    }

    if (taskType === 'buildTunnel') {
        return listTunnelAdjacentActiveAccessTiles(tile);
    }

    const mode = getTaskAccessMode(taskType, tile);

    if (mode === 'adjacent_active') {
        return listActiveAdjacentAccessTiles(tile);
    }

    if (mode === 'adjacent_walkable') {
        return listAdjacentWalkableAccessTiles(tile);
    }

    return tile ? [tile] : [];
}

export function findNearestTaskAccessTile(
    taskType: TaskType | string | null | undefined,
    tile: Tile | null | undefined,
    fromQ: number,
    fromR: number,
) {
    if (!tile) return null;

    if (taskType === 'buildDock') {
        return findNearestCandidateByDistance(listDockAdjacentActiveAccessTiles(tile), fromQ, fromR);
    }

    if (taskType === 'buildBridge') {
        return findNearestCandidateByDistance(listBridgeAdjacentActiveAccessTiles(tile), fromQ, fromR);
    }

    if (taskType === 'buildTunnel') {
        return findNearestCandidateByDistance(listTunnelAdjacentActiveAccessTiles(tile), fromQ, fromR);
    }

    const mode = getTaskAccessMode(taskType, tile);

    if (mode === 'adjacent_active') {
        return findNearestActiveAdjacentAccessTile(tile, fromQ, fromR);
    }

    if (mode === 'adjacent_walkable') {
        return findNearestCandidateByDistance(listAdjacentWalkableAccessTiles(tile), fromQ, fromR);
    }

    return tile;
}

export function isHeroAtTaskAccess(
    hero: Pick<Hero, 'q' | 'r'> | null | undefined,
    taskType: TaskType | string | null | undefined,
    tile: Tile | null | undefined,
) {
    if (!hero || !tile) return false;

    const mode = getTaskAccessMode(taskType, tile);

    if (mode === 'tile') {
        return hero.q === tile.q && hero.r === tile.r;
    }

    const heroTile = tileIndex[`${hero.q},${hero.r}`] ?? null;
    if (!heroTile || !heroTile.discovered || !isTileWalkable(heroTile)) {
        return false;
    }

    if (mode === 'adjacent_active' && !isTileActive(heroTile)) {
        return false;
    }

    return listTaskAccessTiles(taskType, tile).some((candidate) => candidate.id === heroTile.id);
}
