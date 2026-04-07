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
        return tile.terrain === 'plains' && tile.isBaseTile ;
    },

    requiredXp(_distance: number) {
        return 1500;
    },

    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    requiredResources(_distance: number): ResourceAmount[] {
        return [{ type: 'wood', amount: 2 }];
    },

    onComplete(tile) {
        if (tile.terrain !== 'plains') {
            return;
        }

        applyVariant(tile, 'road', { stagger: false, respectBiome: false });
    },
};

registerTask(buildRoadTask);
