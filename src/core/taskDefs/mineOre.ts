import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import type { Hero } from '../../store/heroStore';

const mineOreTask: TaskDefinition = {
    key: 'mineOre',
    label: 'Mine Ore',
    chainAdjacentSameTerrain: true,
    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'mountain' && tile.variant === 'mountains_with_mine';
    },

    requiredXp(_distance: number) {
        return 5000 * _distance;
    },
    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(_distance: number) {
        return { type: 'ore', amount: 4 *_distance };
    },

};

registerTask(mineOreTask);
