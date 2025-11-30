import {reactive} from 'vue';
import type {TaskDefinition, TaskInstance, TaskType, ResourceAmount} from '../core/tasks';
import {getTaskDefinition} from '../core/taskRegistry';
import {ensureTileExists, hexDistance, type Tile, tileIndex} from '../core/world';
import {type Hero, type HeroStats } from './heroStore';
import {heroes, startHeroMovement} from './heroStore';
import {idleStore} from './idleStore';
import {HexMapService} from '../core/HexMapService';
import {terrainPositions} from "../core/terrainRegistry.ts";
import {resourceInventory} from './resourceStore';
import {TERRAIN_DEFS} from '../core/terrainDefs';

// Persistence key for tasks (versioned)
const TASKS_KEY = 'driftlands_tasks_v2';

const service = new HexMapService();

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
    }
    // detach any heroes that still reference this task
    for (const hero of heroes) {
        if (hero.currentTaskId === inst.id) {
            hero.currentTaskId = undefined;
        }
    }
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
            remaining.push({ type: required.type, amount: stillNeeded });
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
        task.collectedResources.push({ type: resourceType, amount: newAmount });
    }

    persistTasks();
}

// Check if hero needs to fetch resources and initiate the fetch if needed
function checkAndInitiateResourceFetch(targetTile: Tile, requiredResources: ResourceAmount[], hero: Hero, taskType: TaskType): boolean {
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
                hero.returnPos = { q: targetTile.q, r: targetTile.r };

                // Mark hero as preparing to fetch this resource
                // Store negative amount to indicate needed amount
                hero.carryingPayload = {
                    type: resource.type as any,
                    amount: -resource.amount,
                } as any;


                // Start movement to fetch location (no taskType - just fetching)
                startHeroMovement(hero.id, pathToFetch, fetchLocation);

                return true; // Resource fetch initiated
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
        createdTick: idleStore.tick,
        createdMs: nowMs,
        lastUpdateMs: nowMs,
        participants: {},
        active: true,
        requiredResources: requiredResources,
        collectedResources: collectedResources
    } as TaskInstance;

    inst.participants[starter.id] = 0;
    taskStore.tasks.push(inst);
    taskStore.taskIndex[inst.id] = inst;
    taskStore.tasksByTile[tile.id]![type] = inst.id;
    def.onStart?.(tile, [starter]);
    starter.currentTaskId = inst.id;
    persistTasks();

    fetchResourcesIfNeeded(starter, inst);

    return inst;
}

export function joinTask(taskId: string, hero: Hero) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst || inst.completedTick) return;

    if (hero.currentTaskId !== inst.id) {
        detachHeroFromCurrentTask(hero);
    }
    if (!inst.participants[hero.id]) inst.participants[hero.id] = 0;
    hero.currentTaskId = inst.id;
    persistTasks();

    fetchResourcesIfNeeded(hero, inst);
}

