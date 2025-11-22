import {reactive} from 'vue';
import type {TaskInstance, TaskType} from '../core/tasks';
import {getTaskDefinition} from '../core/taskRegistry';
import {hexDistance, type Tile} from '../core/world';
import {tileIndex} from '../core/world';
import type {Hero} from './heroStore';
import {idleStore} from './idleStore';

interface TaskState {
    tasks: TaskInstance[];
    taskIndex: Record<string, TaskInstance>; // id -> instance
    tasksByTile: Record<string, string>; // tileId -> taskId
    selectedTaskTypeByTile: Record<string, TaskType | undefined>; // UI pre-selection
    nextId: number;
}

function createState(): TaskState {
    return reactive({
        tasks: [],
        taskIndex: {},
        tasksByTile: {},
        selectedTaskTypeByTile: {},
        nextId: 1,
    });
}

export const taskStore = createState();

function makeId(state: TaskState) {
    return 'task_' + (state.nextId++);
}

export function selectTaskTypeForTile(tileId: string, type: TaskType | undefined) {
    taskStore.selectedTaskTypeByTile[tileId] = type;
}

export function startTask(tile: Tile, type: TaskType, starter: Hero): TaskInstance | null {
    const def = getTaskDefinition(type);
    if (!def) return null;
    if (taskStore.tasksByTile[tile.id][taskType]) return taskStore.taskIndex[taskStore.tasksByTile[tile.id][type]] || null;
    const distance = hexDistance(tile.q, tile.r);
    const inst: TaskInstance = {
        id: makeId(taskStore),
        type,
        tileId: tile.id,
        progressXp: 0,
        requiredXp: def.requiredXp(distance),
        createdTick: idleStore.tick,
        participants: {},
        active: true,
    };
    inst.participants[starter.id] = 0;
    taskStore.tasks.push(inst);
    taskStore.taskIndex[inst.id] = inst;
    taskStore.tasksByTile[tile.id][type] = inst.id;
    def.onStart?.(tile, [starter]);
    return inst;
}

export function joinTask(taskId: string, hero: Hero) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst || !inst.active || inst.completedTick) return;
    if (!inst.participants[hero.id]) inst.participants[hero.id] = 0;
}

export function leaveTask(taskId: string, heroId: string) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst) return;
    delete inst.participants[heroId];
}

export function getTaskByTile(tileId: string, taskType: TaskType): TaskInstance | undefined {
    const id = taskStore.tasksByTile[tileId][taskType];
    return id ? taskStore.taskIndex[id] : undefined;
}

export function getSelectedTaskForTile(tileId: string): TaskType | undefined {
    return taskStore.selectedTaskTypeByTile[tileId];
}

export function updateActiveTasks(heroes: Hero[]) {
    // Called each tick from idle loop
    for (const inst of taskStore.tasks) {
        console.log(inst);
        if (!inst.active || inst.completedTick) continue;
        const def = getTaskDefinition(inst.type);
        if (!def) continue;
        const tile: Tile | undefined = tileIndex[inst.tileId];
        if (!tile) continue;
        const parts: Hero[] = [];
        for (const heroId of Object.keys(inst.participants)) {
            const h = heroes.find(hh => hh.id === heroId);
            if (h) parts.push(h);
        }
        let tickContribution = 0;
        for (const hero of parts) {
            const rate = def.heroRate(hero, tile);
            inst.participants[hero.id] += rate; // accumulate hero-specific xp contribution track
            tickContribution += rate;
        }
        inst.progressXp += tickContribution;
        def.onProgress?.(tile, inst);
        if (inst.progressXp >= inst.requiredXp) {
            inst.progressXp = inst.requiredXp;
            inst.completedTick = idleStore.tick;
            inst.active = false;
            def.onComplete(tile, inst, parts);
            rewardXpToParticipants(inst, parts);
        }
    }
}

function rewardXpToParticipants(instance: TaskInstance, participants: Hero[]) {
    const def = getTaskDefinition(instance.type);
    if (!def) return;

    const totalContrib = Object.values(instance.participants).reduce((a, b) => a + b, 0) || 1;
    const rewardPool = def.totalRewardXp || 0;
    for (const hero of participants) {
        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;

        for(const stat in def.totalRewardedStats) {
            const statReward = def.totalRewardedStats[stat];
            const rewardAmount = Math.round(statReward * share);
            hero.stats[stat] += rewardAmount;
        }
    }
}

export function cleanupCompletedTasks() {
    // Remove tasks that are completed and whose tiles are discovered; for persistence reasons maybe keep them longer later.
    for (let i = taskStore.tasks.length - 1; i >= 0; i--) {
        const t = taskStore.tasks[i]!;
        if (t.completedTick !== undefined) {
            // For now keep them (could prune after N ticks)
        }
    }
}
