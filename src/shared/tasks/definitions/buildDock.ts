import { registerTask } from '../taskRegistry';
import type {TaskDefinition } from "../../../core/types/Task.ts";
import {applyVariant} from "../../../core/variants.ts";
import { TERRAIN_DEFS } from "../../../core/terrainDefs.ts";
import { getTaskByTile } from "../../../store/taskStore.ts";
import type {Hero} from "../../../core/types/Hero.ts";
import {SIDE_NAMES, type TileSide} from "../../../core/types/Tile.ts";

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

    onStart(tile, instance, participants) {
        // Determine approach side using the hero's previous stepped tile (second-to-last in path)
        const starter = participants && participants[0];
        if (!starter) return;
        const movement = starter.movement;
        const neighbors = tile.neighbors;
        if (movement && neighbors) {
            const path = movement.path;
            const prevCoord = (path && path.length >= 2)
                ? path[path.length - 2]
                : movement.origin;
            if (prevCoord) {
                for (const side of SIDE_NAMES) {
                    const n = neighbors[side];
                    if (n && n.q === prevCoord.q && n.r === prevCoord.r) {
                        instance.context = instance.context || {};
                        instance.context.approachSide = side;
                        console.log('set approach side to', side);
                        break;
                    }
                }
            }
        }
    },

    onComplete(tile, _instance, _participants) {
        if (tile.terrain === 'water') {
            // Prefer explicit approach side stored in task context
            const inst = getTaskByTile(tile.id, 'buildDock');
            let dockVariant = 'water_dock_a'; // default fallback
            const approachSide = inst?.context?.approachSide as TileSide | undefined;
            console.log('completing buildDock, approachSide=', approachSide);
            if (approachSide) {
                dockVariant = `water_dock_${approachSide}`;
            } else {
                // Fallback: find first adjacent walkable tile to orient the dock toward it
                if (tile.neighbors) {
                    for (const side of SIDE_NAMES) {
                        const neighbor = tile.neighbors[side];
                        if (neighbor && neighbor.terrain && neighbor.discovered) {
                            const terrainDef = neighbor.terrain ? TERRAIN_DEFS[neighbor.terrain] : null;
                            if (terrainDef?.walkable) {
                                dockVariant = `water_dock_${side}`;
                                break;
                            }
                        }
                    }
                }
            }

            applyVariant(tile, dockVariant, { stagger: false, respectBiome: false });
        }
    }
};

registerTask(buildDockTask);
