import {getTaskDefinition} from '../shared/tasks/taskRegistry';
import {ensureTileExists, tileIndex} from '../core/world';
import {getDistanceToNearestTowncenter} from '../shared/game/worldQueries';
import {getStorageResourceAmount, withdrawResourceFromStorage} from './resourceStore';
import {PathService} from "../core/PathService";
import {heroes} from "./heroStore";
import type {Hero, HeroStats} from "../core/types/Hero";
import type {Tile} from "../core/types/Tile";
import type {TaskDefinition, TaskInstance, TaskType} from "../core/types/Task";
import type {ResourceAmount, ResourceType} from "../core/types/Resource";
import type {
    TaskCompletedMessage,
    TaskCreatedMessage,
    TaskRemovedMessage,
    ResourceWithdrawMessage,
} from "../shared/protocol.ts";
import { broadcastGameMessage as broadcast, moveHeroWithRuntime } from '../shared/game/runtime';
import { activateTaskInstance, broadcastTaskProgress, deactivateTaskInstance } from '../shared/game/taskProgress';
import { clearHeroPayload, setHeroFetchIntent, setHeroPayload } from '../shared/game/heroPayload';
import { collectTerrainCluster } from '../shared/game/terrainCluster';
import { emitGameplayEvent } from '../shared/gameplay/events';
import { axialDistanceCoords } from '../shared/game/hex';
import { canUseWarehouseAtTile, findNearestWarehouseAccessTile, findNearestWarehouseWithCapacity, findNearestWarehouseWithResource } from '../shared/buildings/storage';
import { canDrawWaterFromTile, findNearestWaterAccessTile } from '../shared/buildings/water';
import { isHeroWorkingTask } from '../shared/game/heroTaskState';
import { isStoryTaskUnlocked } from '../shared/story/progressionState.ts';

const service = new PathService();
const TASK_CHAIN_DELAY_MS = 180;

interface TaskState {
    tasks: TaskInstance[];
    taskIndex: Record<string, TaskInstance>; // id -> instance
    tasksByTile: Record<string, Record<string, string>>; // tileId -> (taskType -> taskId)
    nextId: number;
}

function createState(): TaskState {
    return {
        tasks: [],
        taskIndex: {},
        tasksByTile: {},
        nextId: 1,
    };
}

export const taskStore = createState();

export function loadTasks(tasks: TaskInstance[]) {
    taskStore.tasks = tasks;
    taskStore.taskIndex = {};
    taskStore.tasksByTile = {};
    for (const task of tasks) {
        taskStore.taskIndex[task.id] = task;
        taskStore.tasksByTile[task.tileId] = taskStore.tasksByTile[task.tileId] || {};
        taskStore.tasksByTile[task.tileId]![task.type] = task.id;
    }
}

export function addTask(task: TaskInstance) {
    taskStore.tasks.push(task);
    taskStore.taskIndex[task.id] = task;
    taskStore.tasksByTile[task.tileId] = taskStore.tasksByTile[task.tileId] || {};
    taskStore.tasksByTile[task.tileId]![task.type] = task.id;
}

export function doRemoveTask(inst: TaskInstance) {
    // Remove task for participants
    for (const heroId of Object.keys(inst.participants)) {
        const hero = heroes.find(h => h.id === heroId);
        if(!hero) continue;
        hero.currentTaskId = undefined;
    }

    const idx = taskStore.tasks.findIndex(t => t.id === inst.id);
    if (idx >= 0) taskStore.tasks.splice(idx, 1);
    delete taskStore.taskIndex[inst.id];
    const tileTasks = taskStore.tasksByTile[inst.tileId];
    if (tileTasks) {
        delete tileTasks[inst.type];
    }
}

function makeId(state: TaskState) {
    return 'task_' + (state.nextId++);
}

// Remove a task instance from all indices
export function removeTask(inst: TaskInstance) {
    doRemoveTask(inst);
    // detach any heroes that still reference this task
    for (const hero of heroes) {
        if (hero.currentTaskId === inst.id) {
            hero.currentTaskId = undefined;
        }
    }

    broadcast({
        type: 'task:removed',
        taskId: inst.id,
        tileId: inst.tileId,
    } as TaskRemovedMessage);
}

export function detachHeroFromCurrentTask(hero: Hero) {
    if (hero.currentTaskId) {
        leaveTask(hero.currentTaskId, hero);
    }
}

