import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';

const collectRationsTask: TaskDefinition = {
    key: 'collectRations',
    label: 'Collect Rations',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return tile.terrain === 'grain' && tile.variant === 'grain_granary';
    },

    requiredXp(_distance: number) {
        return 4500;
    },

    heroRate(hero: Hero) {
        return 14 * Math.max(10, hero.stats.spd);
    },

    totalRewardedResources(_distance: number) {
        return { type: 'food', amount: 4 };
    },
};

registerTask(collectRationsTask);
