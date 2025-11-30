import { registerTask } from '../taskRegistry';
import type {ResourceAmount, TaskDefinition} from '../tasks';
import type { Hero } from '../../store/heroStore';
import { applyVariant } from '../variants';
import {getNeighborTerrains} from "../world.ts";

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
        // Fixed effort per forest tile for now
        return 2000 * _distance;
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
