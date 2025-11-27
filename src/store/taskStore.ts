import {reactive} from 'vue';
import type {TaskDefinition, TaskInstance, TaskType} from '../core/tasks';
import {getTaskDefinition} from '../core/taskRegistry';
import {ensureTileExists, hexDistance, type Tile, tileIndex} from '../core/world';
import type {Hero, HeroStats} from './heroStore';
import {heroes, startHeroMovement} from './heroStore';
import {idleStore} from './idleStore';
import {HexMapService} from '../core/HexMapService';
import {terrainPositions} from "../core/terrainRegistry.ts";

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

export function startTask(tile: Tile, type: TaskType, starter: Hero): TaskInstance | null {
    // Prevent starting a new task while carrying resources
    if (starter.carryingPayload) return null;
    detachHeroFromCurrentTask(starter);
    const def = getTaskDefinition(type);
    if (!def) return null;
    if (!def.canStart(tile, starter)) return null;

    if (!taskStore.tasksByTile[tile.id]) {
        taskStore.tasksByTile[tile.id] = {};
    }

    const tasksForTile = taskStore.tasksByTile[tile.id]!;
    if (tasksForTile[type]) return taskStore.taskIndex[tasksForTile[type]] || null;
    const distance = hexDistance(tile.q, tile.r);
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
    } as TaskInstance; // completed fields optional
    inst.participants[starter.id] = 0;
    taskStore.tasks.push(inst);
    taskStore.taskIndex[inst.id] = inst;
    taskStore.tasksByTile[tile.id]![type] = inst.id;
    def.onStart?.(tile, [starter]);
    starter.currentTaskId = inst.id;
    persistTasks();
    return inst;
}

export function joinTask(taskId: string, hero: Hero) {
    const inst = taskStore.taskIndex[taskId];
    if (!inst || !inst.active || inst.completedTick) return;
    // Block joining if hero is carrying resources
    if (hero.carryingPayload) return;
    if (hero.currentTaskId === inst.id) return;
    detachHeroFromCurrentTask(hero);
    if (!inst.participants[hero.id]) inst.participants[hero.id] = 0;
    hero.currentTaskId = inst.id;
    persistTasks();
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
