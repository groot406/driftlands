import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Hero } from '../../../core/types/Hero.ts';
import type { ResourceAmount } from '../../../core/types/Resource.ts';

function isCampfireVariant(variant: string | null | undefined) {
    return variant === 'plains_campfire' || variant === 'dirt_campfire';
}

const campfireRationsTask: TaskDefinition = {
    key: 'campfireRations',
    label: 'Cook Rations',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return isCampfireVariant(typeof tile.variant === 'string' ? tile.variant : null);
    },

    requiredXp(_distance: number) {
        return 1200;
    },

    requiredResources(): ResourceAmount[] {
        return [{ type: 'wood', amount: 2 }];
    },

    heroRate(hero: Hero) {
        return 18 * Math.max(1, hero.stats.spd);
    },

    totalRewardedResources(_distance: number) {
        return { type: 'food', amount: 1 };
    },
};

registerTask(campfireRationsTask);
