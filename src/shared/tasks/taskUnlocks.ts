import type { TaskType } from '../../core/types/Task.ts';
import { getBuildingDefinitionByTaskKey } from '../buildings/registry.ts';
import { getUpgradeDefinitionByTaskKey } from '../buildings/upgrades.ts';
import { getStoryProgressionState, isStoryTaskUnlocked } from '../story/progressionState.ts';
import {
  getUnlockingNodeSnapshotForContent,
  type ProgressionNodeSnapshot,
  type ProgressionUnlockKind,
} from '../story/progression.ts';

const ALWAYS_AVAILABLE_TASK_KEYS = new Set<string>(['dismantle', 'walk']);

export interface TaskUnlockStatus {
  unlocked: boolean;
  contentKind: ProgressionUnlockKind | 'always';
  contentKey: string;
  lockingNode: ProgressionNodeSnapshot | null;
}

function resolveContentForTask(taskKey: TaskType | string) {
  const building = getBuildingDefinitionByTaskKey(taskKey);
  if (building) {
    return {
      kind: 'building' as const,
      key: building.key,
    };
  }

  const upgrade = getUpgradeDefinitionByTaskKey(taskKey);
  if (upgrade) {
    return {
      kind: 'upgrade' as const,
      key: upgrade.key,
    };
  }

  return {
    kind: 'task' as const,
    key: taskKey,
  };
}

export function getTaskUnlockStatus(taskKey: TaskType | string | null | undefined): TaskUnlockStatus {
  if (!taskKey) {
    return {
      unlocked: false,
      contentKind: 'task',
      contentKey: '',
      lockingNode: null,
    };
  }

  if (ALWAYS_AVAILABLE_TASK_KEYS.has(taskKey)) {
    return {
      unlocked: true,
      contentKind: 'always',
      contentKey: taskKey,
      lockingNode: null,
    };
  }

  const progression = getStoryProgressionState();
  const content = resolveContentForTask(taskKey);
  const lockingNode = getUnlockingNodeSnapshotForContent(progression, content.kind, content.key);
  const unlocked = content.kind === 'task'
    ? isStoryTaskUnlocked(taskKey as TaskType)
    : !!lockingNode?.unlocked;

  return {
    unlocked,
    contentKind: content.kind,
    contentKey: content.key,
    lockingNode,
  };
}

export function isTaskUnlockedForUse(taskKey: TaskType | string | null | undefined) {
  return getTaskUnlockStatus(taskKey).unlocked;
}
