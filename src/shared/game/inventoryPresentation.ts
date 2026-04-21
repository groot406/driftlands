import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { TerrainKey } from '../../core/terrainDefs.ts';
import type {
  BuildingKey,
  ProgressionNodeKey,
  ProgressionSnapshot,
  UpgradeKey,
} from '../story/progression.ts';

export type InventoryDisplayGroup = 'stock' | 'item';
export type InventoryKind = InventoryDisplayGroup | 'inventory';

export interface InventoryEntryDefinition {
  key: ResourceType;
  label: string;
  icon: string;
  kind: InventoryKind;
  hudGroup: InventoryDisplayGroup | null;
  sortOrder: number;
  alwaysVisible?: boolean;
  relevantWhen?: {
    nodes?: ProgressionNodeKey[];
    terrains?: TerrainKey[];
    buildings?: BuildingKey[];
    tasks?: TaskType[];
    upgrades?: UpgradeKey[];
  };
}

export interface VisibleInventoryEntry {
  key: ResourceType;
  label: string;
  icon: string;
  group: InventoryDisplayGroup;
  value: number;
}

export interface InventoryVisibilityContext {
  inventory: Partial<Record<ResourceType, number>>;
  progression?: ProgressionSnapshot | null;
}

export const INVENTORY_ENTRY_DEFINITIONS: readonly InventoryEntryDefinition[] = [
  {
    key: 'food',
    label: 'Food',
    icon: '\uD83C\uDF56',
    kind: 'stock',
    hudGroup: 'stock',
    sortOrder: 10,
    alwaysVisible: true,
  },
  {
    key: 'wood',
    label: 'Wood',
    icon: '\uD83C\uDF32',
    kind: 'stock',
    hudGroup: 'stock',
    sortOrder: 20,
    alwaysVisible: true,
  },
  {
    key: 'stone',
    label: 'Stone',
    icon: '\uD83E\uDEA8',
    kind: 'stock',
    hudGroup: 'stock',
    sortOrder: 30,
    alwaysVisible: true,
  },
  {
    key: 'grain',
    label: 'Grain',
    icon: '\uD83C\uDF3E',
    kind: 'stock',
    hudGroup: 'stock',
    sortOrder: 40,
    alwaysVisible: true,
  },
  {
    key: 'ore',
    label: 'Ore',
    icon: '\u26CF\uFE0F',
    kind: 'stock',
    hudGroup: 'stock',
    sortOrder: 50,
    relevantWhen: {
      nodes: ['mountain_frontier', 'toolmaking'],
      terrains: ['mountain'],
      buildings: ['mine', 'quarry'],
      tasks: ['buildMine', 'buildQuarry', 'mineOre'],
    },
  },
  {
    key: 'sand',
    label: 'Sand',
    icon: '\u2301',
    kind: 'stock',
    hudGroup: 'stock',
    sortOrder: 60,
    relevantWhen: {
      nodes: ['harsh_frontier', 'desert_industry'],
      terrains: ['dessert'],
      buildings: ['oven'],
      tasks: ['gatherSand'],
      upgrades: ['glass_house_upgrade'],
    },
  },
  {
    key: 'water_lily',
    label: 'Water Lilies',
    icon: '\uD83E\uDEB7',
    kind: 'item',
    hudGroup: 'item',
    sortOrder: 110,
    relevantWhen: {
      nodes: ['shoreline'],
      tasks: ['harvestWaterLilies', 'placeWaterLilies', 'buildBridge'],
    },
  },
  {
    key: 'tools',
    label: 'Tools',
    icon: '\uD83D\uDEE0\uFE0F',
    kind: 'item',
    hudGroup: 'item',
    sortOrder: 120,
    relevantWhen: {
      nodes: ['toolmaking', 'expansion'],
      buildings: ['workshop', 'townCenter', 'oven'],
      tasks: ['buildWorkshop', 'buildTownCenter', 'buildOven'],
      upgrades: ['warehouse_upgrade', 'sawmill_upgrade', 'reinforced_mine_upgrade', 'glass_house_upgrade'],
    },
  },
  {
    key: 'glass',
    label: 'Glass',
    icon: '\u25C7',
    kind: 'item',
    hudGroup: 'item',
    sortOrder: 130,
    relevantWhen: {
      nodes: ['desert_industry'],
      buildings: ['oven'],
      upgrades: ['glass_house_upgrade'],
    },
  },
  {
    key: 'water',
    label: 'Water',
    icon: '\uD83D\uDCA7',
    kind: 'stock',
    hudGroup: null,
    sortOrder: 210,
  },
  {
    key: 'crystal',
    label: 'Crystal',
    icon: '\uD83D\uDC8E',
    kind: 'stock',
    hudGroup: null,
    sortOrder: 220,
  },
  {
    key: 'artifact',
    label: 'Artifact',
    icon: '\uD83C\uDFFA',
    kind: 'inventory',
    hudGroup: null,
    sortOrder: 230,
  },
] as const;

const INVENTORY_ENTRY_BY_KEY = new Map<ResourceType, InventoryEntryDefinition>(
  INVENTORY_ENTRY_DEFINITIONS.map((entry) => [entry.key, entry]),
);

export function getInventoryEntryDefinition(key: ResourceType) {
  return INVENTORY_ENTRY_BY_KEY.get(key) ?? {
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
    icon: '?',
    kind: 'inventory',
    hudGroup: null,
    sortOrder: 999,
  };
}

export function getInventoryKindLabel(kind: InventoryKind) {
  switch (kind) {
    case 'stock':
      return 'Stock';
    case 'item':
      return 'Item';
    default:
      return 'Inventory';
  }
}

function hasAny<T extends string>(values: readonly T[] | undefined, candidates: readonly T[] | undefined) {
  if (!values?.length || !candidates?.length) return false;
  return candidates.some((candidate) => values.includes(candidate));
}

function hasRelevantUnlock(entry: InventoryEntryDefinition, progression: ProgressionSnapshot | null | undefined) {
  if (!progression || !entry.relevantWhen) {
    return false;
  }

  const relevant = entry.relevantWhen;
  return hasAny(progression.unlockedNodeKeys, relevant.nodes)
    || hasAny(progression.unlocked.terrains, relevant.terrains)
    || hasAny(progression.unlocked.buildings, relevant.buildings)
    || hasAny(progression.unlocked.tasks, relevant.tasks)
    || hasAny(progression.unlocked.upgrades, relevant.upgrades);
}

function shouldShowEntry(entry: InventoryEntryDefinition, context: InventoryVisibilityContext) {
  if (!entry.hudGroup) {
    return false;
  }

  const amount = context.inventory[entry.key] ?? 0;
  return amount > 0 || entry.alwaysVisible === true || hasRelevantUnlock(entry, context.progression);
}

export function getVisibleInventoryEntries(context: InventoryVisibilityContext): VisibleInventoryEntry[] {
  return INVENTORY_ENTRY_DEFINITIONS
    .filter((entry) => shouldShowEntry(entry, context))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      icon: entry.icon,
      group: entry.hudGroup as InventoryDisplayGroup,
      value: Math.floor(context.inventory[entry.key] ?? 0),
    }));
}
