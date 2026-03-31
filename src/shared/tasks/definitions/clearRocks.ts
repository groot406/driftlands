import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import { applyVariant } from '../../../core/variants';
import type {Hero} from "../../../core/types/Hero";

const clearDirtRocksTask: TaskDefinition = {
    key: 'clearRocks',
    label: 'Clear rocks',
    chainAdjacentSameTerrain: true,

    canStart(tile, _hero) {
        return tile.terrain === 'dirt' && (tile.variant === 'dirt_rocks');
    },

    requiredXp(_distance: number) {
        // Fixed effort per forest tile for now
        return 2000 * _distance;
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(distance: number) {
        return { type: 'stone', amount: 2 * distance };
    },

    onComplete(tile, _instance) {
        if (tile.terrain === 'dirt') {
            applyVariant(tile, null, { stagger: false, respectBiome: true });
        }
    }
};

registerTask(clearDirtRocksTask);
