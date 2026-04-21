import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import type {Hero} from "../../../core/types/Hero";
import { broadcastGameMessage as broadcast } from '../../game/runtime';
import { countActiveAdjacentRevealedSpecial, hasRevealedModifier } from '../../game/tileFeatures.ts';

const harvestGrainTask: TaskDefinition = {
    key: 'harvestGrain',
    label: 'Harvest Grain',
    chainAdjacentSameTerrain: true,

    canStart(tile, _hero) {
        return tile.terrain === 'grain' && tile.isBaseTile;
    },

    requiredXp(_distance: number) {
        return 1500;
    },

    heroRate(hero: Hero) {
        // Use attack stat for harvesting efficiency
        return 15 * hero.stats.atk;
    },

    totalRewardedResources(_distance: number, tile) {
        const modifierBonus = hasRevealedModifier(tile, 'rich_soil') ? 1 : 0;
        const basinBonus = countActiveAdjacentRevealedSpecial(tile, 'fertile_basin') > 0 ? 1 : 0;
        return { type: 'grain', amount: 3 + modifierBonus + basinBonus };
    },

    onComplete(tile, _instance) {
        // After harvesting, grain field becomes dirt (ready for re-tilling)
        if (tile.terrain === 'grain') {
            tile.terrain = 'dirt';
            tile.variant = null;
            tile.variantAgeMs = undefined;
            broadcast({ type: 'tile:updated', tile});
        }
    }
};

registerTask(harvestGrainTask);
