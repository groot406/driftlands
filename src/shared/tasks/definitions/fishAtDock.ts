import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from "../../../core/types/Task";
import type { Hero } from "../../../core/types/Hero";

const fishAtDockTask: TaskDefinition = {
    key: 'fishAtDock',
    label: 'Fish at Dock',
    chainAdjacentSameTerrain: false,

    canStart(tile, hero) {
        return !hero.carryingPayload &&
            tile.terrain === 'water' &&
            typeof tile.variant === 'string' &&
            tile.variant.startsWith('water_dock_');
    },

    requiredXp(distance: number) {
        return Math.max(1500, 1400 * distance);
    },

    heroRate(hero: Hero) {
        return 12 * Math.max(1, hero.stats.spd) * 10;
    },

    totalRewardedResources(distance: number) {
        return { type: 'food', amount: Math.max(3, 3 * distance) };
    },
};

registerTask(fishAtDockTask);
