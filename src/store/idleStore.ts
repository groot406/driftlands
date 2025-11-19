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
    terrain: Terrain | null;
    discovered: boolean;
    resourceRichness: number;
    task?: ActiveIdleTask;
}

interface Inventory {
    wood: number;
    ore: number;
    stone: number;
    food: number;
    crystal: number;
    artifact: number;
}

interface IdleState {
    radius: number;
    tiles: Tile[];
    heroes: IdleHero[];
    inventory: Inventory;
    tick: number;
    running: boolean;
    roads: Road[]; // added
}

const TASK_DEFS: IdleTaskDef[] = [
    {type: 'EXPLORE', baseSeconds: 20, primaryStat: 'explore'},
    {type: 'MINE', baseSeconds: 30, primaryStat: 'yield', resourceYield: {ore: 10, stone: 12, crystal: 2}},
    {type: 'BUILD', baseSeconds: 40, primaryStat: 'build', resourceYield: {wood: -20, stone: -15}},
    {type: 'DEFEND', baseSeconds: 25, primaryStat: 'defense'}
];

let discoveredRadiusCache: number | null = 80000;

// Replace plain tiles array with reactive array for proper reactivity when pushing
const tiles = reactive<Tile[]>([]);
// O(1) lookup index for tiles to avoid repeated linear scans
const tileIndex: Record<string, Tile> = {};
function indexTile(t: Tile) { tileIndex[t.id] = t; }

// Chunk (block) based lazy generation -------------------------------------------------
// Each chunk is a rectangular axial coordinate span of size CHUNK_SIZE in q and r.
// We only generate chunks that come into (or neighbor) the camera view.
const CHUNK_SIZE = 100; // user-requested ~50x50 blocks
interface WorldChunkMeta { id: string; cq: number; cr: number; generated: boolean; }
// Simple reactive registry (object map for reactivity friendliness)
const chunkRegistry: Record<string, WorldChunkMeta> = reactive({});
function chunkKey(cq: number, cr: number): string { return `${cq}:${cr}`; }
function chunkIndexFor(q: number, r: number): { cq: number; cr: number } {
    return { cq: Math.floor(q / CHUNK_SIZE), cr: Math.floor(r / CHUNK_SIZE) };
}
function markChunkGenerated(meta: WorldChunkMeta) { meta.generated = true; }

// Generate a single chunk (undiscovered tiles except existing discovery). Neighbor-informed terrain
// assignment will happen later on actual discovery OR in seed pre-generation.
function generateChunk(cq: number, cr: number) {
    const key = chunkKey(cq, cr);
    const existing = chunkRegistry[key];
    if (existing?.generated) return;
    const startQ = cq * CHUNK_SIZE;
    const endQ = startQ + CHUNK_SIZE - 1;
    const startR = cr * CHUNK_SIZE;
    const endR = startR + CHUNK_SIZE - 1;
    if (!existing) {
        chunkRegistry[key] = { id: key, cq, cr, generated: false };
    }
    for (let q = startQ; q <= endQ; q++) {
        for (let r = startR; r <= endR; r++) {
            const id = axialKey(q, r);
            if (tileIndex[id]) continue; // already exists
            const tile: Tile = {
                id,
                q,
                r,
                terrain: null,
                discovered: false,
                resourceRichness: 1 + Math.random() * 0.5
            };


            tiles.push(tile);
            indexTile(tile);
            //if(isInRadius(q, r, discoveredRadiusCache)) {
            //}
            discoverTile(tile);
        }
    }
    const origin = tileIndex[axialKey(0, 0)];
    if (origin && !origin.discovered) {
        origin.discovered = true;
        origin.terrain = 'towncenter';
    }
    markChunkGenerated(chunkRegistry[key]!);
}

// Public helper: ensure chunks covering view bounds plus one chunk padding are generated.
// Provide axial bounding box in tile coordinates (q/r min & max from camera frustum calculation).
export function ensureChunksInView(qMin: number, qMax: number, rMin: number, rMax: number) {
    const { cq: cqMin } = chunkIndexFor(qMin, 0);
    const { cq: cqMax } = chunkIndexFor(qMax, 0);
    const { cr: crMin } = chunkIndexFor(0, rMin);
    const { cr: crMax } = chunkIndexFor(0, rMax);
    for (let cq = cqMin - 1; cq <= cqMax + 1; cq++) {
        for (let cr = crMin - 1; cr <= crMax + 1; cr++) {
            generateChunk(cq, cr);
        }
    }
}
// Optional: export chunk size for camera computations.
export const WORLD_CHUNK_SIZE = CHUNK_SIZE;

function randName(): string {
    const names = ['Astra', 'Bram', 'Cora', 'Dune', 'Eira'];
    const idx = Math.floor(Math.random() * names.length);
    return names[idx] ?? 'Hero';
}

