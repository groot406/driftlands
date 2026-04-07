import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../../../core/types/Task';
import type { Hero } from '../../../core/types/Hero';
import type { ResourceAmount } from '../../../core/types/Resource';
import { applyVariant } from '../../../core/variants';
import { isTileControlled } from '../../game/state/settlementSupportStore';
import { listTaskAccessTiles } from '../taskAccess';

const placeWaterLiliesTask: TaskDefinition = {
    key: 'placeWaterLilies',
    label: 'Place Water Lily',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return tile.terrain === 'water'
            && !tile.variant
            && isTileControlled(tile)
            && listTaskAccessTiles('placeWaterLilies', tile).length > 0;
    },

    requiredXp(_distance: number) {
        return 800;
    },

    requiredResources(): ResourceAmount[] {
        return [{ type: 'water_lily', amount: 1 }];
    },

    heroRate(hero: Hero) {
        return 14 * Math.max(1, hero.stats.atk);
    },

    onComplete(tile) {
        if (tile.terrain !== 'water' || tile.variant) {
            return;
        }

        applyVariant(tile, 'water_lily', { stagger: false, respectBiome: false });
    },

    onStart(_tile, instance) {
        instance.context = {
            ...(instance.context ?? {}),
            adjacentWalkableAccess: true,
        };
    },
};

registerTask(placeWaterLiliesTask);
