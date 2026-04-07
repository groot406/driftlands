import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from "../../../core/types/Task";
import type { Hero } from "../../../core/types/Hero";

const fishAtDockTask: TaskDefinition = {
    key: 'fishAtDock',
    label: 'Fish at Dock',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return tile.terrain === 'water' &&
            typeof tile.variant === 'string' &&
            tile.variant.startsWith('water_dock_');
    },

    requiredXp(_distance: number) {
        return 1500;
    },

    heroRate(hero: Hero) {
        return 12 * Math.max(1, hero.stats.spd) * 10;
    },

    totalRewardedResources(_distance: number) {
        return { type: 'food', amount: 3 };
    },
};

registerTask(fishAtDockTask);
