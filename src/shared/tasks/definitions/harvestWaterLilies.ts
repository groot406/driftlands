import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";
import type {Tile} from "../../../core/types/Tile";

const harvestWaterLiliesTask: TaskDefinition = {
    key: 'harvestWaterLilies',
    label: 'Harvest Water Lilies',
    chainAdjacentSameTerrain: (tile: Tile) => tile.terrain === 'water' && tile.variant === 'water_lily',

    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'water' && tile.variant === 'water_lily';
    },

    requiredXp(distance: number) {
        // Harvesting from water should be moderate effort
        return 1200 * distance;
    },

    heroRate(hero: Hero) {
        // Use attack stat for harvesting efficiency, but less than land-based harvesting
        return 12 * hero.stats.atk;
    },

    totalRewardedResources(distance: number) {
        // Water lilies provide food resource
        return { type: 'food', amount: 2 * distance };
    },

    onComplete(tile, _instance) {
        // After harvesting water lilies, the water tile returns to normal water
        if (tile.terrain === 'water' && tile.variant === 'water_lily') {
            tile.variant = null;
        }
    }
};

registerTask(harvestWaterLiliesTask);
