import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import { applyVariant } from '../../../core/variants';
import type {Tile} from "../../../core/types/Tile";
import type {Hero} from "../../../core/types/Hero";
import { hasAdjacentWaterSource } from '../../buildings/water';

const tillLandTask: TaskDefinition = {
    key: 'tillLand',
    label: 'Prepare Land',
    chainAdjacentSameTerrain: (tile: Tile) => tile.terrain === 'dirt',

    canStart(tile, hero) {
        return !hero.carryingPayload && ((tile.terrain === 'dirt' && !tile.variant) || (tile.terrain === 'plains' && !tile.variant));
    },

    requiredXp(_distance: number) {
        // Fixed effort per forest tile for now
        return 2000 * _distance;
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
    },

    onComplete(tile, _instance) {
        if(tile.terrain === 'plains') {
            tile.terrain = 'dirt';
        }

        if (tile.terrain === 'dirt') {
            const hasWaterNearby = hasAdjacentWaterSource(tile);

            if(hasWaterNearby) {
                applyVariant(tile, 'dirt_tilled_hydrated', {stagger: false, respectBiome: true});
            } else {
                applyVariant(tile, 'dirt_tilled_draught', {stagger: false, respectBiome: true});
            }
        }
    }
};

registerTask(tillLandTask);
