import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { StoryProgressionSnapshot } from '../story/progression.ts';

export type RunMode = 'story_mode';
export type RunStatus = 'active';
export type ObjectiveKind = 'discover_tiles' | 'deliver_resource' | 'complete_task' | 'reach_distance' | 'reach_population';
export type RunMutatorKey =
  | 'open_frontier'
  | 'timber_rush'
  | 'prospectors_call'
  | 'foragers_feast'
  | 'roadworks_drive'
  | 'new_hearths';

export interface RunStoryBeat {
  chapterId: string;
  chapterLabel: string;
  actLabel: string;
  title: string;
  kicker: string;
  briefing: string;
  stakes: string;
  guidance: string;
  completionTitle: string;
  completionText: string;
  failureTitle: string;
  failureText: string;
  nextHint: string;
}

export interface ObjectiveReward {
  label: string;
  scoreBonus?: number;
}

export interface ObjectiveBlueprint {
  id: string;
  title: string;
  description: string;
  kind: ObjectiveKind;
  required: boolean;
  target: number;
  resourceType?: ResourceType;
  taskType?: TaskType;
  reward?: ObjectiveReward;
}

export interface ObjectiveSnapshot extends ObjectiveBlueprint {
  progress: number;
  completed: boolean;
}

export interface CompletedMissionSnapshot {
  missionNumber: number;
  completedAt: number;
  score: number;
  totalScore: number;
  summary: string;
  mutator: RunMutatorSnapshot;
  story: RunStoryBeat;
  objectives: ObjectiveSnapshot[];
}

export interface RunMutatorSnapshot {
  key: RunMutatorKey;
  name: string;
  description: string;
}

export interface RunBlueprint {
  mode: RunMode;
  modeLabel: string;
  mutator: RunMutatorSnapshot;
  story: RunStoryBeat;
  progression: StoryProgressionSnapshot;
  objectives: ObjectiveBlueprint[];
}

export interface RunSnapshot {
  mode: RunMode;
  modeLabel: string;
  seed: number;
  missionNumber: number;
  missionsCompleted: number;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  score: number;
  missionScore: number;
  discoveredTiles: number;
  summary: string;
  mutator: RunMutatorSnapshot;
  story: RunStoryBeat;
  progression: StoryProgressionSnapshot;
  objectives: ObjectiveSnapshot[];
  lastCompletedMission?: CompletedMissionSnapshot;
}
