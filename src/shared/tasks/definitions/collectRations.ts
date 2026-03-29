import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';

const collectRationsTask: TaskDefinition = {
    key: 'collectRations',
    label: 'Collect Rations',
    chainAdjacentSameTerrain: false,

    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'grain' && tile.variant === 'grain_granary';
    },

    requiredXp(distance: number) {
        return Math.max(2100, 1700 * distance);
    },

    heroRate(hero: Hero) {
        return 14 * Math.max(1, hero.stats.spd);
    },

    totalRewardedResources(distance: number) {
        return { type: 'food', amount: Math.max(4, 4 * distance) };
    },
};

registerTask(collectRationsTask);
