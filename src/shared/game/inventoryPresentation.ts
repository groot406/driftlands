import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { TerrainKey } from '../../core/terrainDefs.ts';
import type {
  BuildingKey,
  ProgressionNodeKey,
  ProgressionSnapshot,
  UpgradeKey,
} from '../story/progression.ts';
import {
  getResourceDefinition,
  RESOURCE_GROUP_DEFINITIONS,
  getResourceGroupDefinition,
  type ResourceCategory,
  type ResourceGroup,
} from './resourceDefinitions.ts';

export type InventoryDisplayGroup = 'stock' | 'item';
export type InventoryKind = InventoryDisplayGroup | 'inventory';
export type InventorySelectionKey = ResourceType | ResourceGroup;

export interface InventoryEntryDefinition {
  key: ResourceType;
  kind: InventoryKind;
  sortOrder: number;
  topBarGroup: ResourceGroup;
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
  group: ResourceGroup;
  category: ResourceCategory;
  kind: InventoryKind;
  isConsumable: boolean;
  value: number;
}

export interface VisibleInventoryGroup {
  key: ResourceGroup;
  label: string;
  shortLabel: string;
  icon: string;
  value: number;
  entries: VisibleInventoryEntry[];
}

export interface InventoryVisibilityContext {
  inventory: Partial<Record<ResourceType, number>>;
  progression?: ProgressionSnapshot | null;
}

export const INVENTORY_ENTRY_DEFINITIONS: readonly InventoryEntryDefinition[] = [
  {
    key: 'food',
    kind: 'stock',
    sortOrder: 10,
    topBarGroup: 'food',
    alwaysVisible: true,
  },
  {
    key: 'bread',
    kind: 'stock',
    sortOrder: 11,
    topBarGroup: 'food',
  },
  {
    key: 'meat',
    kind: 'stock',
    sortOrder: 12,
    topBarGroup: 'food',
  },
  {
    key: 'beer',
    kind: 'stock',
    sortOrder: 13,
    topBarGroup: 'food',
  },
  {
    key: 'wine',
    kind: 'stock',
    sortOrder: 14,
    topBarGroup: 'food',
  },
  {
    key: 'grain',
    kind: 'stock',
    sortOrder: 20,
    topBarGroup: 'crops',
    alwaysVisible: true,
  },
  {
    key: 'hops',
    kind: 'stock',
    sortOrder: 21,
    topBarGroup: 'crops',
    relevantWhen: {
      buildings: ['brewery'],
      tasks: ['seedHops', 'harvestHops'],
      nodes: ['brewing'],
    },
  },
  {
    key: 'grapes',
    kind: 'stock',
    sortOrder: 22,
    topBarGroup: 'crops',
    relevantWhen: {
      tasks: ['seedGrapes', 'harvestGrapes'],
      nodes: ['brewing'],
    },
  },
  {
    key: 'wood',
    kind: 'stock',
    sortOrder: 30,
    topBarGroup: 'materials',
    alwaysVisible: true,
  },
  {
    key: 'stone',
    kind: 'stock',
    sortOrder: 31,
    topBarGroup: 'materials',
    alwaysVisible: true,
  },
  {
    key: 'ore',
    kind: 'stock',
    sortOrder: 32,
    topBarGroup: 'materials',
    relevantWhen: {
      nodes: ['mountain_frontier', 'toolmaking'],
      terrains: ['mountain'],
      buildings: ['mine', 'quarry'],
      tasks: ['buildMine', 'buildQuarry', 'mineOre'],
    },
  },
  {
    key: 'sand',
    kind: 'stock',
    sortOrder: 33,
    topBarGroup: 'materials',
    relevantWhen: {
      nodes: ['harsh_frontier', 'desert_industry'],
      terrains: ['dessert'],
      buildings: ['oven'],
      tasks: ['gatherSand'],
      upgrades: ['glass_house_upgrade'],
    },
  },
  {
    key: 'glass',
    kind: 'stock',
    sortOrder: 34,
    topBarGroup: 'materials',
    relevantWhen: {
      nodes: ['desert_industry'],
      buildings: ['oven'],
      upgrades: ['glass_house_upgrade'],
    },
  },
  {
    key: 'tools',
    kind: 'item',
    sortOrder: 40,
    topBarGroup: 'crafted_goods',
    relevantWhen: {
      nodes: ['toolmaking', 'expansion'],
      buildings: ['workshop', 'townCenter', 'oven'],
      tasks: ['buildWorkshop', 'buildTownCenter', 'buildOven'],
      upgrades: ['warehouse_upgrade', 'sawmill_upgrade', 'reinforced_mine_upgrade', 'glass_house_upgrade'],
    },
  },
  {
    key: 'water',
    kind: 'stock',
    sortOrder: 50,
    topBarGroup: 'utility',
  },
  {
    key: 'water_lily',
    kind: 'item',
    sortOrder: 51,
    topBarGroup: 'crops',
    relevantWhen: {
      nodes: ['shoreline'],
      tasks: ['harvestWaterLilies', 'placeWaterLilies', 'buildBridge'],
    },
  },
  {
    key: 'crystal',
    kind: 'inventory',
    sortOrder: 52,
    topBarGroup: 'utility',
  },
  {
    key: 'artifact',
    kind: 'inventory',
    sortOrder: 53,
    topBarGroup: 'utility',
  },
] as const;

