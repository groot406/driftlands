import {reactive, watch} from 'vue';
import {weightedTerrainChoice} from '../core/terrain';
import type {TerrainKey} from '../core/terrainDefs';

// README-inspired idle hex frontier POC store
export type IdleTaskType = 'EXPLORE' | 'MINE' | 'BUILD' | 'DEFEND';

interface IdleTaskDef {
    type: IdleTaskType;
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
    tiles: Tile[];
    tick: number;
    running: boolean;
    worldVersion: number;
}

const LOCAL_KEY = 'driftlands_idle_state_v1';

export const tiles = reactive<Tile[]>([]);
const tileIndex: Record<string, Tile> = {};
// Cached axial radius offset lists to avoid recomputing loops every frame
const radiusOffsetCache = new Map<number, Array<[number, number]>>();

let minQ: number = 0;
let maxQ: number = 0;
let minR: number = 0;
let maxR: number = 0;

function indexTile(t: Tile) {
    tileIndex[t.id] = t;
    // Update world bounds
    if (t.q < minQ) minQ = t.q;
    if (t.q > maxQ) maxQ = t.q;
    if (t.r < minR) minR = t.r;
    if (t.r > maxR) maxR = t.r;
}

function ensureTileExists(q: number, r: number): Tile {
    const id = axialKey(q, r);
    let t = tileIndex[id];
    if (!t) {
        t = {id, q, r, terrain: null, biome: null, discovered: false};
        tiles.push(t);
        indexTile(t);
    }
    return t;
}

export function ensureTileNeighbors(tile: Tile) {
    const neighbors: Array<[number, number]> = [
        [tile.q + 1, tile.r], [tile.q + 1, tile.r - 1], [tile.q, tile.r - 1],
        [tile.q - 1, tile.r], [tile.q - 1, tile.r + 1], [tile.q, tile.r + 1]
    ];
    neighbors.forEach(([q, r]) => ensureTileExists(q, r));
}

export function getNeighborTerrains(tile: Tile, radius: number = 1): Terrain[] {
    const neighbors: TerrainKey[] = [];

    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            if (dq === 0 && dr === 0) continue;
            const nt = tileIndex[axialKey(tile.q + dq, tile.r + dr)];
            if (nt && nt.discovered && nt.terrain) {
                neighbors.push(nt.terrain);
            }
        }
    }

    return neighbors;
}

export function discoverTile(tile: Tile) {
    if (tile.discovered && tile.terrain) return;

    if (tile.q == 0 && tile.r == 0) {
        tile.terrain = 'towncenter';
        tile.discovered = true;
        return;
    }

    let neighborTerrains = getNeighborTerrains(tile);
    const generated = weightedTerrainChoice(neighborTerrains, neighborTerrains);

    tile.biome = generated.biome;
    tile.terrain = generated.terrain;
    tile.discovered = true;
    if (!tileIndex[tile.id]) indexTile(tile);

    ensureTileNeighbors(tile);
    idleStore.worldVersion++;
}

function axialKey(q: number, r: number) {
    return `${q},${r}`;
}

function getRadiusOffsets(radius: number): Array<[number, number]> {
    let cached = radiusOffsetCache.get(radius);
    if (cached) return cached;
    const arr: Array<[number, number]> = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            arr.push([dq, dr]);
        }
    }
    radiusOffsetCache.set(radius, arr);
    return arr;
}

export function getTilesInRadius(centerQ: number, centerR: number, radius: number): Tile[] {
    const offsets = getRadiusOffsets(radius);
    const list: Tile[] = [];
    for (const [dq, dr] of offsets) {
        const t = tileIndex[axialKey(centerQ + dq, centerR + dr)];
        if (t) list.push(t);
    }
    return list;
}

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

const initial: IdleState = (loadState() as IdleState) ?? {
    radius: 4,
    tiles: tiles,
    tick: 0,
    running: false,
    worldVersion: 0,
};
export const idleStore = reactive(initial);
seedInitialWorld(5);

watch(idleStore, () => {
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

export function seedInitialWorld(discoverRadius: number = 1) {
    const placeholderRadius = discoverRadius + 1;

    discoverTile(ensureTileExists(0, 0));

    for (let q = -placeholderRadius; q <= placeholderRadius; q++) {
        for (let r = -placeholderRadius; r <= placeholderRadius; r++) {
            const distance = hexDistance(q, r);
            if (distance > placeholderRadius) continue;
            const t = ensureTileExists(q, r);
            if (distance <= discoverRadius) {
                discoverTile(t);
            }
        }
    }

    idleStore.worldVersion++;
}

export function hexDistance(q: number, r: number): number {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

export function getWorldBounds(padding: number = 0) {
    return {
        minQ: minQ - padding,
        maxQ: maxQ + padding,
        minR: minR - padding,
        maxR: maxR + padding
    };
}
