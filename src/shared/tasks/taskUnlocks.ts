import type { TaskType } from '../../core/types/Task.ts';
import { isStoryTaskUnlocked } from '../story/progressionState.ts';

const ALWAYS_AVAILABLE_TASK_KEYS = new Set<string>(['dismantle']);

export function isTaskUnlockedForUse(taskKey: TaskType | string | null | undefined) {
  return !!taskKey && (ALWAYS_AVAILABLE_TASK_KEYS.has(taskKey) || isStoryTaskUnlocked(taskKey));
}
