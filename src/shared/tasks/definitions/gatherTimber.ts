import { registerTask } from '../taskRegistry';
import type { TaskDefinition, TaskSoundConfig } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';

const gatherTimberTask: TaskDefinition = {
    key: 'gatherTimber',
    label: 'Gather Timber',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return tile.terrain === 'forest' && tile.variant === 'forest_lumber_camp';
    },

    requiredXp(distance: number) {
        return Math.max(2200, 1800 * distance);
    },

    heroRate(hero: Hero) {
        return 16 * Math.max(1, hero.stats.atk);
    },

    totalRewardedResources(distance: number) {
        return { type: 'wood', amount: Math.max(4, 4 * distance) };
    },

    getSoundOnStart(): TaskSoundConfig {
        return {
            soundPath: 'chopping.wav',
            baseVolume: 0.45,
            maxDistance: 12,
            loop: true,
        };
    },
};

registerTask(gatherTimberTask);
