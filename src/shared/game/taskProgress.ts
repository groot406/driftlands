import type { TaskProgressMessage } from '../protocol';
import type { TaskInstance } from './types/Task';
import { broadcastGameMessage as broadcast } from './runtime';

export function activateTaskInstance(task: TaskInstance, nowMs: number = Date.now()) {
  task.createdMs = nowMs;
  task.lastUpdateMs = nowMs;
  task.active = true;
}

export function deactivateTaskInstance(task: TaskInstance) {
  task.active = false;
}

export function broadcastTaskProgress(task: TaskInstance) {
  broadcast({
    type: 'task:progress',
    taskId: task.id,
    progressXp: task.progressXp,
    participants: task.participants,
    collectedResources: task.collectedResources,
    active: task.active,
  } as TaskProgressMessage);
}
