import { registerTask } from '../taskRegistry';
import type { Hero } from '../../../core/types/Hero.ts';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Tile } from '../../../core/types/Tile.ts';
import { hasRevealedModifier } from '../../game/tileFeatures.ts';

const gatherSandTask: TaskDefinition = {
    key: 'gatherSand',
    label: 'Gather Sand',
    chainAdjacentSameTerrain: true,

    canStart(tile: Tile) {
        return tile.terrain === 'dessert' && tile.isBaseTile;
    },

    requiredXp(_distance: number) {
        return 1800;
    },

    heroRate(hero: Hero) {
        return 18 * Math.max(1, hero.stats.atk);
    },

    totalRewardedResources(_distance: number, tile: Tile) {
        return {
            type: 'sand',
            amount: hasRevealedModifier(tile, 'sand_rich') ? 3 : 2,
        };
    },
};

registerTask(gatherSandTask);