function getRemainingResources(task: TaskInstance): ResourceAmount[] {
    if (!task.requiredResources) return [];

    const remaining: ResourceAmount[] = [];
    for (const required of task.requiredResources) {
        const collected = task.collectedResources?.find((collected) => collected.type === required.type)?.amount || 0;
        const stillNeeded = required.amount - collected;
        if (stillNeeded > 0) {
            remaining.push({type: required.type, amount: stillNeeded});
        }
    }
    return remaining;
}

export function addResourcesToTask(task: TaskInstance, carrying: ResourceAmount): number {
    if (!task.collectedResources) {
        task.collectedResources = [];
    }

    // If task has no requirements, ignore deposits
    if (!task.requiredResources || task.requiredResources.length === 0) {
        return 0;
    }

    const resourceType = carrying.type;
    const required = task.requiredResources.find(r => r.type === resourceType);
    if (!required) {
        return 0; // this resource not required
    }

    // Determine how much is still needed for this resource
    const currentAmount = task.collectedResources.find(collected => collected.type === resourceType)?.amount || 0;
    const stillNeeded = Math.max(0, required.amount - currentAmount);
    if (stillNeeded <= 0) {
        return 0; // already fulfilled this resource
    }

    const amountToAdd = Math.min(stillNeeded, Math.max(0, carrying.amount));
    if (amountToAdd <= 0) {
        return 0;
    }

    // Update or add the collected resource amount
    const existingResource = task.collectedResources.find(collected => collected.type === resourceType);
    if (existingResource) {
        existingResource.amount = currentAmount + amountToAdd;
    } else {
        task.collectedResources.push({ type: resourceType, amount: amountToAdd });
    }

    // After deposit, check if all requirements are met and (re)activate task
    const remaining = getRemainingResources(task);
    if (remaining.length === 0) {
        activateTaskInstance(task);
    } else {
        deactivateTaskInstance(task);
    }

    broadcastTaskProgress(task);

    return amountToAdd;
}

// Check if hero needs to fetch resources and initiate the fetch if needed
function checkAndInitiateResourceFetch(targetTile: Tile, requiredResources: ResourceAmount[], hero: Hero, taskType: TaskType, inst?: TaskInstance): boolean {
    // If hero is already fetching resources for this task, don't initiate another fetch
    if (hero.carryingPayload && hero.returnPos &&
        hero.returnPos.q === targetTile.q && hero.returnPos.r === targetTile.r) {
        return true; // Already fetching for this task
    }

    // If hero is already carrying required resource, they're ready to work
    if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
        const carrying = hero.carryingPayload;
        const hasRequired = requiredResources.some(
            req => req.type === carrying.type && carrying.amount >= req.amount
        );
        if (hasRequired) {
            return false; // Hero has resource, can start task
        }
    }

    // Find the first required resource and fetch location
    for (const resource of requiredResources) {
        let fetchLocation: { q: number; r: number } | null = null;

        if (resource.type === 'water') {
            // For water, find nearest walkable tile adjacent to water
            const waterLocation = findNearestWaterTile(hero.q, hero.r);
            if (waterLocation) {
                fetchLocation = { q: waterLocation.q, r: waterLocation.r };
            } else {
                continue;
            }
        } else {
            // For other resources, find nearest warehouse with the resource
            const found = findNearestWarehouseWithResource(hero.q, hero.r, resource.type, resource.amount);
            if (found) fetchLocation = { q: found.q, r: found.r };
        }

        if (fetchLocation) {
            // Find path to fetch location
            const pathToFetch = service.findWalkablePath(hero.q, hero.r, fetchLocation.q, fetchLocation.r);
            if (pathToFetch && pathToFetch.length > 0) {
                // Store task info so hero can return after fetching
                setHeroFetchIntent(hero, targetTile.id, taskType, { q: targetTile.q, r: targetTile.r }, resource);

                moveHeroWithRuntime(hero, fetchLocation);
                return true; // Resource fetch initiated
            }

            // Handle zero-length path: hero already at optimal fetch location
            if (pathToFetch && pathToFetch.length === 0) {
                // Ensure we have a task instance to deposit to
                if (!inst) {
                    // Without instance, we cannot deposit immediately; treat as no fetch initiated
                    continue;
                }

                // Prepare carrying intent
                setHeroFetchIntent(hero, targetTile.id, taskType, { q: targetTile.q, r: targetTile.r }, resource);

                // Immediate pickup logic
                const currentTile = ensureTileExists(hero.q, hero.r);

                if (resource.type === 'water') {
                    // Check adjacency to water and pick up instantly
                    if (canDrawWaterFromTile(currentTile)) {
                        setHeroPayload(hero, { type: 'water', amount: 1 });
                    } else {
                        // Not actually adjacent to water; skip
                        continue;
                    }
                } else {
                    // Warehouse immediate pickup when standing on a valid warehouse access tile with stock
                    const available = getStorageResourceAmount(currentTile.id, resource.type);
                    if (canUseWarehouseAtTile(currentTile) && available > 0) {
                        const amountToTake = withdrawResourceFromStorage(currentTile.id, resource.type, Math.min(resource.amount, 10));
                        if (amountToTake <= 0) {
                            continue;
                        }

                        broadcast({
                            type: 'resource:withdraw',
                            heroId: hero.id,
                            storageTileId: currentTile.id,
                            resource: {
                                type: resource.type,
                                amount: amountToTake,
                            },
                        } as ResourceWithdrawMessage);
                        setHeroPayload(hero, { type: resource.type, amount: amountToTake });
                    } else {
                        // Can't pick up immediately
                        continue;
                    }
                }

                // Deposit directly into the task and activate it
                if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
                    addResourcesToTask(inst, hero.carryingPayload);
                    clearHeroPayload(hero);

                    const stillNeeded = getRemainingResources(inst);
                    if (stillNeeded.length === 0) {
                        activateTaskInstance(inst);
                    }

                    return false; // No movement initiated; task can proceed
                }
            }
        }
    }

    return false; // No fetch needed or no path found
}

