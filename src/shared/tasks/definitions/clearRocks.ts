import { registerTask } from '../taskRegistry';
import type {TaskDefinition, TaskSoundConfig} from "../../../core/types/Task";
import { applyVariant } from '../../../core/variants';
import type {Hero} from "../../../core/types/Hero";

const clearRocksTask: TaskDefinition = {
    key: 'clearRocks',
    label: 'Clear rocks',
    chainAdjacentSameTerrain: true,

    canStart(tile, _hero) {
        return (tile.terrain === 'dirt' && tile.variant === 'dirt_rocks')
            || (tile.terrain === 'snow' && tile.variant === 'snow_rock');
    },

    requiredXp(_distance: number) {
        return 2000;
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(_distance: number) {
        return { type: 'stone', amount: 2 };
    },

    getSoundOnStart(): TaskSoundConfig {
        return {
            soundPath: 'mining.mp3',
            baseVolume: 0.8,
            maxDistance: 12,
            loop: true
        };
    },

    onComplete(tile, _instance) {
        if (tile.terrain === 'dirt' || tile.terrain === 'snow') {
            applyVariant(tile, null, { stagger: false, respectBiome: true });
        }
    }
};

registerTask(clearRocksTask);
