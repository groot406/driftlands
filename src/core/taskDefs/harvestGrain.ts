import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../tasks';
import type { Hero } from '../../store/heroStore';
import type { Tile } from '../world';

const harvestGrainTask: TaskDefinition = {
    key: 'harvestGrain',
    label: 'Harvest Grain',
    chainAdjacentSameTerrain: (tile: Tile) => tile.terrain === 'grain',

    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'grain' && !tile.variant;
    },

    requiredXp(distance: number) {
        return 1500 * distance;
    },

    heroRate(hero: Hero) {
        // Use attack stat for harvesting efficiency
        return 15 * hero.stats.atk;
    },

    totalRewardedResources(distance: number) {
        return { type: 'grain', amount: 3 * distance };
    },

    onComplete(tile, _instance) {
        // After harvesting, grain field becomes dirt (ready for re-tilling)
        if (tile.terrain === 'grain') {
            tile.terrain = 'dirt';
            tile.variant = null;
        }
    }
};

registerTask(harvestGrainTask);
