import type { ResourceType } from './Resource';

export type ScoutTargetType = Extract<ResourceType, 'wood' | 'water' | 'stone' | 'ore' | 'sand'> | 'snow';