/**
 * Determines whether a hero carrying resources is allowed to start a given task.
 * Rules:
 *  1. Not carrying (or fetch-intent) → always allowed.
 *  2. Task requires resources and the carried type matches → allowed (payload
 *     will be consumed as the first delivery).
 *  3. Task requires resources but the carried type does NOT match → blocked
 *     (fetching the required resource would overwrite the payload).
 *  4. Task produces resource rewards (totalRewardedResources) → blocked
 *     (completion would overwrite the payload).
 *  5. Otherwise (no requirements, no resource rewards) → allowed (hero can
 *     do useful work while still holding resources).
 */
export function canStartTaskWhileCarrying(hero: Hero, def: TaskDefinition, tile: Tile): boolean {
    if (!hero.carryingPayload || hero.carryingPayload.amount <= 0) return true;

    const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
    const required = def.requiredResources?.(distance);

    if (required && required.length > 0) {
        return required.some(r => r.type === hero.carryingPayload!.type);
    }

    if (def.totalRewardedResources) return false;

    return true;
}

export function startTask(tile: Tile, type: TaskType, starter: Hero): TaskInstance | null {
    detachHeroFromCurrentTask(starter);
    const def = getTaskDefinition(type);
    if (!def) return null;
    if (!isStoryTaskUnlocked(type)) return null;
    if (!def.canStart(tile, starter)) return null;
    if (!canStartTaskWhileCarrying(starter, def, tile)) return null;

    const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
    const requiredResources = def.requiredResources?.(distance);
    const collectedResources: ResourceAmount[] = [];

    if (!taskStore.tasksByTile[tile.id]) {
        taskStore.tasksByTile[tile.id] = {};
    }

    const tasksForTile = taskStore.tasksByTile[tile.id]!;
    if (tasksForTile[type]) return taskStore.taskIndex[tasksForTile[type]] || null;
    const nowMs = Date.now();

    const inst: TaskInstance = {
        id: makeId(taskStore),
        type,
        tileId: tile.id,
        progressXp: 0,
        requiredXp: def.requiredXp(distance),
        createdMs: nowMs,
        lastUpdateMs: nowMs,
        participants: {},
        active: true,
        requiredResources: requiredResources,
        collectedResources: collectedResources,
        context: undefined,
    } as TaskInstance;

    inst.participants[starter.id] = 0;
    taskStore.tasks.push(inst);
    taskStore.taskIndex[inst.id] = inst;
    taskStore.tasksByTile[tile.id]![type] = inst.id;

    broadcast({
        type: 'task:created',
        taskId: inst.id,
        taskType: inst.type,
        tileId: tile.id,
        requiredXp: inst.requiredXp,
        participantIds: inst.participants ? Object.keys(inst.participants) : [],
        requiredResources : inst.requiredResources
    } as TaskCreatedMessage);

    // Call task's onStart hook (task-specific setup)
    def.onStart?.(tile, inst, [starter]);

    starter.currentTaskId = inst.id;
    starter.pendingTask = undefined;

    fetchResourcesIfNeeded(starter, inst);

    return inst;
}

