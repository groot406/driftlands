import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";

const mineOreTask: TaskDefinition = {
    key: 'mineOre',
    label: 'Mine Ore',
    chainAdjacentSameTerrain: true,
    canStart(tile, _hero) {
        return tile.terrain === 'mountain' && tile.variant === 'mountains_with_mine';
    },

    requiredXp(_distance: number) {
        return 5000;
    },
    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(_distance: number) {
        return { type: 'ore', amount: 4 };
    },

    getSoundOnStart() {
        return {
            soundPath: 'mining.mp3',
            baseVolume: 0.6,
            maxDistance: 12,
            loop: true
        };
    }

};

registerTask(mineOreTask);
