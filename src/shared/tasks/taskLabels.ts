import type { TaskDefinition } from '../../core/types/Task.ts';

const CONTINUE_ACTION_LABELS: Record<string, string> = {
  plantTrees: 'Plant tree',
};

export function getTaskActionLabel(def: TaskDefinition | null | undefined, taskType: string) {
  return CONTINUE_ACTION_LABELS[taskType] ?? def?.label ?? taskType;
}

export function formatContinueTaskLabel(def: TaskDefinition | null | undefined, taskType: string) {
  return `Continue task: ${getTaskActionLabel(def, taskType)}`;
}

