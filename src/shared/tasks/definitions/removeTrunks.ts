import {registerTask} from '../taskRegistry';
import type {TaskDefinition, TaskSoundConfig} from "../../../core/types/Task";
import { terrainPositions, updateTileVariantIndex } from '../../../core/terrainRegistry';
import type {Hero} from "../../../core/types/Hero";
import { broadcastGameMessage as broadcast } from '../../game/runtime';
import type { TileUpdatedMessage } from '../../protocol';

const removeTrunksTask: TaskDefinition = {
    key: 'removeTrunks',
    label: 'Remove Trunks',
    chainAdjacentSameTerrain: false,
    canStart(tile, _hero) {
        return tile.terrain === 'forest' && tile.variant === 'chopped_forest';
    },

    requiredXp(_distance: number) {
        return 1000;
    },
    heroRate(hero: Hero) {
        return 5 + hero.stats.atk * 2;
    },
    totalRewardedStats(_distance: number) {
        return {xp: 2, hp: 0, atk: 5, spd: 0};
    },
    onStart(tile) {
        // Guard: If tile changed before start, abort implicitly by leaving logic minimal.
        if (tile.variant !== 'chopped_forest') return;
    },
    onComplete(tile, _instance, _participants) {
        // Only convert if still chopped_forest (another task might have altered it).
        if (tile.variant === 'chopped_forest') {
            updateTileVariantIndex(tile.id, 'chopped_forest', null);

            terrainPositions.forest.delete(tile.id);
            terrainPositions.plains.add(tile.id);

            tile.terrain = 'plains';
            tile.variant = null;
            tile.isBaseTile = true;
            tile.variantSetMs = undefined;
            tile.variantAgeMs = undefined;

            broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
        }
    },
    getSoundOnStart(): TaskSoundConfig {
        return {
            soundPath: 'chopping.wav',
            baseVolume: 0.8,
            maxDistance: 12,
            loop: true
        };
    },
};

registerTask(removeTrunksTask);
