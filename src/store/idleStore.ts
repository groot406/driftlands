import {ref, watch} from 'vue';
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

const tiles: Tile[] = [];
const tileIndex: Record<string, Tile> = {};
// Cached axial radius offset lists to avoid recomputing loops every frame
const radiusOffsetCache = new Map<number, Array<[number, number]>>();
export const worldVersion = ref(0);
// Generation progress refs
export const generationInProgress = ref(false);
export const generationStatus = ref('');
export const generationProgress = ref(0); // 0-1
export const generationCompleted = ref(0);
export const generationTotal = ref(0);
// New: track outer world radius for camera clamping
export const worldOuterRadius = ref(0);

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

    const neighborTerrains = getNeighborTerrains(tile);
    const biomeTerrains = getNeighborTerrains(tile, 2);
    const generated = weightedTerrainChoice(neighborTerrains, biomeTerrains);

    tile.biome = generated.biome;
    tile.terrain = generated.terrain;
    tile.discovered = true;
    if (!tileIndex[tile.id]) indexTile(tile);

    ensureTileNeighbors(tile);

    worldVersion.value++;
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

// Async progressive generation replacing seedInitialWorld
export async function generateInitialWorld(discoverRadius: number = 4, frameTimeBudgetMs: number = 8) {
    if (generationInProgress.value || generationProgress.value >= 1) return;
    generationInProgress.value = true;
    generationStatus.value = 'Preparing world...';
    generationProgress.value = 0;
    generationCompleted.value = 0;

    // Discover center immediately
    discoverTile(ensureTileExists(0, 0));

    const placeholderRadius = discoverRadius + 1; // matches previous logic
    worldOuterRadius.value = placeholderRadius; // expose to camera clamping
    // Precompute coordinate list
    const coords: Array<{q: number; r: number; dist: number}> = [];
    for (let q = 0; q <= placeholderRadius; q++) {
        for (let r = 0; r <= placeholderRadius; r++) {
            for(const [sq, sr] of [[q, r], [-q, r], [q, -r], [-q, -r]]) {
                const dist = hexDistance(sq, sr);
                if (dist > placeholderRadius) continue;
                if (sq === 0 && sr === 0) continue;
                coords.push({q: sq, r: sr, dist});
            }
        }
    }
    generationTotal.value = coords.length;
    generationStatus.value = 'Generating world...';

    let index = 0;
    function step() {
        const start = performance.now();
        // Process until time budget exhausted or done
        while (index < coords.length && (performance.now() - start) < frameTimeBudgetMs) {
            const entry = coords[index];
            index++;
            const {q, r, dist} = entry; // non-null due to while guard
            const t = ensureTileExists(q, r);
            if (dist <= discoverRadius) {
                discoverTile(t);
            }
            generationCompleted.value = index;
        }
        generationProgress.value = generationTotal.value === 0 ? 1 : generationCompleted.value / generationTotal.value;
        generationStatus.value = generationProgress.value >= 1 ? 'Finalizing...' : `Generating tiles ${generationCompleted.value} / ${generationTotal.value}`;
        // Bump world version so UI can react
        worldVersion.value++;
        if (index < coords.length) {
            requestAnimationFrame(step);
        } else {
            // Final pass: ensure neighbors of edge discovered tiles exist
            generationStatus.value = 'World ready';
            generationProgress.value = 1;
            generationInProgress.value = false;
            worldVersion.value++;
        }
    }
    requestAnimationFrame(step);
}

export function startWorldGeneration(radius: number = 4) {
    generateInitialWorld(radius);
}

const initial: IdleState = (loadState() as IdleState) ?? {
    radius: 4,
    tiles: tiles,
    tick: 0,
    running: false,
    worldVersion: worldVersion.value
};
export const idleStore = initial;
// Start async generation instead of synchronous seed
startWorldGeneration(100);

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

export function getWorldBounds(padding: number = 0) {
    return {
        minQ: minQ - padding,
        maxQ: maxQ + padding,
        minR: minR - padding,
        maxR: maxR + padding
    };
}

export function hexDistance(q: number, r: number): number {
    // Distance from origin in axial coordinates
    const dq = Math.abs(q);
    const dr = Math.abs(r);
    const ds = Math.abs(-q - r);
    return Math.max(dq, dr, ds);
}
