import type { Hero } from '../../../core/types/Hero.ts';
import type { ResourceAmount, ResourceType } from '../../../core/types/Resource.ts';
import type { TaskDefinition } from '../../../core/types/Task.ts';
import type { Tile } from '../../../core/types/Tile.ts';
import { applyVariant } from '../../../core/variants.ts';
import { broadcastGameMessage as broadcast } from '../../game/runtime.ts';
import {
  countActiveAdjacentRevealedSpecial,
  hasRevealedModifier,
} from '../../game/tileFeatures.ts';
import { registerTask } from '../taskRegistry.ts';

interface CropTaskConfig {
  terrain: Tile['terrain'];
  resourceType: ResourceType;
  seedTaskKey: string;
  seedLabel: string;
  harvestTaskKey: string;
  harvestLabel: string;
  plantedVariant: string;
  baseYield: number;
}

function createSeedTask(config: CropTaskConfig): TaskDefinition {
  return {
    key: config.seedTaskKey,
    label: config.seedLabel,
    chainAdjacentSameTerrain: true,

    canStart(tile) {
      return tile.terrain === 'dirt'
        && (tile.variant === 'dirt_tilled_hydrated' || tile.variant === 'dirt_tilled');
    },

    requiredXp() {
      return 1000;
    },

    requiredResources(): ResourceAmount[] {
      return [{ type: 'water', amount: 1 }];
    },

    heroRate(hero: Hero) {
      return 20 * hero.stats.atk;
    },

    onComplete(tile) {
      if (tile.terrain === 'dirt' && (tile.variant === 'dirt_tilled_hydrated' || tile.variant === 'dirt_tilled')) {
        tile.terrain = config.terrain;
        applyVariant(tile, config.plantedVariant, { stagger: false, respectBiome: false });
      }
    },
  };
}

function createHarvestTask(config: CropTaskConfig): TaskDefinition {
  return {
    key: config.harvestTaskKey,
    label: config.harvestLabel,
    chainAdjacentSameTerrain: true,

    canStart(tile) {
      return tile.terrain === config.terrain && tile.isBaseTile;
    },

    requiredXp() {
      return 1500;
    },

    heroRate(hero: Hero) {
      return 15 * hero.stats.atk;
    },

    totalRewardedResources(_distance, tile) {
      const modifierBonus = hasRevealedModifier(tile, 'rich_soil') ? 1 : 0;
      const basinBonus = countActiveAdjacentRevealedSpecial(tile, 'fertile_basin') > 0 ? 1 : 0;
      return {
        type: config.resourceType,
        amount: config.baseYield + modifierBonus + basinBonus,
      };
    },

    onComplete(tile) {
      if (tile.terrain === config.terrain) {
        tile.terrain = 'dirt';
        tile.variant = null;
        tile.variantAgeMs = undefined;
        broadcast({ type: 'tile:updated', tile });
      }
    },
  };
}

export function registerCropTasks(config: CropTaskConfig) {
  registerTask(createSeedTask(config));
  registerTask(createHarvestTask(config));
}
