import {getTaskDefinition} from '../shared/tasks/taskRegistry';
import {ensureTileExists, hexDistance, tileIndex} from '../core/world';
import {terrainPositions} from "../core/terrainRegistry";
import {resourceInventory} from './resourceStore';
import {TERRAIN_DEFS} from '../core/terrainDefs';
import {PathService} from "../core/PathService";
import {heroes} from "./heroStore";
import type {Hero, HeroStats} from "../core/types/Hero";
import type {Tile} from "../core/types/Tile";
import type {TaskDefinition, TaskInstance, TaskType} from "../core/types/Task";
import type {ResourceAmount} from "../core/types/Resource";
import {broadcast} from "../../server/src/messages/messageRouter.ts";
import type {
    TaskCompletedMessage,
    TaskCreatedMessage, TaskProgressMessage,
    TaskRemovedMessage
} from "../shared/protocol.ts";
import {ServerMovementHandler} from "../../server/src/handlers/movementHandler";

const service = new PathService();

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

export function addResourcesToTask(task: TaskInstance, carrying: ResourceAmount) {
    if (!task.collectedResources) {
        task.collectedResources = [];
    }

    const resourceType = carrying.type;

    const currentAmount = task.collectedResources.find((collected) => collected.type === resourceType)?.amount || 0;
    const newAmount = currentAmount + carrying.amount;
    // Update or add the collected resource amount
    const existingResource = task.collectedResources.find((collected) => collected.type === resourceType);
    if (existingResource) {
        existingResource.amount = newAmount;
    } else {
        task.collectedResources.push({type: resourceType, amount: newAmount});
    }
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
                fetchLocation = {q: waterLocation.q, r: waterLocation.r};
            } else {
                continue;
            }
        } else {
            // For other resources, find nearest warehouse with the resource
            fetchLocation = findNearestWarehouseWithResource(hero.q, hero.r, resource.type);
        }

        if (fetchLocation) {
            // Find path to fetch location
            const pathToFetch = service.findWalkablePath(hero.q, hero.r, fetchLocation.q, fetchLocation.r);
            if (pathToFetch && pathToFetch.length > 0) {
                // Store task info so hero can return after fetching
                hero.pendingChain = {
                    sourceTileId: targetTile.id,
                    taskType: taskType // Store the actual task type to start later
                };
                hero.returnPos = {q: targetTile.q, r: targetTile.r};

                // Mark hero as preparing to fetch this resource
                hero.carryingPayload = {
                    type: resource.type as any,
                    amount: -resource.amount,
                } as any;

                ServerMovementHandler.getInstance().moveHero(hero, fetchLocation);

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
                hero.pendingChain = {
                    sourceTileId: targetTile.id,
                    taskType: taskType
                };
                hero.returnPos = {q: targetTile.q, r: targetTile.r};
                hero.carryingPayload = {
                    type: resource.type as any,
                    amount: -resource.amount,
                } as any;

                // Immediate pickup logic
                const currentTile = ensureTileExists(hero.q, hero.r);

                if (resource.type === 'water') {
                    // Check adjacency to water and pick up instantly
                    const neighbors = currentTile.neighbors;
                    let adjacentWater = false;
                    if (neighbors) {
                        for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
                            if (neighbors[side]?.terrain === 'water') {
                                adjacentWater = true;
                                break;
                            }
                        }
                    }
                    if (adjacentWater) {
                        hero.carryingPayload = {type: 'water' as any, amount: 1} as any;
                    } else {
                        // Not actually adjacent to water; skip
                        continue;
                    }
                } else {
                    // Warehouse immediate pickup when standing on towncenter with stock
                    const ctTerrain = currentTile.terrain;
                    const available = resourceInventory[resource.type as keyof typeof resourceInventory] || 0;
                    if (ctTerrain === 'towncenter' && available > 0) {
                        const amountToTake = Math.min(resource.amount, available, 10);
                        resourceInventory[resource.type as keyof typeof resourceInventory] = available - amountToTake;
                        hero.carryingPayload = {type: resource.type as any, amount: amountToTake} as any;
                    } else {
                        // Can't pick up immediately
                        continue;
                    }
                }

                // Deposit directly into the task and activate it
                if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
                    addResourcesToTask(inst, hero.carryingPayload);
                    hero.carryingPayload = undefined;

                    const stillNeeded = getRemainingResources(inst);
                    if (stillNeeded.length === 0) {
                        inst.createdMs = Date.now();
                        inst.lastUpdateMs = Date.now();
                        inst.active = true;
                    }

                    return false; // No movement initiated; task can proceed
                }
            }
        }
    }

    return false; // No fetch needed or no path found
}

