import { registerTask } from '../taskRegistry';
import { applyVariant } from '../../../core/variants';
import type {Hero} from "../../../core/types/Hero.ts";
import type {TaskDefinition, TaskSoundConfig} from "../../../core/types/Task.ts";

const breakDirtRockTask: TaskDefinition = {
    key: 'breakDirtRock',
    label: 'Break rock',

    canStart(tile, _hero) {
        return tile.terrain === 'dirt' && (tile.variant === 'dirt_big_rock');
    },

    requiredXp(_distance: number) {
        // Fixed effort per forest tile for now
        return 2000 * _distance;
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
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
        if (tile.terrain === 'dirt') {
            applyVariant(tile, 'dirt_rocks', { stagger: false, respectBiome: true });
        }
    }
};

registerTask(breakDirtRockTask);
