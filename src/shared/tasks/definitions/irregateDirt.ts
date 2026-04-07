import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task";
import { applyVariant } from '../../../core/variants';
import {getNeighborTerrains} from "../../../core/world";
import type {Hero} from "../../../core/types/Hero";
import type {ResourceAmount} from "../../../core/types/Resource.ts";

const irregateDirtTask: TaskDefinition = {
    key: 'irregateDirtTask',
    label: 'Irregate',
    chainAdjacentSameTerrain: true,

    canStart(tile) {
        const neighborTerrains = getNeighborTerrains(tile, 1);
        if(neighborTerrains.includes('water')) {
            return false;
        }

        return tile.terrain === 'dirt' && (tile.variant === 'dirt_tilled_draught');
    },

    requiredXp(_distance: number) {
        return 2000;
    },

    requiredResources(): ResourceAmount[] {
        return [{ type: 'water', amount: 1 }];
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
    },

    onComplete(tile, _instance) {
        if (tile.terrain === 'dirt') {
            applyVariant(tile, 'dirt_tilled', { stagger: false, respectBiome: true });
        }
    }
};

registerTask(irregateDirtTask);
