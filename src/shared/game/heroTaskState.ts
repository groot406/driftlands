import { tileIndex } from '../../core/world';
import type { Hero } from '../../core/types/Hero';
import type { TaskInstance } from '../../core/types/Task';
import { getTaskAccessMode, isHeroAtTaskAccess } from '../tasks/taskAccess';

export function isHeroAtTaskLocation(
    hero: Hero,
    task: Pick<TaskInstance, 'tileId' | 'type' | 'context'> | null | undefined,
) {
    if (!task) return false;
    const tile = tileIndex[task.tileId];
    if (!tile) return false;

    if (
        task.context?.restoreFromAdjacency
        || task.context?.adjacentActiveAccess
        || task.context?.adjacentWalkableAccess
        || getTaskAccessMode(task.type, tile) !== 'tile'
    ) {
        return isHeroAtTaskAccess(hero, task.type, tile);
    }

    return hero.q === tile.q && hero.r === tile.r;
}

export function isHeroWorkingTask(
    hero: Hero,
    task: Pick<TaskInstance, 'tileId' | 'type' | 'active' | 'completedMs' | 'context'> | null | undefined,
) {
    if (!task || !task.active || !!task.completedMs) {
        return false;
    }

    if (hero.movement) {
        return false;
    }

    return isHeroAtTaskLocation(hero, task);
}
