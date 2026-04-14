import { applyVariant } from '../../core/variants';
import type { Hero } from '../../core/types/Hero.ts';
import type { ResourceAmount } from '../../core/types/Resource.ts';
import type { TaskDefinition, TaskInstance, TaskType } from '../../core/types/Task.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { onBuildingCompleted as onPopulationBuildingCompleted } from '../../store/populationStore';
import type { BuildingKey, ProgressionNodeKey, UpgradeKey } from '../story/progression.ts';

export type UpgradeEffect =
  | { kind: 'house_beds_total'; value: number }
  | { kind: 'storage_kind_override'; value: 'warehouse' | 'depot' }
  | { kind: 'job_output_multiplier'; value: number };

export interface UpgradeDefinition {
  key: UpgradeKey;
  label: string;
  summary: string;
  baseBuildingKey: BuildingKey;
  taskKey: TaskType;
  buildTaskLabel: string;
  sortOrder: number;
  fromVariants: string[];
  toVariant: string;
  progressionNodeKeys: ProgressionNodeKey[];
  costs: ResourceAmount[];
  requiredXp(distance: number): number;
  heroRate(hero: Hero, tile: Tile): number;
  effects: UpgradeEffect[];
  resolveToVariant(tile: Tile): string | null;
  onComplete?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;
}

const upgrades: UpgradeDefinition[] = [
  {
    key: 'stone_house_upgrade',
    label: 'Stone House',
    summary: 'Rebuild the starter house in stone to double its housing capacity.',
    baseBuildingKey: 'house',
    taskKey: 'upgradeHouseToStone',
    buildTaskLabel: 'Upgrade To Stone House',
    sortOrder: 210,
    fromVariants: ['plains_house', 'dirt_house'],
    toVariant: 'stone_house',
    progressionNodeKeys: ['masonry'],
    costs: [
      { type: 'wood', amount: 4 },
      { type: 'stone', amount: 6 },
    ],
    requiredXp(_distance: number) {
      return 2600;
    },
    heroRate(hero: Hero) {
      return 18 * Math.max(1, hero.stats.atk);
    },
    effects: [
      { kind: 'house_beds_total', value: 4 },
    ],
    resolveToVariant(tile: Tile) {
      if (tile.variant === 'plains_house') return 'plains_stone_house';
      if (tile.variant === 'dirt_house') return 'dirt_stone_house';
      return null;
    },
    onComplete() {
      onPopulationBuildingCompleted();
    },
  },
  {
    key: 'warehouse_upgrade',
    label: 'Warehouse',
    summary: 'Expand the depot into a full warehouse with more capacity.',
    baseBuildingKey: 'supplyDepot',
    taskKey: 'upgradeDepotToWarehouse',
    buildTaskLabel: 'Upgrade To Warehouse',
    sortOrder: 220,
    fromVariants: ['plains_depot', 'dirt_depot'],
    toVariant: 'warehouse',
    progressionNodeKeys: ['masonry'],
    costs: [
      { type: 'wood', amount: 6 },
      { type: 'stone', amount: 4 },
    ],
    requiredXp(_distance: number) {
      return 3200;
    },
    heroRate(hero: Hero) {
      return 18 * Math.max(1, hero.stats.atk);
    },
    effects: [
      { kind: 'storage_kind_override', value: 'warehouse' },
    ],
    resolveToVariant(tile: Tile) {
      if (tile.variant === 'plains_depot') return 'plains_warehouse';
      if (tile.variant === 'dirt_depot') return 'dirt_warehouse';
      return null;
    },
  },
  {
    key: 'sawmill_upgrade',
    label: 'Sawmill',
    summary: 'Mechanize the lumber camp to improve timber throughput.',
    baseBuildingKey: 'lumberCamp',
    taskKey: 'upgradeLumberCampToSawmill',
    buildTaskLabel: 'Upgrade To Sawmill',
    sortOrder: 230,
    fromVariants: ['forest_lumber_camp'],
    toVariant: 'forest_sawmill',
    progressionNodeKeys: ['deep_frontier'],
    costs: [
      { type: 'wood', amount: 6 },
      { type: 'stone', amount: 6 },
      { type: 'ore', amount: 4 },
    ],
    requiredXp(_distance: number) {
      return 3600;
    },
    heroRate(hero: Hero) {
      return 18 * Math.max(1, hero.stats.atk);
    },
    effects: [
      { kind: 'job_output_multiplier', value: 1.5 },
    ],
    resolveToVariant(tile: Tile) {
      return tile.variant === 'forest_lumber_camp' ? 'forest_sawmill' : null;
    },
  },
  {
    key: 'reinforced_mine_upgrade',
    label: 'Reinforced Mine',
    summary: 'Brace the mine head and improve ore output.',
    baseBuildingKey: 'mine',
    taskKey: 'upgradeMineToReinforced',
    buildTaskLabel: 'Upgrade To Reinforced Mine',
    sortOrder: 240,
    fromVariants: ['mountains_with_mine'],
    toVariant: 'mountains_reinforced_mine',
    progressionNodeKeys: ['deep_frontier'],
    costs: [
      { type: 'wood', amount: 4 },
      { type: 'stone', amount: 8 },
      { type: 'ore', amount: 6 },
    ],
    requiredXp(_distance: number) {
      return 3800;
    },
    heroRate(hero: Hero) {
      return 18 * Math.max(1, hero.stats.atk);
    },
    effects: [
      { kind: 'job_output_multiplier', value: 1.5 },
    ],
    resolveToVariant(tile: Tile) {
      return tile.variant === 'mountains_with_mine' ? 'mountains_reinforced_mine' : null;
    },
  },
];

export function listUpgradeDefinitions() {
  return upgrades;
}

export function getUpgradeDefinitionByKey(upgradeKey: string) {
  return upgrades.find((upgrade) => upgrade.key === upgradeKey) ?? null;
}

export function getUpgradeDefinitionByTaskKey(taskKey: TaskType) {
  return upgrades.find((upgrade) => upgrade.taskKey === taskKey) ?? null;
}

export function getUpgradeDefinitionForVariant(variantKey: string | null | undefined) {
  if (!variantKey) {
    return null;
  }

  for (const upgrade of upgrades) {
    for (const fromVariant of upgrade.fromVariants) {
      if (upgrade.resolveToVariant({ variant: fromVariant } as Tile) === variantKey) {
        return upgrade;
      }
    }
  }

  return null;
}

export function createUpgradeTaskDefinition(upgrade: UpgradeDefinition): TaskDefinition {
  return {
    key: upgrade.taskKey,
    label: upgrade.buildTaskLabel,
    chainAdjacentSameTerrain: false,
    canStart(tile) {
      return !!tile.variant && upgrade.fromVariants.includes(tile.variant);
    },
    requiredXp(distance: number) {
      return upgrade.requiredXp(distance);
    },
    heroRate(hero: Hero, tile: Tile) {
      return upgrade.heroRate(hero, tile);
    },
    requiredResources() {
      return upgrade.costs.map((resource) => ({ ...resource }));
    },
    onComplete(tile, instance, participants) {
      const nextVariant = upgrade.resolveToVariant(tile);
      if (!nextVariant) {
        return;
      }

      applyVariant(tile, nextVariant, { stagger: false, respectBiome: false });
      upgrade.onComplete?.(tile, instance, participants);
    },
  };
}