export function joinTask(taskId: string, hero: Hero) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst || inst.completedMs) return;

    if (hero.currentTaskId !== inst.id) {
        detachHeroFromCurrentTask(hero);
    }
    if (!inst.participants[hero.id]) inst.participants[hero.id] = 0;
    hero.currentTaskId = inst.id;
    hero.pendingTask = undefined;

    fetchResourcesIfNeeded(hero, inst);
}

function fetchResourcesIfNeeded(hero: Hero, inst: TaskInstance) {
    const type = inst.type;
    const def = getTaskDefinition(type);
    const tile = tileIndex[inst.tileId];
    if (!def || !tile) return;

    const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
    const requiredResources = def.requiredResources?.(distance);

    // add carrying to collected resources if applicable (only positive amounts)
    if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
        const consumed = addResourcesToTask(inst, hero.carryingPayload);
        if (consumed >= hero.carryingPayload.amount) {
            clearHeroPayload(hero);
        } else if (consumed > 0) {
            setHeroPayload(hero, { type: hero.carryingPayload.type, amount: hero.carryingPayload.amount - consumed });
        }
        // If consumed === 0, payload stays unchanged (resource not needed by this task)
    }

    // See if there are some resources still to be gathered, and send the hero to fetch the first needed resource
    if (requiredResources && requiredResources.length > 0) {
        const stillNeeded = getRemainingResources(inst);
        if (stillNeeded.length > 0) {
            deactivateTaskInstance(inst);
            checkAndInitiateResourceFetch(tile, stillNeeded, hero, type, inst);
        } else {
            activateTaskInstance(inst);
        }
    }
}

export function leaveTask(taskId: string, hero: Hero) { // fixed typing
    const inst = taskStore.taskIndex[taskId];
    if (!inst) return;

    delete inst.participants[hero.id];
    if (hero.currentTaskId === taskId) hero.currentTaskId = undefined;
}

export function getTaskByTile(tileId: string, taskType: TaskType): TaskInstance | undefined {
    const tileTasks = taskStore.tasksByTile[tileId];
    if (!tileTasks) return undefined;
    const id = tileTasks[taskType];
    return id ? taskStore.taskIndex[id] : undefined;
}

export function getTaskById(taskId: string): TaskInstance | undefined {
    return taskStore.taskIndex[taskId];
}

export function resumeWaitingTasksForResource(resourceType: ResourceType, storageTileId?: string) {
    const storageTile = storageTileId ? tileIndex[storageTileId] : undefined;

    for (const inst of taskStore.tasks) {
        if (inst.completedMs) continue;
        if (!inst.requiredResources?.some((resource) => resource.type === resourceType)) continue;

        const remaining = getRemainingResources(inst);
        if (!remaining.some((resource) => resource.type === resourceType)) continue;

        const def = getTaskDefinition(inst.type);
        const taskTile = tileIndex[inst.tileId];
        if (!def || !taskTile) continue;

        const idleParticipants = Object.keys(inst.participants)
            .map((heroId) => heroes.find((candidate) => candidate.id === heroId))
            .filter((hero): hero is Hero => {
                if (!hero) return false;
                if (hero.currentTaskId !== inst.id) return false;
                if (hero.movement || hero.carryingPayload || hero.pendingTask) return false;
                return true;
            });

        if (!idleParticipants.length) continue;

        idleParticipants.sort((a, b) => {
            const aPrimary = storageTile
                ? axialDistanceCoords(a.q, a.r, storageTile.q, storageTile.r)
                : axialDistanceCoords(a.q, a.r, taskTile.q, taskTile.r);
            const bPrimary = storageTile
                ? axialDistanceCoords(b.q, b.r, storageTile.q, storageTile.r)
                : axialDistanceCoords(b.q, b.r, taskTile.q, taskTile.r);
            if (aPrimary !== bPrimary) return aPrimary - bPrimary;

            const aTaskDistance = axialDistanceCoords(a.q, a.r, taskTile.q, taskTile.r);
            const bTaskDistance = axialDistanceCoords(b.q, b.r, taskTile.q, taskTile.r);
            if (aTaskDistance !== bTaskDistance) return aTaskDistance - bTaskDistance;

            return a.id.localeCompare(b.id);
        });

        for (const hero of idleParticipants) {
            fetchResourcesIfNeeded(hero, inst);
            if (hero.movement || hero.carryingPayload || hero.pendingTask) {
                break;
            }
        }
    }
}