function seedHeroes(): IdleHero[] {
    return Array.from({length: 3}).map((_, i) => ({
        id: 'H' + (i + 1),
        name: randName(),
        level: 1,
        xp: 0,
        stats: {speed: 2 + i % 2, yield: 2 + (i % 3), defense: 1 + i, build: 1 + i % 2, explore: 2},
        busy: false,
    }));
}

function axialKey(q: number, r: number) {
    return `${q},${r}`;
}
// Fast O(1) tile lookup by axial coordinates (exported for performance-sensitive views)
export function getTile(q: number, r: number): Tile | undefined {
    return tileIndex[axialKey(q, r)];
}

function synergyMultiplier(count: number): number {
    return 1 + 0.25 * (count - 1);
}

function statMultiplier(hero: IdleHero, def: IdleTaskDef): number {
    if (!def.primaryStat) return 1;
    const v = hero.stats[def.primaryStat];
    return 1 + v * 0.1;
}

function speedMultiplier(hero: IdleHero): number {
    return 1 + hero.stats.speed * 0.08;
}

function createActive(def: IdleTaskDef, tileId: string, heroes: IdleHero[]): ActiveIdleTask {
    const required = def.baseSeconds; // seconds accelerated
    return {
        def,
        tileId,
        assignedHeroIds: heroes.map(h => h.id),
        progress: 0,
        required,
        startedAt: Date.now(),
        completed: false
    };
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
    // Persist current state (basic implementation)
    try {
        // localStorage.setItem(LOCAL_KEY, JSON.stringify(_state));
    } catch {
        // ignore quota/security errors
    }
}

const initial: IdleState = loadState() ?? {
    radius: 4,
    // Seed a modest starting area instead of massive upfront generation.
    // We'll call generateWorld with a small radius (e.g., 20) to get initial discovered terrain diversity.
    tiles: generateWorld(50),
    heroes: seedHeroes(),
    inventory: {wood: 0, ore: 0, stone: 0, food: 0, crystal: 0, artifact: 0},
    tick: 0,
    running: false,
    roads: [],
};
export const idleStore = reactive(initial);

// Ensure tileIndex populated for preloaded tiles (e.g., loaded from storage)
if (idleStore.tiles.length) {
    idleStore.tiles.forEach(t => { if (!tileIndex[t.id]) indexTile(t); });
}

watch(idleStore, () => {
    saveState(idleStore);
}, {deep: true});

export function startIdle() {
    if (idleStore.running) return;
    idleStore.running = true;
    loop();
}

export function assignTask(tileId: string, heroIds: string[], type: IdleTaskType) {
    const tile = idleStore.tiles.find(t => t.id === tileId);
    if (!tile || tile.task) return;
    const def = TASK_DEFS.find(d => d.type === type)!;
    const heroes = idleStore.heroes.filter(h => heroIds.includes(h.id) && !h.busy);
    if (!heroes.length) return;
    heroes.forEach(h => h.busy = true);
    const task = createActive(def, tileId, heroes);
    tile.task = task;
    heroes.forEach(h => h.task = task);
}

function completeTask(task: ActiveIdleTask) {
    task.completed = true;
    const heroes = idleStore.heroes.filter(h => task.assignedHeroIds.includes(h.id));
    heroes.forEach(h => {
        h.busy = false;
        h.task = undefined;
        h.xp += task.def.baseSeconds;
        if (h.xp >= h.level * 100) h.level++;
    });
    const tile = idleStore.tiles.find(t => t.id === task.tileId);
    if (!tile) return;
    if (task.def.type === 'EXPLORE') tile.discovered = true;
    if (task.def.resourceYield) {
        // aggregate yield factoring richness and synergy
        const mult = synergyMultiplier(heroes.length) * tile.resourceRichness;
        for (const [res, amt] of Object.entries(task.def.resourceYield)) {
            if (!res) continue;
            const value = Math.round((amt as number) * mult);
            idleStore.inventory[res as ResourceType] = Math.max(0, idleStore.inventory[res as ResourceType] + value);
        }
    }
    tile.task = undefined;
}

function loop() {
    if (!idleStore.running) return;
    const dt = 1 / 60; // simulation step seconds
    idleStore.tick++;
    idleStore.tiles.forEach(tile => {
        const task = tile.task;
        if (!task || task.completed) return;
        const heroes = idleStore.heroes.filter(h => task.assignedHeroIds.includes(h.id));
        const collectiveRate = heroes.reduce((acc, h) => acc + speedMultiplier(h) * statMultiplier(h, task.def), 0) * synergyMultiplier(heroes.length);
        task.progress += collectiveRate * dt * 0.5; // 0.5 tuning factor
        if (task.progress >= task.required) {
            task.progress = task.required;
            completeTask(task);
        }
    });
    requestAnimationFrame(loop);
}

