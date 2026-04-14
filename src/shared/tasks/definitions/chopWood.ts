import { registerTask } from '../taskRegistry';
import type {TaskDefinition} from "../../../core/types/Task.ts";
import { applyVariant } from '../../../core/variants';
import type {Hero} from "../../../core/types/Hero.ts";
import type {Tile} from "../../../core/types/Tile.ts";
import {terrainPositions, updateTileVariantIndex} from "../../../core/terrainRegistry.ts";
import {broadcastGameMessage as broadcast} from "../../game/runtime.ts";
import type {TileUpdatedMessage} from "../../protocol.ts";

const chopWoodTask: TaskDefinition = {
    key: 'chopWood',
    label: 'Chop Wood',
    chainAdjacentSameTerrain: true,

    canStart(tile, _hero) {
        return tile.terrain === 'forest' && (tile.isBaseTile || tile.variant === '' || tile.variant === 'young_forest');
    },

    canAutoChainTo(_sourceTile, targetTile, _hero) {
        return targetTile.variant !== 'young_forest';
    },

    requiredXp(_distance: number) {
        return 1200;
    },

    heroRate(hero: Hero) {
        // Use attack stat for chopping efficiency; add small base
        return 10 * hero.stats.atk * 2;
    },

    totalRewardedResources(_distance: number, tile: Tile) {
        return { type: 'wood', amount: tile?.variant === 'young_forest' ? 1 : 2 };
    },

    getSoundOnStart() {
        // Return sound configuration for chopping
        return {
            soundPath: 'chopping.wav',
            baseVolume: 0.6,
            maxDistance: 15,
            loop: true
        };
    },

    onComplete(tile, _instance, _participants) {
        // Replace forest with chopped_forest (only if still forest)
        if (tile.terrain === 'forest') {
            if(tile.variant === 'young_forest') {
                updateTileVariantIndex(tile.id, 'young_forest', null);

                terrainPositions.forest.delete(tile.id);
                terrainPositions.plains.add(tile.id);

                tile.terrain = 'plains';
                tile.variant = null;
                tile.isBaseTile = true;
                tile.variantSetMs = undefined;
                tile.variantAgeMs = undefined;

                broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
                return;
            }
            applyVariant(tile, 'chopped_forest', { stagger: false, respectBiome: true });
        }
    }
};

registerTask(chopWoodTask);
