import { terrainPositions, updateTileVariantIndex } from '../../../core/terrainRegistry';
import type { Hero } from '../../../core/types/Hero.ts';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import { broadcastGameMessage as broadcast } from '../../game/runtime';
import type { TileUpdatedMessage } from '../../protocol.ts';
import { registerTask } from '../taskRegistry';

const BLOCKED_DIRT_VARIANTS = new Set([
  'dirt_tilled',
  'dirt_tilled_draught',
  'dirt_tilled_hydrated',
  'dirt_well',
  'dirt_watchtower',
  'dirt_depot',
  'dirt_warehouse',
  'dirt_library',
  'dirt_house',
  'dirt_stone_house',
]);

const convertToGrassTask: TaskDefinition = {
  key: 'convertToGrass',
  label: 'Convert to grass',
  chainAdjacentSameTerrain: false,

  canStart(tile, _hero) {
    return (
      tile.terrain === 'dirt' && tile.isBaseTile && !BLOCKED_DIRT_VARIANTS.has(tile.variant ?? '')
    );
  },

  requiredXp(_distance: number) {
    return 1800;
  },

  heroRate(hero: Hero) {
    return 18 * Math.max(1, hero.stats.atk);
  },

  onComplete(tile) {
    if (tile.terrain !== 'dirt') {
      return;
    }

    const previousVariant = tile.variant ?? null;
    if (previousVariant) {
      updateTileVariantIndex(tile.id, previousVariant, null);
    }

    terrainPositions.dirt.delete(tile.id);
    terrainPositions.plains.add(tile.id);

    tile.terrain = 'plains';
    tile.variant = null;
    tile.isBaseTile = true;
    tile.variantSetMs = undefined;
    tile.variantAgeMs = undefined;

    broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
  },
};

registerTask(convertToGrassTask);