// Time-based update; call frequently (e.g. each frame) with current hero roster
export function updateActiveTasks(heroes: Hero[]) {
    const nowMs = Date.now();
    for (const inst of taskStore.tasks.slice()) { // slice to avoid mutation issues
        if (!inst.active || inst.completedMs) continue;
        const def = getTaskDefinition(inst.type);
        if (!def) continue;
        const tile: Tile | undefined = tileIndex[inst.tileId];
        if (!tile) continue;
        const participants: Hero[] = [];
        for (const heroId of Object.keys(inst.participants)) {
            const h = heroes.find(hh => hh.id === heroId);
            if (h && isHeroWorkingTask(h, inst)) participants.push(h);
        }
        if (!participants.length) { // no participants -> remove task
            removeTask(inst);
            continue;
        }
        const elapsedMs = nowMs - inst.lastUpdateMs;
        if (elapsedMs <= 0) continue; // nothing to apply
        let elapsedSeconds = elapsedMs / 1000;
        // Accumulate contributions per hero scaled by elapsed seconds
        let totalContributionThisUpdate = 0;
        for (const hero of participants) {
            const ratePerSecond = def.heroRate(hero, tile); // treat as per-second rate now
            const contrib = ratePerSecond * elapsedSeconds;
            inst.participants[hero.id] = (inst.participants[hero.id] || 0) + contrib;
            totalContributionThisUpdate += contrib;
        }
        inst.progressXp += totalContributionThisUpdate;
        inst.lastUpdateMs = nowMs;
        def.onProgress?.(tile, inst);
        if (inst.progressXp >= inst.requiredXp) {
            completeTask(inst, def, tile, participants);
        } else {
            broadcastTaskProgress(inst);
        }
    }
}

function completeTask(inst: TaskInstance, def: TaskDefinition, tile: Tile, participants: Hero[]) {
    const nowMs = Date.now();
    inst.progressXp = inst.requiredXp;
    inst.completedMs = nowMs;
    inst.active = false;

    const rewardedStats = rewardStatsToParticipants(inst, participants);
    const rewardedResources = rewardResourcesToParticipants(inst, participants);

    // Call task's onComplete hook
    def.onComplete?.(tile, inst, participants);
    emitGameplayEvent({
        type: 'task:completed',
        taskType: inst.type,
        tileId: inst.tileId,
        participantIds: participants.map((hero) => hero.id),
    });

    const rewards = [];
    for (const hero of participants) {
        rewards.push({
            heroId: hero.id,
            stats: rewardedStats[hero.id] ?? undefined,
            resources: rewardedResources[hero.id] ?? undefined,
        });
    }

    broadcast({
        type: 'task:completed',
        taskId: inst.id,
        rewards: rewards,
    } as TaskCompletedMessage);

    dispatchRewardResourceDeliveries(participants);

    // Keep a tiny completion beat for feedback without reading as a freeze.
    let timer = setTimeout(() => autoChainInCluster(inst, tile, participants), TASK_CHAIN_DELAY_MS);
    for (const hero of participants) {
        hero.delayedMovementTimer = timer;
    }

    cleanupCompletedTasks();
}

function rewardStatsToParticipants(instance: TaskInstance, participants: Hero[]): Record<string, any> {
    const rewardedStats: Record<string, any> = {};
    const def = getTaskDefinition(instance.type);

    if (!def) return rewardedStats;

    if (!def.totalRewardedStats) return rewardedStats;

    const totalContrib = Object.values(instance.participants).reduce((a, b) => a + b, 0) || 1;
    const tile = tileIndex[instance.tileId];
    if (!tile) return rewardedStats;

    const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
    const rewards = def.totalRewardedStats(distance);
    for (const hero of participants) {
        rewardedStats[hero.id] = {}
        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;
        const statKeys: (keyof HeroStats)[] = ['xp', 'hp', 'atk', 'spd'];
        for (const stat of statKeys) {
            const statReward = rewards[stat];
            const rewardAmount = Math.ceil(statReward * share);
            hero.stats[stat] += rewardAmount;

            if (rewardAmount > 0) {
                rewardedStats[hero.id][stat] = rewardAmount;
            }
        }
    }
    return rewardedStats;
}

