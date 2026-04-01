import { terrainPositions, updateTileVariantIndex } from '../../../core/terrainRegistry';
import type { Hero } from '../../../core/types/Hero.ts';
import type { TaskDefinition, TaskSoundConfig } from '../../../core/types/Task.ts';
import { broadcastGameMessage as broadcast } from '../../game/runtime';
import type { TileUpdatedMessage } from '../../protocol.ts';
import { registerTask } from '../taskRegistry';


const BLOCKED_VARIANTS = new Set([
  'plains_well',
  'plains_watchtower',
  'plains_depot',
  'plains_house',
]);

const digTask: TaskDefinition = {
  key: 'dig',
  label: 'Dig',
  chainAdjacentSameTerrain: false,

  canStart(tile, _hero) {
    return tile.terrain === 'plains' && tile.isBaseTile && !BLOCKED_VARIANTS.has(tile.variant ?? '');
  },

  requiredXp(distance: number) {
    return Math.max(1800, 1500 * Math.max(1, distance));
  },

  heroRate(hero: Hero) {
    return 18 * Math.max(1, hero.stats.atk);
  },

  getSoundOnStart(): TaskSoundConfig {
    return {
      soundPath: 'mining.mp3',
      baseVolume: 0.8,
      maxDistance: 12,
      loop: true,
    };
  },

  onComplete(tile) {
    if (tile.terrain !== 'plains') {
      return;
    }

    terrainPositions.plains.delete(tile.id);
    terrainPositions.dirt.add(tile.id);

    tile.terrain = 'dirt';
    tile.variant = null;

    // change of 1 / 3 to get dirt_rocks
    if (Math.random() < 1 / 3) {
      tile.variant = 'dirt_rocks';
      updateTileVariantIndex(tile.id, 'dirt_rocks', null);
    }

    tile.variantSetMs = undefined;
    tile.variantAgeMs = undefined;

    broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
  },
};

registerTask(digTask);
