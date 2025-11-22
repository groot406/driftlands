import {reactive} from 'vue';
import type {TaskInstance, TaskType} from '../core/tasks';
import {getTaskDefinition} from '../core/taskRegistry';
import {hexDistance, type Tile, tileIndex} from '../core/world';
import type {Hero} from './heroStore';
import {idleStore} from './idleStore';

interface TaskState {
    tasks: TaskInstance[];
    taskIndex: Record<string, TaskInstance>; // id -> instance
    tasksByTile: Record<string, Record<string, string>>; // tileId -> (taskType -> taskId)
    nextId: number;
}

function createState(): TaskState {
    return reactive({
        tasks: [],
        taskIndex: {},
        tasksByTile: {},
        nextId: 1,
    });
}

export const taskStore = createState();

function makeId(state: TaskState) {
    return 'task_' + (state.nextId++);
}

// Remove a task instance from all indices
function removeTask(inst: TaskInstance) {
    const idx = taskStore.tasks.findIndex(t => t.id === inst.id);
    if (idx >= 0) taskStore.tasks.splice(idx, 1);
    delete taskStore.taskIndex[inst.id];
    const tileTasks = taskStore.tasksByTile[inst.tileId];
    if (tileTasks) {
        delete tileTasks[inst.type];
        // Optionally prune empty map (not strictly required)
        if (!Object.keys(tileTasks).length) {
            // leave for now; could delete taskStore.tasksByTile[inst.tileId]
        }
    }
}

export function detachHeroFromCurrentTask(hero: Hero) {
    if (hero.currentTaskId) {
        leaveTask(hero.currentTaskId, hero)
    }
}

export function startTask(tile: Tile, type: TaskType, starter: Hero): TaskInstance | null {
    // Before starting, detach hero from any current task.
    detachHeroFromCurrentTask(starter);
    const def = getTaskDefinition(type);
    if (!def) return null;
    if (!taskStore.tasksByTile[tile.id]) {
        taskStore.tasksByTile[tile.id] = {};
    }

    if (taskStore.tasksByTile[tile.id][type]) return taskStore.taskIndex[taskStore.tasksByTile[tile.id][type]] || null;
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
    starter.currentTaskId = inst.id;
    return inst;
}

export function joinTask(taskId: string, hero: Hero) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst || !inst.active || inst.completedTick) return;
    if (hero.currentTaskId === inst.id) return; // already on this task
    detachHeroFromCurrentTask(hero);
    if (!inst.participants[hero.id]) inst.participants[hero.id] = 0;
    hero.currentTaskId = inst.id;
}

export function leaveTask(taskId: string, hero: string) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst) return;

    delete inst.participants[hero.id];
    if (hero.currentTaskId === taskId) hero.currentTaskId = undefined;
    if (!Object.keys(inst.participants).length) {
        removeTask(inst);
    }
}

export function getTaskByTile(tileId: string, taskType: TaskType): TaskInstance | undefined {
    const tileTasks = taskStore.tasksByTile[tileId];
    if (!tileTasks) return undefined;
    const id = tileTasks[taskType];
    return id ? taskStore.taskIndex[id] : undefined;
}

export function updateActiveTasks(heroes: Hero[]) {
    // Called each tick from idle loop
    for (const inst of taskStore.tasks.slice()) { // slice to avoid issues if tasks removed mid-loop
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
        // If task lost all heroes (e.g. removed elsewhere) ensure cleanup
        if (!parts.length) {
            removeTask(inst);
            continue;
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
            cleanupCompletedTasks();
        }
    }
}

function rewardXpToParticipants(instance: TaskInstance, participants: Hero[]) {
    const def = getTaskDefinition(instance.type);
    if (!def) return;

    const totalContrib = Object.values(instance.participants).reduce((a, b) => a + b, 0) || 1;
    const distance = hexDistance(tileIndex[instance.tileId]!.q, tileIndex[instance.tileId]!.r);
    for (const hero of participants) {
        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;

        const rewards = def.totalRewardedStats(distance);
        for (const stat in rewards) {
            const statReward = rewards[stat];
            const rewardAmount = Math.ceil(statReward * share);
            hero.stats[stat] += rewardAmount;
        }
    }
}

export function cleanupCompletedTasks() {
    for (let i = taskStore.tasks.length - 1; i >= 0; i--) {
        const t = taskStore.tasks[i]!;
        if (t.completedTick !== undefined) {
            removeTask(t);
        }
    }
}