function fetchResourcesIfNeeded(hero: Hero, inst: TaskInstance) {
    const type = inst.type;
    const def = getTaskDefinition(type);
    const tile = tileIndex[inst.tileId];
    if(!def || !tile) return;

    const distance = hexDistance(tile.q, tile.r);
    const requiredResources = def.requiredResources?.(distance);

    // add carrying to collected resources if applicable
    if (hero.carryingPayload) {
        addResourcesToTask(inst, hero.carryingPayload);
        hero.carryingPayload = undefined;
    }

    // See if there are some resources still to be gathered, and send the hero to fetch the first needed resource
    if (requiredResources && requiredResources.length > 0) {
        const stillNeeded = getRemainingResources(inst);
        if (stillNeeded.length > 0) {
            inst.active = false;
            checkAndInitiateResourceFetch(tile, stillNeeded, hero, type);
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
    if (!Object.keys(inst.participants).length) {
        removeTask(inst);
    }
    persistTasks();
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
        if (!parts.length) { // no participants -> remove task
            removeTask(inst);
            continue;
        }
        const elapsedMs = nowMs - inst.lastUpdateMs;
        if (elapsedMs <= 0) continue; // nothing to apply
        let elapsedSeconds = elapsedMs / 1000;
        // Accumulate contributions per hero scaled by elapsed seconds
        let totalContributionThisUpdate = 0;
        for (const hero of parts) {
            const ratePerSecond = def.heroRate(hero, tile); // treat as per-second rate now
            const contrib = ratePerSecond * elapsedSeconds;
            inst.participants[hero.id] = (inst.participants[hero.id] || 0) + contrib;
            totalContributionThisUpdate += contrib;
        }
        inst.progressXp += totalContributionThisUpdate;
        inst.lastUpdateMs = nowMs;
        def.onProgress?.(tile, inst);
        if (inst.progressXp >= inst.requiredXp) {
            completeTask(inst, def, tile, parts);
        }
    }
    persistTasks();
}

function completeTask(inst: TaskInstance, def: TaskDefinition, tile: Tile, participants: Hero[]) {
    const nowMs = Date.now();
    inst.progressXp = inst.requiredXp;
    inst.completedTick = idleStore.tick;
    inst.completedMs = nowMs;
    inst.active = false;

    rewardStatsToParticipants(inst, participants);
    rewardResourcesToParticipants(inst, participants);

    def.onComplete?.(tile, inst, participants);

    // Auto-chain to adjacent tiles in cluster after short delay, to allow for any movement to initiate first
    let timer = setTimeout(() => autoChainInCluster(inst, tile, participants), 1500);
    for (const hero of participants) {
        hero.delayedMovementTimer = timer;
    }

    cleanupCompletedTasks();
}

function rewardStatsToParticipants(instance: TaskInstance, participants: Hero[]) {
    const def = getTaskDefinition(instance.type);
    if (!def) return;
    if(!def.totalRewardedStats) return;

    const totalContrib = Object.values(instance.participants).reduce((a, b) => a + b, 0) || 1;
    const tile = tileIndex[instance.tileId];
    if (!tile) return;
    const distance = hexDistance(tile.q, tile.r);
    const rewards = def.totalRewardedStats(distance);
    for (const hero of participants) {
        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;
        const statKeys: (keyof HeroStats)[] = ['xp', 'hp', 'atk', 'spd'];
        for (const stat of statKeys) {
            const statReward = rewards[stat];
            const rewardAmount = Math.ceil(statReward * share);
            hero.stats[stat] += rewardAmount;
        }
    }
}


function rewardResourcesToParticipants(instance: TaskInstance, participants: Hero[]) {
    const def = getTaskDefinition(instance.type);
    if (!def) return;
    if(!def.totalRewardedResources) return;

    const totalContrib = Object.values(instance.participants).reduce((a, b) => a + b, 0) || 1;
    const tile = tileIndex[instance.tileId];
    if (!tile) return;
    const distance = hexDistance(tile.q, tile.r);
    const rewards = def.totalRewardedResources(distance);
    for (const hero of participants) {
        const contrib = instance.participants[hero.id] || 0;
        const share = contrib / totalContrib;

        rewards.amount = Math.ceil(rewards.amount * share);
        hero.carryingPayload = rewards;

        const tc = findNearestTowncenter(hero.q, hero.r);
        if (tc) {
            const path = service.findWalkablePath(hero.q, hero.r, tc.q, tc.r);
            if (path && path.length) {
                startHeroMovement(hero.id, path, tc);
            }
        }
    }
}

function findNearestTowncenter(q: number, r: number) {
    let best;
    let bestDist;

    // First distance to origin (0,0) as fallback
    const dq = Math.abs(0 - q);
    const dr = Math.abs(0 - r);
    const ds = Math.abs(0 - (-q - r));
    bestDist = Math.max(dq, dr, ds);
    best = { q: 0, r: 0 };

    for (const id of terrainPositions.towncenter) {
        const t = tileIndex[id];
        if (!t) continue;
        const dq = Math.abs(t.q - q);
        const dr = Math.abs(t.r - r);
        const ds = Math.abs((-t.q - t.r) - (-q - r));
        const dist = Math.max(dq, dr, ds);
        if (dist < bestDist) { bestDist = dist; best = { q: t.q, r: t.r }; }
    }

    return best;
}

// Find nearest warehouse (towncenter) that has the required resource in stock
// Returns warehouse location even if it has less than requested amount (partial fetching)
function findNearestWarehouseWithResource(q: number, r: number, resourceType: string): { q: number; r: number; availableAmount: number } | null {
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
        best = { q: 0, r: 0, availableAmount: available };
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
            best = { q: t.q, r: t.r, availableAmount: available };
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
                best = { q: neighborTile.q, r: neighborTile.r };
                bestWaterTileId = waterTile.id;
            }
        }
    }

    return best ? { ...best, waterTileId: bestWaterTileId } : null;
}


export function cleanupCompletedTasks() {
    for (let i = taskStore.tasks.length - 1; i >= 0; i--) {
        const t = taskStore.tasks[i]!;
        if (t.completedTick !== undefined) {
            removeTask(t);
        }
    }
    persistTasks();
}

