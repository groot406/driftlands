import { registerTask } from '../taskRegistry';
import type { TaskDefinition } from '../tasks';
import type { Hero } from '../../store/heroStore';
import { applyVariant } from '../variants';
import {type Tile } from "../world.ts";

const tillLandTask: TaskDefinition = {
    key: 'tillLand',
    label: 'Prepare Land',
    chainAdjacentSameTerrain: (tile: Tile) => tile.terrain === 'dirt',

    canStart(tile, hero) {
        return !hero.carryingPayload && ((tile.terrain === 'dirt' && !tile.variant) || tile.terrain === 'plains');
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

            let hasWaterNearby = false;
            // See if tile has a water neighbour
            if (tile.neighbors) {
                for (const side of ['a','b','c','d','e','f'] as const) {
                    const nt = tile.neighbors[side];
                    if(nt && nt.terrain === 'water') {
                        hasWaterNearby = true;
                    }
                }
            }

            if(hasWaterNearby) {
                applyVariant(tile, 'dirt_tilled_hydrated', {stagger: false, respectBiome: true});
            } else {
                applyVariant(tile, 'dirt_tilled_draught', {stagger: false, respectBiome: true});
            }
        }
    }
};

registerTask(tillLandTask);
