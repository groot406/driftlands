import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';

const FORAGE_TERRAINS = new Set(['plains', 'forest', 'dirt', 'snow', 'dessert']);

const forageTask: TaskDefinition = {
    key: 'forage',
    label: 'Forage',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return !!tile.terrain
            && tile.isBaseTile
            && FORAGE_TERRAINS.has(tile.terrain);
    },

    requiredXp(_distance: number) {
        return 1800;
    },

    heroRate(hero: Hero) {
        return 30 * Math.max(1, hero.stats.spd);
    },

    totalRewardedResources(_distance: number) {
        return { type: 'food', amount: 1 };
    },
};

registerTask(forageTask);
