import type { TaskDefinition, TaskType } from './tasks';

export function listTaskDefinitions(): TaskDefinition[] {
    return Object.values(registry);
}

export function getTaskDefinition(type: TaskType): TaskDefinition | undefined {
    return registry[type];
}

export function registerTask(def: TaskDefinition) {
    registry[def.key] = def;
}

const registry: Record<string, TaskDefinition> = {};
