import type { ResourceType } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { ProgressionSnapshot } from '../story/progression.ts';

export type RunMode = 'story_mode';
export type RunStatus = 'active';
export type ObjectiveKind =
  | 'discover_tiles'
  | 'deliver_resource'
  | 'complete_task'
  | 'reach_distance'
  | 'reach_population'
  | 'reach_active_tiles'
  | 'restore_tiles';
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

export interface DialogueSpeakerSnapshot {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface DialogueEntrySnapshot {
  id: string;
  chapterNumber: number;
  kind: 'chapter_intro' | 'chapter_complete' | 'unlock' | 'advice' | 'chapter_catchup';
  speaker: DialogueSpeakerSnapshot;
  text: string;
  createdAt: number;
}

export interface DialogueLogSnapshot {
  activeEntryId: string | null;
  entries: DialogueEntrySnapshot[];
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

export interface CompletedChapterSnapshot {
  chapterNumber: number;
  completedAt: number;
  score: number;
  totalScore: number;
  summary: string;
  mutator: RunMutatorSnapshot;
  chapter: RunStoryBeat;
  objectives: ObjectiveSnapshot[];
}

export type CompletedMissionSnapshot = CompletedChapterSnapshot;

export interface RunMutatorSnapshot {
  key: RunMutatorKey;
  name: string;
  description: string;
}

export interface RunBlueprint {
  mode: RunMode;
  modeLabel: string;
  mutator: RunMutatorSnapshot;
  chapter: RunStoryBeat;
  objectives: ObjectiveBlueprint[];
}

export interface RunSnapshot {
  mode: RunMode;
  modeLabel: string;
  seed: number;
  chapterNumber: number;
  chaptersCompleted: number;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  score: number;
  chapterScore: number;
  discoveredTiles: number;
  activeTiles: number;
  inactiveTiles: number;
  restoredTiles: number;
  summary: string;
  mutator: RunMutatorSnapshot;
  chapter: RunStoryBeat;
  progression: ProgressionSnapshot;
  objectives: ObjectiveSnapshot[];
  dialogue: DialogueLogSnapshot;
  chapterArchive: CompletedChapterSnapshot[];
  lastCompletedChapter?: CompletedChapterSnapshot;
}
