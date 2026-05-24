import type { ResourceType } from '../../core/types/Resource.ts';

export type ResourceGroup =
  | 'food'
  | 'crops'
  | 'materials'
  | 'crafted_goods'
  | 'trade_goods';

export type ResourceCategory =
  | 'hunger_food'
  | 'social_drink'
  | 'raw_crop'
  | 'raw_material'
  | 'crafted_good'
  | 'utility'
  | 'luxury_good';

export interface ResourceDefinition {
  type: ResourceType;
  group: ResourceGroup;
  category: ResourceCategory;
  label: string;
  icon: string;
  isConsumable: boolean;
  hungerRelief?: number;
  happinessGain?: number;
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
  { key: 'trade_goods', label: 'Trade Goods', shortLabel: 'Trade', icon: '🫖', sortOrder: 50 },
] as const;

export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  // Virtual requirement token: tasks can ask for "Food" while stock comes from fish, meat, or bread.
  { type: 'food', label: 'Food', icon: '🍽️', group: 'food', category: 'utility', isConsumable: false },
  { type: 'fish', label: 'Fish', icon: '🐟', group: 'food', category: 'hunger_food', isConsumable: true, hungerRelief: 1.25 },
  { type: 'bread', label: 'Bread', icon: '🍞', group: 'food', category: 'hunger_food', isConsumable: true, hungerRelief: 2 },
  { type: 'meat', label: 'Meat', icon: '🍖', group: 'food', category: 'hunger_food', isConsumable: true, hungerRelief: 1.5 },
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
  { type: 'weapons', label: 'Weapons', icon: '🗡️', group: 'crafted_goods', category: 'crafted_good', isConsumable: false },
  { type: 'water', label: 'Water', icon: '💧', group: 'crops', category: 'utility', isConsumable: false },
  { type: 'tea', label: 'Tea', icon: '🫖', group: 'trade_goods', category: 'luxury_good', isConsumable: true, happinessGain: 18 },
  { type: 'pottery', label: 'Pottery', icon: '🏺', group: 'trade_goods', category: 'luxury_good', isConsumable: true, happinessGain: 14 },
  { type: 'spices', label: 'Spices', icon: '✦', group: 'trade_goods', category: 'luxury_good', isConsumable: true, happinessGain: 22 },
  { type: 'silk', label: 'Silk', icon: '▰', group: 'trade_goods', category: 'luxury_good', isConsumable: true, happinessGain: 25 },
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
    group: 'materials',
    category: 'utility',
    isConsumable: false,
  };
}

export const HUNGER_FOOD_TYPES = ['bread', 'meat', 'fish'] as const satisfies readonly ResourceType[];
export const FOOD_SOURCE_TYPES = HUNGER_FOOD_TYPES;
export const TRADE_GOOD_TYPES = ['tea', 'pottery', 'spices', 'silk'] as const satisfies readonly ResourceType[];

export function getResourceHungerRelief(type: ResourceType) {
  return getResourceDefinition(type).hungerRelief ?? 0;
}

export function getHungerFoodMealValue(inventory: Partial<Record<ResourceType, number>>) {
  return HUNGER_FOOD_TYPES.reduce((sum, resourceType) => {
    const stock = Math.max(0, inventory[resourceType] ?? 0);
    return sum + (stock * getResourceHungerRelief(resourceType));
  }, 0);
}

export function isHungerFoodResource(type: ResourceType) {
  return getResourceHungerRelief(type) > 0;
}

export function isFoodSourceResource(type: ResourceType) {
  return (FOOD_SOURCE_TYPES as readonly ResourceType[]).includes(type);
}

export function getTradeGoodHappinessGain(type: ResourceType) {
  return getResourceDefinition(type).happinessGain ?? 0;
}

export function isTradeGoodResource(type: ResourceType) {
  return getTradeGoodHappinessGain(type) > 0;
}

export function getFoodSourceStock(inventory: Partial<Record<ResourceType, number>>) {
  return FOOD_SOURCE_TYPES.reduce((sum, resourceType) => {
    return sum + Math.max(0, inventory[resourceType] ?? 0);
  }, 0);
}

export function getResourceRequirementStock(
  inventory: Partial<Record<ResourceType, number>>,
  resourceType: ResourceType,
) {
  return resourceType === 'food'
    ? getFoodSourceStock(inventory)
    : Math.max(0, inventory[resourceType] ?? 0);
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