// Persistence helpers
function persistTasks() {
    try {
        const serializable = taskStore.tasks.map(t => ({
            id: t.id,
            type: t.type,
            tileId: t.tileId,
            progressXp: t.progressXp,
            requiredXp: t.requiredXp,
            createdMs: t.createdMs,
            lastUpdateMs: t.lastUpdateMs,
            completedMs: t.completedMs,
            participants: t.participants,
            active: t.active,
            requiredResources: t.requiredResources,
            collectedResources: t.collectedResources,
        }));
        localStorage.setItem(TASKS_KEY, JSON.stringify({tasks: serializable, ts: Date.now()}));
    } catch {
    }
}

export function restoreTasks() {
    try {
        const raw = localStorage.getItem(TASKS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.tasks)) return;
        for (const saved of data.tasks) {
            // Skip if already exists
            if (taskStore.taskIndex[saved.id]) continue;
            const inst: TaskInstance = {
                id: saved.id,
                type: saved.type,
                tileId: saved.tileId,
                progressXp: saved.progressXp,
                requiredXp: saved.requiredXp,
                createdTick: 0,
                createdMs: saved.createdMs || Date.now(),
                lastUpdateMs: saved.lastUpdateMs || Date.now(),
                completedTick: undefined,
                completedMs: saved.completedMs,
                participants: saved.participants || {},
                active: saved.active && !saved.completedMs,
                requiredResources: saved.requiredResources,
                collectedResources: saved.collectedResources,
            } as TaskInstance;
            taskStore.tasks.push(inst);
            taskStore.taskIndex[inst.id] = inst;
            if (!taskStore.tasksByTile[inst.tileId]) taskStore.tasksByTile[inst.tileId] = {};
            taskStore.tasksByTile[inst.tileId]![inst.type] = inst.id;
        }
        // Offline catch-up: apply one update based on elapsed since lastUpdateMs
        offlineCatchUp();
    } catch {
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
        for (const side of ['a','b','c','d','e','f'] as const) {
            const nt = nm[side];
            if (!nt) continue;
            if (!visited.has(nt.id) && nt.discovered && nt.terrain === terrain) queue.push(nt);
        }
    }

    const service = new HexMapService();
    for (const hero of participants) {
        // If hero is carrying resources/payload, defer chaining until after delivery and return.
        if (hero.carryingPayload) {
            // Preserve existing pendingChain if already set for same source to avoid overwrite.
            if (!hero.pendingChain) hero.pendingChain = { sourceTileId: tile.id, taskType: inst.type };
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
            const path = service.findWalkablePath(hero.q, hero.r, targetTile.q, targetTile.r);
            if (!path.length) continue;
            startHeroMovement(hero.id, path, { q: targetTile.q, r: targetTile.r }, inst.type);
            break; // only chain to one tile per hero
        }
    }
}

function offlineCatchUp() {
    const nowMs = Date.now();
    for (const inst of taskStore.tasks.slice()) {
        if (!inst.active || inst.completedMs) continue;
        const elapsedMs = nowMs - inst.lastUpdateMs;
        if (elapsedMs <= 50) continue; // ignore trivial gaps
        const def = getTaskDefinition(inst.type);
        const tile: Tile | undefined = tileIndex[inst.tileId];
        if (!def || !tile) continue;
        // Gather live hero objects for participants
        const parts: Hero[] = [];
        for (const heroId of Object.keys(inst.participants)) {
            const h = heroes.find(hh => hh.id === heroId);
            if (h) parts.push(h);
        }
        if (!parts.length) {
            removeTask(inst);
            continue;
        }
        const elapsedSeconds = elapsedMs / 1000;
        let totalContribution = 0;
        for (const hero of parts) {
            const ratePerSecond = def.heroRate(hero, tile);
            const contrib = ratePerSecond * elapsedSeconds;
            inst.participants[hero.id] = (inst.participants[hero.id] || 0) + contrib;
            totalContribution += contrib;
        }
        inst.progressXp += totalContribution;
        inst.lastUpdateMs = nowMs;
        if (inst.progressXp >= inst.requiredXp) {
            completeTask(inst, def, tile, parts);
        }
    }
    persistTasks();
}

// Attempt restore on module load (browser only)
if (typeof window !== 'undefined') {
    restoreTasks();
}

export function clearAllTasks() {
    // Unassign heroes from tasks
    try {
        for (const hero of heroes) {
            if (hero.currentTaskId) hero.currentTaskId = undefined;
        }
    } catch {
    }
    taskStore.tasks.length = 0;
    for (const k of Object.keys(taskStore.taskIndex)) delete taskStore.taskIndex[k];
    for (const k of Object.keys(taskStore.tasksByTile)) delete taskStore.tasksByTile[k];
    taskStore.nextId = 1;
    try {
        localStorage.removeItem(TASKS_KEY);
    } catch {
    }
}