function rewardResourcesToParticipants(instance: TaskInstance, participants: Hero[]): Record<string, any> {
    const rewardedResources: Record<string, any> = {};

    const def = getTaskDefinition(instance.type);
    if (!def) return rewardedResources;
    if (!def.totalRewardedResources) return rewardedResources;

    const totalContrib = Object.values(instance.participants).reduce((a, b) => a + b, 0) || 1;
    const tile = tileIndex[instance.tileId];
    if (!tile) return rewardedResources;
    const distance = getDistanceToNearestTowncenter(tile.q, tile.r);
    for (const hero of participants) {
        rewardedResources[hero.id] = {};

        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;

        const totalRewards = def.totalRewardedResources(distance);
        const reward = {
            type: totalRewards.type,
            amount: Math.ceil(totalRewards.amount * share),
        };
        hero.carryingPayload = reward;

        rewardedResources[hero.id] = reward;
    }

    return rewardedResources;
}

function dispatchRewardResourceDeliveries(participants: Hero[]) {
    for (const hero of participants) {
        if (!hero.carryingPayload || hero.carryingPayload.amount <= 0) continue;

        const warehouse = findNearestWarehouse(hero.q, hero.r);
        if (!warehouse) continue;

        moveHeroWithRuntime(hero, warehouse);
    }
}

function findNearestWarehouse(q: number, r: number) {
    // Prefer a warehouse with free capacity for normal deposit
    const withCapacity = findNearestWarehouseWithCapacity(q, r, 1);
    if (withCapacity) return { q: withCapacity.q, r: withCapacity.r };

    // Fall back to any warehouse so the hero can attempt a resource swap
    const any = findNearestWarehouseAccessTile(q, r);
    return any ? { q: any.q, r: any.r } : null;
}

function findNearestWaterTile(q: number, r: number): { q: number; r: number } | null {
    const tile = findNearestWaterAccessTile(q, r);
    return tile ? { q: tile.q, r: tile.r } : null;
}


export function cleanupCompletedTasks() {
    for (let i = taskStore.tasks.length - 1; i >= 0; i--) {
        const t = taskStore.tasks[i]!;
        if (t.completedMs !== undefined) {
            removeTask(t);
        }
    }
}

function autoChainInCluster(inst: TaskInstance, tile: Tile, participants: Hero[]) {
    const def = getTaskDefinition(inst.type);
    if (!def?.chainAdjacentSameTerrain) return;
    if (!tile.discovered || !tile.terrain) return;
    const cluster = collectTerrainCluster(tile);

    for (const hero of participants) {
        // If hero is carrying resources/payload, defer chaining until after delivery and return.
        if (hero.carryingPayload) {
            hero.pendingChain = {sourceTileId: tile.id, taskType: inst.type};
            continue;
        }
        // Skip heroes still moving.
        if (hero.movement) continue;

        // Build candidate tiles from entire cluster (exclude current tile & tiles already hosting the task or failing canStart)
        const candidates: Tile[] = [];
        for (const ct of cluster) {
            if (ct.id === tile.id) continue; // skip original completed tile
            if (getTaskByTile(ct.id, inst.type)) continue; // already has this task type
            if (!def.canStart(ct, hero)) continue; // hero cannot start here
            candidates.push(ct);
        }
        if (!candidates.length) continue;

        // Sort by tile level relative to the nearest town center (tie-break by q then r for determinism)
        candidates.sort((a, b) => {
            const da = getDistanceToNearestTowncenter(a.q, a.r);
            const db = getDistanceToNearestTowncenter(b.q, b.r);
            if (da !== db) return da - db;
            if (a.q !== b.q) return a.q - b.q;
            return a.r - b.r;
        });

        // Try each candidate until a path is found
        for (const targetTile of candidates) {
            moveHeroWithRuntime(hero, targetTile, inst.type);
            break; // only chain to one tile per hero
        }
    }
}

export function getTasksAtTile(tileId: string): TaskInstance[] {
    const tileTasks = taskStore.tasksByTile[tileId];
    if (!tileTasks) return [];
    return Object.values(tileTasks)
        .map(id => taskStore.taskIndex[id])
        .filter((task): task is TaskInstance => !!task);
}
