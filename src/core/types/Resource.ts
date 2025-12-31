export type ResourceType = 'wood' | 'ore' | 'stone' | 'food' | 'crystal' | 'artifact' | 'water' | 'grain';
export type ResourceAmount = { type: ResourceType; amount: number };