export function startTask(tile: Tile, type: TaskType, starter: Hero): TaskInstance | null {
    detachHeroFromCurrentTask(starter);
    const def = getTaskDefinition(type);
    if (!def) return null;
    if (!def.canStart(tile, starter)) return null;

    const distance = hexDistance(tile.q, tile.r);
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

    fetchResourcesIfNeeded(hero, inst);
}

function fetchResourcesIfNeeded(hero: Hero, inst: TaskInstance) {
    const type = inst.type;
    const def = getTaskDefinition(type);
    const tile = tileIndex[inst.tileId];
    if (!def || !tile) return;

    const distance = hexDistance(tile.q, tile.r);
    const requiredResources = def.requiredResources?.(distance);

    // add carrying to collected resources if applicable (only positive amounts)
    if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
        addResourcesToTask(inst, hero.carryingPayload);
        hero.carryingPayload = undefined;
    }

    // See if there are some resources still to be gathered, and send the hero to fetch the first needed resource
    if (requiredResources && requiredResources.length > 0) {
        const stillNeeded = getRemainingResources(inst);
        if (stillNeeded.length > 0) {
            inst.active = false;
            checkAndInitiateResourceFetch(tile, stillNeeded, hero, type, inst);
        } else {
            inst.createdMs = Date.now();
            inst.lastUpdateMs = Date.now();
            inst.active = true;
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
            if (h) participants.push(h);
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
            broadcast({
                type: 'task:progress',
                taskId: inst.id,
                progressXp: inst.progressXp,
                participants: inst.participants
            } as TaskProgressMessage);
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

    // Auto-chain to adjacent tiles in cluster after short delay, to allow for any movement to initiate first
    let timer = setTimeout(() => autoChainInCluster(inst, tile, participants), 1500);
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

    const distance = hexDistance(tile.q, tile.r);
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
    const distance = hexDistance(tile.q, tile.r);
    const rewards = def.totalRewardedResources(distance);
    for (const hero of participants) {
        rewardedResources[hero.id] = {};

        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;

        rewards.amount = Math.ceil(rewards.amount * share);
        hero.carryingPayload = rewards;

        rewardedResources[hero.id] = rewards;

        const tc = findNearestTowncenter(hero.q, hero.r);
        if (tc) {
            ServerMovementHandler.getInstance().moveHero(hero, tc);
        }
    }

    return rewardedResources;
}

function findNearestTowncenter(q: number, r: number) {
    let best;
    let bestDist;

    // First distance to origin (0,0) as fallback
    const dq = Math.abs(0 - q);
    const dr = Math.abs(0 - r);
    const ds = Math.abs(0 - (-q - r));
    bestDist = Math.max(dq, dr, ds);
    best = {q: 0, r: 0};

    for (const id of terrainPositions.towncenter) {
        const t = tileIndex[id];
        if (!t) continue;
        const dq = Math.abs(t.q - q);
        const dr = Math.abs(t.r - r);
        const ds = Math.abs((-t.q - t.r) - (-q - r));
        const dist = Math.max(dq, dr, ds);
        if (dist < bestDist) {
            bestDist = dist;
            best = {q: t.q, r: t.r};
        }
    }

    return best;
}

// Find nearest warehouse (towncenter) that has the required resource in stock
// Returns warehouse location even if it has less than requested amount (partial fetching)
function findNearestWarehouseWithResource(q: number, r: number, resourceType: string): {
    q: number;
    r: number;
    availableAmount: number
} | null {
    // Check if warehouse has any of this resource
    const available = resourceInventory[resourceType as keyof typeof resourceInventory] || 0;
    if (available <= 0) {
        return null;
    }

    let best = null;
    let bestDist = Infinity;

    // Check origin (0,0)
    const originTile = tileIndex[ensureTileExists(0, 0).id];
    if (originTile && originTile.terrain === 'towncenter') {
        const dq = Math.abs(0 - q);
        const dr = Math.abs(0 - r);
        const ds = Math.abs(0 - (-q - r));
        bestDist = Math.max(dq, dr, ds);
        best = {q: 0, r: 0, availableAmount: available};
    }

    // Check all towncenters (they all share same inventory for now)
    for (const id of terrainPositions.towncenter) {
        const t = tileIndex[id];
        if (!t) continue;
        const dq = Math.abs(t.q - q);
        const dr = Math.abs(t.r - r);
        const ds = Math.abs((-t.q - t.r) - (-q - r));
        const dist = Math.max(dq, dr, ds);
        if (dist < bestDist) {
            bestDist = dist;
            best = {q: t.q, r: t.r, availableAmount: available};
        }
    }

    return best;
}

// Find nearest walkable tile adjacent to water
function findNearestWaterTile(q: number, r: number): { q: number; r: number; waterTileId: string } | null {
    let best = null;
    let bestDist = Infinity;
    let bestWaterTileId = '';

    // Check all water tiles
    for (const id of terrainPositions.water || []) {
        const waterTile = tileIndex[id];
        if (!waterTile || !waterTile.discovered) continue;

        // Check neighbors of water tile for walkable tiles
        const neighbors = waterTile.neighbors ?? ensureTileExists(waterTile.q, waterTile.r).neighbors;
        if (!neighbors) continue;

        for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
            const neighborTile = neighbors[side];
            if (!neighborTile || !neighborTile.discovered) continue;

            // Check if neighbor is walkable
            const terrain = neighborTile.terrain;
            if (!terrain) continue;
            const terrainDef = (TERRAIN_DEFS as any)[terrain];
            if (!terrainDef?.walkable) continue;

            // Calculate distance from hero to this walkable neighbor
            const dq = Math.abs(neighborTile.q - q);
            const dr = Math.abs(neighborTile.r - r);
            const ds = Math.abs((-neighborTile.q - neighborTile.r) - (-q - r));
            const dist = Math.max(dq, dr, ds);

            if (dist < bestDist) {
                bestDist = dist;
                best = {q: neighborTile.q, r: neighborTile.r};
                bestWaterTileId = waterTile.id;
            }
        }
    }

    return best ? {...best, waterTileId: bestWaterTileId} : null;
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
    const terrain = tile.terrain;

    // Build full cluster via BFS (discovered tiles sharing terrain)
    const visited = new Set<string>();
    const cluster: Tile[] = [];
    const queue: Tile[] = [tile];
    const MAX_CLUSTER = 999; // safety cap
    while (queue.length && visited.size < MAX_CLUSTER) {
        const cur = queue.shift()!;
        if (visited.has(cur.id)) continue;
        if (!cur.discovered || cur.terrain !== terrain) continue;
        visited.add(cur.id);
        cluster.push(cur);
        const nm = cur.neighbors ?? ensureTileExists(cur.q, cur.r).neighbors!;
        for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
            const nt = nm[side];
            if (!nt) continue;
            if (!visited.has(nt.id) && nt.discovered && nt.terrain === terrain) queue.push(nt);
        }
    }

    for (const hero of participants) {
        // If hero is carrying resources/payload, defer chaining until after delivery and return.
        if (hero.carryingPayload) {
            // Preserve existing pendingChain if already set for same source to avoid overwrite.
            if (!hero.pendingChain) hero.pendingChain = {sourceTileId: tile.id, taskType: inst.type};
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

        // Sort by distance from world center (tie-break by q then r for determinism)
        candidates.sort((a, b) => {
            const da = hexDistance(a.q, a.r);
            const db = hexDistance(b.q, b.r);
            if (da !== db) return da - db;
            if (a.q !== b.q) return a.q - b.q;
            return a.r - b.r;
        });

        // Try each candidate until a path is found
        for (const targetTile of candidates) {
            ServerMovementHandler.getInstance().moveHero(hero, targetTile)
            break; // only chain to one tile per hero
        }
    }
}