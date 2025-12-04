import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from '../tasks';
import type { Hero } from '../../store/heroStore';
import {applyVariant} from "../variants.ts";
import type {TileSide} from "../world.ts";
import { TERRAIN_DEFS } from "../terrainDefs.ts";

const buildDockTask: TaskDefinition = {
    key: 'buildDock',
    label: 'Build Dock',
    chainAdjacentSameTerrain: false,


    canStart(tile, hero) {
        return !hero.carryingPayload && tile.terrain === 'water' && !tile.variant;
    },

    requiredXp(_distance: number) {
        return Math.max(3000, 3000 * _distance);
    },
    heroRate(hero: Hero) {
        return 10 * hero.stats.atk * 2;
    },

    requiredResources(distance: number) {
        return [{ type: 'wood', amount: Math.max(5, 5 * distance) }];
    },

    onComplete(tile, _instance, _participants) {
        if (tile.terrain === 'water') {
            // Find the first adjacent walkable tile to orient the dock toward it
            let dockVariant = 'water_dock_a'; // default fallback

            if (tile.neighbors) {
                // Check each side to find the first walkable adjacent tile
                const sides: TileSide[] = ['a', 'b', 'c', 'd', 'e', 'f'];

                for (const side of sides) {
                    const neighbor = tile.neighbors[side];
                    if (neighbor && neighbor.terrain && neighbor.discovered) {
                        // Check if the terrain is walkable by looking up terrain definition
                        const terrainDef = neighbor.terrain ? TERRAIN_DEFS[neighbor.terrain] : null;
                        if (terrainDef?.walkable) {
                            // Orient dock toward this walkable tile
                            dockVariant = `water_dock_${side}`;
                            break;
                        }
                    }
                }
            }

            applyVariant(tile, dockVariant, { stagger: false, respectBiome: false });
        }
    }
};

registerTask(buildDockTask);
