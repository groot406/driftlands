import type { Hero } from '../../core/types/Hero';
import type { TaskType } from '../../core/types/Task';
import type { Tile } from '../../core/types/Tile';
import { axialDistanceCoords } from '../game/hex';
import { isTileWalkable } from '../game/navigation';
import {
    findNearestActiveAdjacentAccessTile,
    isTileActive,
    listActiveAdjacentAccessTiles,
} from '../game/state/settlementSupportStore';
import { tileIndex } from '../game/world';

const ADJACENT_ACTIVE_ACCESS_TASKS = new Set<string>([
    'buildDock',
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

function listAdjacentWalkableAccessTiles(tile: Tile | null | undefined) {
    if (!tile?.neighbors) return [];

    const result: Tile[] = [];
    for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        const neighbor = tile.neighbors[side];
        if (neighbor?.discovered && isTileWalkable(neighbor)) {
            result.push(neighbor);
        }
    }

    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
}

export function listTaskAccessTiles(
    taskType: TaskType | string | null | undefined,
    tile: Tile | null | undefined,
) {
    if (taskUsesAdjacentActiveAccess(taskType)) {
        return listActiveAdjacentAccessTiles(tile);
    }

    if (taskUsesAdjacentWalkableAccess(taskType)) {
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

    if (taskUsesAdjacentActiveAccess(taskType)) {
        return findNearestActiveAdjacentAccessTile(tile, fromQ, fromR);
    }

    if (taskUsesAdjacentWalkableAccess(taskType)) {
        const candidates = listAdjacentWalkableAccessTiles(tile);
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

    return tile;
}

export function isHeroAtTaskAccess(
    hero: Pick<Hero, 'q' | 'r'> | null | undefined,
    taskType: TaskType | string | null | undefined,
    tile: Tile | null | undefined,
) {
    if (!hero || !tile) return false;

    if (!taskUsesAdjacentAccess(taskType)) {
        return hero.q === tile.q && hero.r === tile.r;
    }

    const heroTile = tileIndex[`${hero.q},${hero.r}`] ?? null;
    return !!heroTile
        && heroTile.discovered
        && isTileWalkable(heroTile)
        && (!taskUsesAdjacentActiveAccess(taskType) || isTileActive(heroTile))
        && axialDistanceCoords(hero.q, hero.r, tile.q, tile.r) === 1;
}
