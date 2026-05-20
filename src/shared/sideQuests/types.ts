import type { ResourceAmount } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';

export type SideQuestDefinitionId = 'lost_hero_distress';
export type SideQuestInstanceStatus = 'signaled' | 'active' | 'completed';

export interface SideQuestSignalDefinition {
  label: string;
  minDistance: number;
  maxDistance: number;
}

export type SideQuestObjectiveDefinition =
  | {
      id: string;
      kind: 'complete_task';
      title: string;
      description: string;
      taskType: TaskType;
      target: number;
      tileScope: 'quest_tile';
    };

export type SideQuestRewardDefinition =
  | {
      kind: 'hero';
      label: string;
    };

export interface SideQuestDialogueDefinition {
  reveal: string[];
  complete: string[];
}

export interface SideQuestNpcDefinition {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

export interface SideQuestDefinition {
  id: SideQuestDefinitionId;
  title: string;
  signal: SideQuestSignalDefinition;
  npc: SideQuestNpcDefinition;
  objectives: SideQuestObjectiveDefinition[];
  rewards: SideQuestRewardDefinition[];
  requiredResources?: ResourceAmount[];
  dialogue: SideQuestDialogueDefinition;
}

export interface SideQuestObjectiveSnapshot {
  id: string;
  title: string;
  description: string;
  kind: SideQuestObjectiveDefinition['kind'];
  progress: number;
  target: number;
  completed: boolean;
}

export interface SideQuestInstance {
  id: string;
  definitionId: SideQuestDefinitionId;
  status: SideQuestInstanceStatus;
  signalTileId: string;
  q: number;
  r: number;
  spawnSettlementId?: string | null;
  ownerPlayerId?: string | null;
  ownerSettlementId?: string | null;
  discoveredByHeroId?: string | null;
  objectives: SideQuestObjectiveSnapshot[];
  createdAt: number;
  revealedAt?: number;
  completedAt?: number;
}
