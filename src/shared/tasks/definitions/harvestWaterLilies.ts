import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";
import type {Tile} from "../../../core/types/Tile";
import { applyVariant } from '../../../core/variants';
import { isTileControlled } from '../../game/state/settlementSupportStore';
import { listTaskAccessTiles } from '../taskAccess';

const harvestWaterLiliesTask: TaskDefinition = {
    key: 'harvestWaterLilies',
    label: 'Harvest Water Lilies',
    chainAdjacentSameTerrain: (tile: Tile) => tile.terrain === 'water' && tile.variant === 'water_lily',

    canStart(tile, _hero) {
        return tile.terrain === 'water'
            && tile.variant === 'water_lily'
            && isTileControlled(tile)
            && listTaskAccessTiles('harvestWaterLilies', tile).length > 0;
    },

    requiredXp(_distance: number) {
        return 1200;
    },

    heroRate(hero: Hero) {
        // Use attack stat for harvesting efficiency, but less than land-based harvesting
        return 12 * hero.stats.atk;
    },

    totalRewardedResources(_distance: number) {
        // Harvested lilies can be replanted to extend walkable water paths.
        return { type: 'water_lily', amount: 1 };
    },

    onComplete(tile, _instance) {
        // After harvesting water lilies, the water tile returns to normal water
        if (tile.terrain === 'water' && tile.variant === 'water_lily') {
            applyVariant(tile, null, { stagger: false, respectBiome: false });
        }
    },
    onStart(_tile, instance) {
        instance.context = {
            ...(instance.context ?? {}),
            adjacentWalkableAccess: true,
        };
    },
};

registerTask(harvestWaterLiliesTask);