export function taskPercent(task?: ActiveIdleTask): number {
    if (!task) return 0;
    return Math.floor(task.progress / task.required * 100);
}

// Road helpers
function roadCanonical(a: string, b: string): string {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function hasRoad(a: string, b: string): boolean {
    const id = roadCanonical(a, b);
    return idleStore.roads.some(r => r.id === id);
}

export function addRoad(a: string, b: string) {
    if (a === b) return;
    const tileA = idleStore.tiles.find(t => t.id === a);
    const tileB = idleStore.tiles.find(t => t.id === b);
    if (!tileA || !tileB) return;
    if (!tileA.discovered || !tileB.discovered) return;
    const id = roadCanonical(a, b);
    if (idleStore.roads.find(r => r.id === id)) return; // already
    idleStore.roads.push({id, a, b});
}

function isInRadius(q: number, r: number, radius: number): boolean {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= radius;
}

// Updated world generation to use neighbor-informed terrain
function generateWorld(radius: number): Tile[] {
    // Pre-pass: ensure all axial coordinates within radius exist
    for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
            const id = axialKey(q, r);
            let tile = tileIndex[id];
            if (!tile) {
                tile = {
                    id,
                    q,
                    r,
                    terrain: null,
                    discovered: false,
                    resourceRichness: 1 + Math.random() * 0.5
                };
                tiles.push(tile);
                indexTile(tile);
            }
            if (q === 0 && r === 0) {
                tile.terrain = 'towncenter';
                tile.discovered = true;
            } else if (isInRadius(q, r, discoveredRadiusCache) && !tile.discovered) {
                // Defer discovery assignment to batch post pass for better neighbor context
                // We'll mark discovered now to allow neighbor-based weighting; terrain assigned later.
                tile.discovered = true;
            }
        }
    }
    // Second pass: assign terrain to all discovered tiles without terrain (excluding towncenter)
    // Build quick neighbor terrain cache to avoid repeated computation where possible.
    for (const tile of tiles) {
        if (!tile.discovered || tile.terrain) continue; // skip undiscovered or already assigned
        const neighborTerrains = getNeighborTerrainsFast(tile, 1);
        const biomeSample = getNeighborTerrainsFast(tile, 3);
        let generated = weightedTerrainChoice(neighborTerrains as Terrain[], biomeSample as Terrain[]);
        if (generated === 'towncenter') generated = 'plains'; // guard
        tile.terrain = generated;
    }
    return tiles;
}
// Fast neighbor terrain fetch using tileIndex (discovered tiles only)
function getNeighborTerrainsFast(tile: Tile, radius: number = 1): TerrainKey[] {
    const results: TerrainKey[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            if (dq === 0 && dr === 0) continue;
            const id = axialKey(tile.q + dq, tile.r + dr);
            const nt = tileIndex[id];
            if (nt && nt.discovered && nt.terrain && nt.terrain !== 'towncenter') {
                results.push(nt.terrain);
            }
        }
    }
    return results;
}

function getNeighbors(q: number, r: number, radius: number = 1): { q: number, r: number }[] {
    const results: { q: number, r: number }[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            if (dq === 0 && dr === 0) continue;
            results.push({q: q + dq, r: r + dr});
        }
    }
    return results;
}

function getNeighborTerrains(tile: Tile, radius: number = 1): Array<TerrainKey> {
    return getNeighbors(tile.q, tile.r, radius)
        .map(n => tileIndex[axialKey(n.q, n.r)])
        .filter(t => t && t.discovered)
        .map((t): TerrainKey => t!.terrain ?? 'plains')
        .filter(t => t !== 'towncenter');
}

// Updated discoverTile to use weighted generation
export function discoverTile(tile: Tile, createNeighbors: boolean = true) {
    const neighborTerrains = getNeighborTerrains(tile);
    let generated = weightedTerrainChoice(neighborTerrains as Terrain[], getNeighborTerrains(tile, 3));
    if (generated === 'towncenter' && !(tile.q === 0 && tile.r === 0)) {
        generated = 'plains';
    }
    tile.terrain = generated;
    tile.discovered = true;
    if (!tileIndex[tile.id]) indexTile(tile);
    if (generated === 'towncenter') {
        const count = tiles.filter(t => t.terrain === 'towncenter').length;
        if (count > 1) {
            // eslint-disable-next-line no-console
            console.warn('Duplicate towncenter detected, count=', count);
        }
    }

    // getNeighbors(tile.q, tile.r).forEach(n => {
    //     const key = axialKey(n.q, n.r);
    //     if (!tileIndex[key]) {
    //         const newTile: Tile = {
    //             id: key,
    //             q: n.q,
    //             r: n.r,
    //             terrain: 'plains',
    //             discovered: false,
    //             resourceRichness: 1 + Math.random() * 0.5
    //         };
    //         tiles.push(newTile);
    //         indexTile(newTile);
    //     }
    // });
}
