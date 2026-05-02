import type { ResourceType } from '../../core/types/Resource.ts';

export type ResourceGroup =
  | 'food'
  | 'crops'
  | 'materials'
  | 'crafted_goods'
  | 'utility';

export type ResourceCategory =
  | 'hunger_food'
  | 'social_drink'
  | 'raw_crop'
  | 'raw_material'
  | 'crafted_good'
  | 'utility';

export interface ResourceDefinition {
  type: ResourceType;
  group: ResourceGroup;
  category: ResourceCategory;
  label: string;
  icon: string;
  isConsumable: boolean;
}

export interface ResourceGroupDefinition {
  key: ResourceGroup;
  label: string;
  shortLabel: string;
  icon: string;
  sortOrder: number;
}

export const RESOURCE_GROUP_DEFINITIONS: readonly ResourceGroupDefinition[] = [
  { key: 'food', label: 'Food', shortLabel: 'Food', icon: '🍞', sortOrder: 10 },
  { key: 'crops', label: 'Crops', shortLabel: 'Crops', icon: '🌿', sortOrder: 20 },
  { key: 'materials', label: 'Materials', shortLabel: 'Materials', icon: '🧱', sortOrder: 30 },
  { key: 'crafted_goods', label: 'Crafted Goods', shortLabel: 'Crafted', icon: '🛠️', sortOrder: 40 },
  { key: 'utility', label: 'Utility', shortLabel: 'Utility', icon: '💧', sortOrder: 50 },
] as const;

export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  { type: 'food', label: 'Rations', icon: '🥣', group: 'food', category: 'hunger_food', isConsumable: true },
  { type: 'bread', label: 'Bread', icon: '🍞', group: 'food', category: 'hunger_food', isConsumable: true },
  { type: 'meat', label: 'Meat', icon: '🍖', group: 'food', category: 'hunger_food', isConsumable: true },
  { type: 'beer', label: 'Beer', icon: '🍺', group: 'food', category: 'social_drink', isConsumable: true },
  { type: 'wine', label: 'Wine', icon: '🍷', group: 'food', category: 'social_drink', isConsumable: true },
  { type: 'grain', label: 'Grain', icon: '🌾', group: 'crops', category: 'raw_crop', isConsumable: false },
  { type: 'hops', label: 'Hops', icon: '🌿', group: 'crops', category: 'raw_crop', isConsumable: false },
  { type: 'grapes', label: 'Grapes', icon: '🍇', group: 'crops', category: 'raw_crop', isConsumable: false },
  { type: 'water_lily', label: 'Water Lilies', icon: '🪷', group: 'crops', category: 'raw_crop', isConsumable: false },
  { type: 'wood', label: 'Wood', icon: '🌲', group: 'materials', category: 'raw_material', isConsumable: false },
  { type: 'stone', label: 'Stone', icon: '🪨', group: 'materials', category: 'raw_material', isConsumable: false },
  { type: 'ore', label: 'Ore', icon: '⛏️', group: 'materials', category: 'raw_material', isConsumable: false },
  { type: 'sand', label: 'Sand', icon: '⌁', group: 'materials', category: 'raw_material', isConsumable: false },
  { type: 'glass', label: 'Glass', icon: '◇', group: 'materials', category: 'raw_material', isConsumable: false },
  { type: 'tools', label: 'Tools', icon: '🛠️', group: 'crafted_goods', category: 'crafted_good', isConsumable: false },
  { type: 'water', label: 'Water', icon: '💧', group: 'utility', category: 'utility', isConsumable: false },
  { type: 'crystal', label: 'Crystal', icon: '💎', group: 'utility', category: 'utility', isConsumable: false },
  { type: 'artifact', label: 'Artifact', icon: '🏺', group: 'utility', category: 'utility', isConsumable: false },
] as const;

const RESOURCE_DEFINITION_BY_TYPE = new Map<ResourceType, ResourceDefinition>(
  RESOURCE_DEFINITIONS.map((definition) => [definition.type, definition]),
);

const RESOURCE_GROUP_DEFINITION_BY_KEY = new Map<ResourceGroup, ResourceGroupDefinition>(
  RESOURCE_GROUP_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function getResourceDefinition(type: ResourceType): ResourceDefinition {
  return RESOURCE_DEFINITION_BY_TYPE.get(type) ?? {
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '),
    icon: '?',
    group: 'utility',
    category: 'utility',
    isConsumable: false,
  };
}

export function getResourceGroupDefinition(group: ResourceGroup): ResourceGroupDefinition {
  return RESOURCE_GROUP_DEFINITION_BY_KEY.get(group) ?? {
    key: group,
    label: group.replace(/_/g, ' '),
    shortLabel: group.replace(/_/g, ' '),
    icon: '?',
    sortOrder: 999,
  };
}

export function listResourceDefinitions() {
  return RESOURCE_DEFINITIONS.slice();
}
