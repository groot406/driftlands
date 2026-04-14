import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';

const huntTask: TaskDefinition = {
    key: 'hunt',
    label: 'Hunt',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return tile.terrain === 'forest'
            && tile.isBaseTile;
    },

    requiredXp(_distance: number) {
        return 2000;
    },

    heroRate(hero: Hero) {
        return 28 * Math.max(1, hero.stats.spd);
    },

    totalRewardedResources(_distance: number) {
        return { type: 'food', amount: 1 };
    },
};

registerTask(huntTask);
