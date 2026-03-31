import { registerTask } from '../taskRegistry';
import { applyVariant } from '../../../core/variants';
import type { Hero } from '../../../core/types/Hero';
import type { ResourceAmount } from '../../../core/types/Resource';
import type { TaskDefinition } from '../../../core/types/Task';

const buildRoadTask: TaskDefinition = {
    key: 'buildRoad',
    label: 'Build Road',
    chainAdjacentSameTerrain: false,

    canStart(tile, _hero) {
        return tile.terrain === 'plains' && !tile.variant;
    },

    requiredXp(distance: number) {
        return 1500 * Math.max(1, distance);
    },

    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    requiredResources(distance: number): ResourceAmount[] {
        return [{ type: 'wood', amount: Math.max(2, distance) }];
    },

    onComplete(tile) {
        if (tile.terrain !== 'plains') {
            return;
        }

        applyVariant(tile, 'road', { stagger: false, respectBiome: false });
    },
};

registerTask(buildRoadTask);
