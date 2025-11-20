import {watch} from 'vue';
import {startWorldGeneration, tiles, worldVersion} from '../core/world';
import type {TerrainKey} from "../core/terrainDefs.ts";

interface IdleTaskDef {
    baseSeconds: number;
    primaryStat?: keyof IdleHero['stats'];
    resourceYield?: Partial<Record<ResourceType, number>>;
}

interface IdleHeroStats {
    speed: number;
    yield: number;
    defense: number;
    build: number;
    explore: number;
}

interface IdleHero {
    id: string;
    name: string;
    level: number;
    xp: number;
    stats: IdleHeroStats;
    busy: boolean;
    task?: ActiveIdleTask;
}

interface ActiveIdleTask {
    def: IdleTaskDef;
    tileId: string;
    assignedHeroIds: string[];
    progress: number;
    required: number;
    startedAt: number;
    completed: boolean;
}

// Added road support
export interface Road {
    id: string; // canonical id
    a: string; // tile id
    b: string; // tile id
}

export type Terrain = TerrainKey;
export type ResourceType = 'wood' | 'ore' | 'stone' | 'food' | 'crystal' | 'artifact';

export interface Tile {
    id: string;
    q: number;
    r: number;
    biome: string | null;
    terrain: Terrain | null;
    discovered: boolean;
}

interface IdleState {
    radius: number;
    tiles: any[]; // referencing core/world tiles
    tick: number;
    running: boolean;
    worldVersion: number;
}

const LOCAL_KEY = 'driftlands_idle_state_v1';

function loadState(): IdleState | null {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveState(_state: IdleState) {
    try {
        // localStorage.setItem(LOCAL_KEY, JSON.stringify(_state));
    } catch {
        // ignore quota/security errors
    }
}

// Keep idle store initialization with imported tiles/worldVersion
const initial: IdleState = (loadState() as IdleState) ?? {
    radius: 4,
    tiles: tiles,
    tick: 0,
    running: false,
    worldVersion: worldVersion.value
};
export const idleStore = initial;
// Start async generation
startWorldGeneration(10);

watch(worldVersion, () => {
    console.log('save');
    saveState(idleStore);
}, {deep: true});

export function startIdle() {
    if (idleStore.running) return;
    idleStore.running = true;
    loop();
}

function loop() {
    if (!idleStore.running) return;
    idleStore.tick++;

    //const dt = 1 / 60; // simulation step seconds
    // idleStore.tiles.forEach(tile => {
    //     const task = tile.task;
    //     if (!task || task.completed) return;
    //     const heroes = idleStore.heroes.filter(h => task.assignedHeroIds.includes(h.id));
    //     const collectiveRate = heroes.reduce((acc, h) => acc + speedMultiplier(h) * statMultiplier(h, task.def), 0) * synergyMultiplier(heroes.length);
    //     task.progress += collectiveRate * dt * 0.5; // 0.5 tuning factor
    //     if (task.progress >= task.required) {
    //         task.progress = task.required;
    //     }
    // });
    requestAnimationFrame(loop);
}
