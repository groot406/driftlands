import {reactive, watch} from 'vue';

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

export type Terrain = 'forest' | 'mine' | 'water' | 'ruin' | 'plains' | 'mountain' | 'towncenter';
export type ResourceType = 'wood' | 'ore' | 'stone' | 'food' | 'crystal' | 'artifact';

export interface Tile {
    id: string;
    q: number;
    r: number;
    terrain: Terrain;
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
    lastSaved: number;
    roads: Road[]; // added
}

const TASK_DEFS: IdleTaskDef[] = [
    {type: 'EXPLORE', baseSeconds: 20, primaryStat: 'explore'},
    {type: 'MINE', baseSeconds: 30, primaryStat: 'yield', resourceYield: {ore: 10, stone: 12, crystal: 2}},
    {type: 'BUILD', baseSeconds: 40, primaryStat: 'build', resourceYield: {wood: -20, stone: -15}},
    {type: 'DEFEND', baseSeconds: 25, primaryStat: 'defense'}
];

const terrains: Terrain[] = ['forest', 'mine', 'ruin', 'water', 'plains', 'mountain'];

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


function isNeighbor(q1: number, r1: number, q2: number, r2: number): boolean {
    const dq = q2 - q1;
    const dr = r2 - r1;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
}

function getNeighbors(q: number, r: number): {q:number,r:number}[] {
    return [
        {q: q + 1, r: r    },
        {q: q - 1, r: r    },
        {q: q    , r: r + 1},
        {q: q    , r: r - 1},
        {q: q + 1, r: r - 1},
        {q: q - 1, r: r + 1},
    ];
}
export { getNeighbors }; // export for components

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

function saveState(state: IdleState) {
    //localStorage.setItem(LOCAL_KEY, serial);
}

const initial: IdleState = loadState() ?? {
    radius: 4,
    tiles: generateWorld(40, 39),
    heroes: seedHeroes(),
    inventory: {wood: 0, ore: 0, stone: 0, food: 0, crystal: 0, artifact: 0},
    tick: 0,
    running: false,
    lastSaved: Date.now(),
    roads: [], // initialize roads
};

export const idleStore = reactive(initial);

function fastForward(elapsedMs: number) {
    // approximate progress advancement
    const dt = elapsedMs / 1000; // seconds offline
    idleStore.heroes.forEach(hero => {
        if (hero.task && !hero.task.completed) {
            hero.task.progress = Math.min(hero.task.required, hero.task.progress + dt);
            if (hero.task.progress >= hero.task.required) completeTask(hero.task);
        }
    });
}

if (loadState()) {
    const elapsed = Date.now() - idleStore.lastSaved;
    fastForward(elapsed);
}

watch(idleStore, () => {
    idleStore.lastSaved = Date.now();
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
    const id = roadCanonical(a,b);
    return idleStore.roads.some(r => r.id === id);
}
export function addRoad(a: string, b: string) {
    if (a === b) return;
    const tileA = idleStore.tiles.find(t => t.id === a);
    const tileB = idleStore.tiles.find(t => t.id === b);
    if (!tileA || !tileB) return;
    if (!tileA.discovered || !tileB.discovered) return;
    const id = roadCanonical(a,b);
    if (idleStore.roads.find(r => r.id === id)) return; // already
    idleStore.roads.push({id, a, b});
}

function isInRadius(q: number, r: number, radius: number): boolean {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= radius;
}


// Weighted terrain generator: pass in neighbor terrains
function getRandomTerrain(neighborTerrains: Terrain[] = []): Terrain {
    // Base weights
    const weights: Record<Terrain, number> = {
        water: 2,
        plains: 4,
        forest: 3,
        mountain: 2,
        mine: 1,
        ruin: 1,
        towncenter: 0 // never randomly generated
    };

    for (const t of neighborTerrains) {
        switch (t) {
            case 'water':
                weights.water += 5;
                weights.plains += 2;
                break;
            case 'plains':
                weights.forest += 1;
                weights.plains += 2;
                break;
            case 'forest':
                weights.forest += 4;
                weights.plains += 1;
                break;
            case 'mountain':
                weights.mountain += 2;
                weights.mine += 2;
                weights.ruin -= 0.5;
                break;
            case 'mine':
                weights.mine = 0;
                weights.mountain += 1;
                break;
            case 'ruin':
                weights.forest += 2;
                weights.ruin = 0;
                break;
        }
    }

    // Build selection pool excluding towncenter
    const entries = Object.entries(weights).filter(([k]) => k !== 'towncenter') as [Terrain, number][];
    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    let roll = Math.random() * total;
    for (const [terrain, w] of entries) {
        if (roll < w) return terrain;
        roll -= w;
    }
    return 'plains';
}

// Updated world generation to use neighbor-informed terrain
function generateWorld(radius: number, discoveredRadius: number): Tile[] {
    const tiles: Tile[] = [];
    for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
            const id = axialKey(q, r);
            if (q === 0 && r === 0) {
                tiles.push({
                    id,
                    q,
                    r,
                    terrain: 'towncenter',
                    discovered: true,
                    resourceRichness: 1.5
                });
                continue;
            }
            // Collect already-generated neighbor terrains
            const neighborTerrains = getNeighbors(q, r)
                .map(n => tiles.find(t => t.q === n.q && t.r === n.r))
                .filter(Boolean)
                .map(t => t!.terrain)
                .filter(t => t !== 'towncenter'); // towncenter does not bias
            const terrain = getRandomTerrain(neighborTerrains as Terrain[]);
            tiles.push({
                id,
                q,
                r,
                terrain,
                discovered: isInRadius(q, r, discoveredRadius),
                resourceRichness: 1 + Math.random() * 0.5
            });
        }
    }
    return tiles;
}

// Updated discoverTile to use weighted generation
export function discoverTile(tile: Tile) {
    const neighborTerrains = getNeighbors(tile.q, tile.r)
        .map(n => idleStore.tiles.find(t => t.q === n.q && t.r === n.r && t.discovered))
        .filter(Boolean)
        .map(t => t!.terrain)
        .filter(t => t !== 'towncenter');
    tile.terrain = getRandomTerrain(neighborTerrains as Terrain[]);
    tile.discovered = true;
    const neighbors = getNeighbors(tile.q, tile.r);
    neighbors.forEach(n => {
        const key = axialKey(n.q, n.r);
        if (!idleStore.tiles.find(t => t.id === key)) {
            idleStore.tiles.push({
                id: key,
                q: n.q,
                r: n.r,
                terrain: 'plains', // placeholder until discovered
                discovered: false,
                resourceRichness: 1 + Math.random() * 0.5
            });
        }
    });
}