const INVENTORY_ENTRY_BY_KEY = new Map<ResourceType, InventoryEntryDefinition>(
  INVENTORY_ENTRY_DEFINITIONS.map((entry) => [entry.key, entry]),
);

export function getInventoryEntryDefinition(key: ResourceType) {
  const entry = INVENTORY_ENTRY_BY_KEY.get(key);
  const resource = getResourceDefinition(key);
  return {
    key,
    label: resource.label,
    icon: resource.icon,
    kind: entry?.kind ?? 'inventory',
    sortOrder: entry?.sortOrder ?? 999,
    topBarGroup: entry?.topBarGroup ?? resource.group,
    group: resource.group,
    category: resource.category,
    isConsumable: resource.isConsumable,
    alwaysVisible: entry?.alwaysVisible ?? false,
    relevantWhen: entry?.relevantWhen,
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
  const amount = context.inventory[entry.key] ?? 0;
  return amount > 0 || entry.alwaysVisible === true || hasRelevantUnlock(entry, context.progression);
}

export function getVisibleInventoryEntries(context: InventoryVisibilityContext): VisibleInventoryEntry[] {
  return INVENTORY_ENTRY_DEFINITIONS
    .filter((entry) => shouldShowEntry(entry, context))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => {
      const resource = getResourceDefinition(entry.key);
      return {
        key: entry.key,
        label: resource.label,
        icon: resource.icon,
        group: entry.topBarGroup,
        category: resource.category,
        kind: entry.kind,
        isConsumable: resource.isConsumable,
        value: Math.floor(context.inventory[entry.key] ?? 0),
      };
    });
}

export function getVisibleInventoryGroups(context: InventoryVisibilityContext): VisibleInventoryGroup[] {
  const entries = getVisibleInventoryEntries(context);
  const entryMap = new Map<ResourceGroup, VisibleInventoryEntry[]>();

  for (const groupDefinition of RESOURCE_GROUP_DEFINITIONS) {
    entryMap.set(groupDefinition.key, []);
  }

  for (const entry of entries) {
    entryMap.get(entry.group)?.push(entry);
  }

  return RESOURCE_GROUP_DEFINITIONS
    .map((groupDefinition) => ({
      key: groupDefinition.key,
      label: groupDefinition.label,
      shortLabel: groupDefinition.shortLabel,
      icon: groupDefinition.icon,
      entries: (entryMap.get(groupDefinition.key) ?? []).sort((a, b) => {
        const left = INVENTORY_ENTRY_BY_KEY.get(a.key)?.sortOrder ?? 999;
        const right = INVENTORY_ENTRY_BY_KEY.get(b.key)?.sortOrder ?? 999;
        return left - right;
      }),
    }))
    .map((group) => ({
      ...group,
      value: group.entries.reduce((sum, entry) => sum + entry.value, 0),
    }))
    .sort((a, b) => {
      const left = getResourceGroupDefinition(a.key).sortOrder;
      const right = getResourceGroupDefinition(b.key).sortOrder;
      return left - right;
    });
}
