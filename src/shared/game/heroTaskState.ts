import { tileIndex } from '../../core/world';
import type { Hero } from '../../core/types/Hero';
import type { TaskInstance } from '../../core/types/Task';

export function isHeroAtTaskLocation(
    hero: Hero,
    task: Pick<TaskInstance, 'tileId'> | null | undefined,
) {
    if (!task) return false;
    const tile = tileIndex[task.tileId];
    return !!tile && hero.q === tile.q && hero.r === tile.r;
}

export function isHeroWorkingTask(
    hero: Hero,
    task: Pick<TaskInstance, 'tileId' | 'active' | 'completedMs'> | null | undefined,
) {
    if (!task || !task.active || !!task.completedMs) {
        return false;
    }

    if (hero.movement) {
        return false;
    }

    return isHeroAtTaskLocation(hero, task);
}
