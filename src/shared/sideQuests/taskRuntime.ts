import type { ResourceAmount } from '../../core/types/Resource.ts';
import type { TaskType } from '../../core/types/Task.ts';
import type { SideQuestInstance } from './types.ts';

export interface SideQuestTaskRuntime {
  getActiveSideQuestForTask(tileId: string, taskType: TaskType): SideQuestInstance | null;
  getSideQuestRequiredResources(tileId: string, taskType: TaskType): ResourceAmount[];
}

const defaultSideQuestTaskRuntime: SideQuestTaskRuntime = {
  getActiveSideQuestForTask: () => null,
  getSideQuestRequiredResources: () => [],
};

let sideQuestTaskRuntime: SideQuestTaskRuntime = defaultSideQuestTaskRuntime;

export function configureSideQuestTaskRuntime(runtime: Partial<SideQuestTaskRuntime>) {
  sideQuestTaskRuntime = {
    ...sideQuestTaskRuntime,
    ...runtime,
  };
}

export function resetSideQuestTaskRuntime() {
  sideQuestTaskRuntime = defaultSideQuestTaskRuntime;
}

export function getActiveSideQuestForTask(tileId: string, taskType: TaskType) {
  return sideQuestTaskRuntime.getActiveSideQuestForTask(tileId, taskType);
}

export function getSideQuestRequiredResources(tileId: string, taskType: TaskType) {
  return sideQuestTaskRuntime.getSideQuestRequiredResources(tileId, taskType);
}
