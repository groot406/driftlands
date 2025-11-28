import {ref, markRaw} from 'vue';
import {weightedTerrainChoice, resetTerrainWeightCache} from './terrain';
import type {TerrainKey} from './terrainDefs';
import {idleStore as store} from "../store/idleStore.ts";
import {createLoader, finishLoader, getLoader, updateLoader} from './loader';
import {TERRAIN_DEFS} from './terrainDefs';
import { applyVariant } from './variants';
import { registerExistingAgingTiles } from './growth';
import { terrainPositions } from './terrainRegistry';

export type Terrain = TerrainKey;
export type ResourceType = 'wood' | 'ore' | 'stone' | 'food' | 'crystal' | 'artifact' | 'water';

export interface Tile {
    id: string;
    q: number;
    r: number;
    pixel?: { x: number; y: number };
    biome: string | null;
    terrain: Terrain | null;
    discovered: boolean;
    // Variant key if a terrain variation was selected (e.g. 'plains_coast_a'). Null if base terrain.
    variant?: string | null;
    // Timestamp when current variant was set (for growth progression)
    variantSetMs?: number;
    // Cached direct neighbor tiles mapped by side (a-f clockwise). Populated lazily.
    neighbors?: TileNeighborMap;
}

// Side names clockwise starting at +q (matching first axial delta) then proceeding.
const SIDE_NAMES = ['a','b','c','d','e','f'] as const;
export type TileSide = typeof SIDE_NAMES[number];
export interface TileNeighborMap { a: Tile; b: Tile; c: Tile; d: Tile; e: Tile; f: Tile; }
const OPPOSITE_SIDE: Record<TileSide, TileSide> = { a: 'd', b: 'e', c: 'f', d: 'a', e: 'b', f: 'c' };

// Reactive world version bump for UI invalidation
export const worldVersion = ref(0);

// World data containers
export const tiles: Tile[] = [];
export let tileIndex: Record<string, Tile> = {};
const radiusOffsetCache = new Map<number, Array<[number, number]>>();
export const worldOuterRadius = ref(0);
// Per-axis discovered radius caches
const maxRadiusByQ = new Map<number, number>();
const maxRadiusByR = new Map<number, number>();

// Generation progress refs
export const generationInProgress = ref(false);
export const generationProgress = ref(0); // 0-1
export const generationCompleted = ref(0);
export const generationTotal = ref(0);

// Internal world bounds tracking
let minQ = 0, maxQ = 0, minR = 0, maxR = 0;

export function axialKey(q: number, r: number) {
    return `${q},${r}`;
}

export function hexDistance(q: number, r: number): number {
    const dq = Math.abs(q);
    const dr = Math.abs(r);
    const ds = Math.abs(-q - r);
    return Math.max(dq, dr, ds);
}

function indexTile(t: Tile) {
    tileIndex[t.id] = t;
    if (t.q < minQ) minQ = t.q;
    if (t.q > maxQ) maxQ = t.q;
    if (t.r < minR) minR = t.r;
    if (t.r > maxR) maxR = t.r;
    const dist = hexDistance(t.q, t.r);
    if (dist > worldOuterRadius.value) worldOuterRadius.value = dist;
    const qKey = t.q;
    const rKey = t.r;
    const prevQ = maxRadiusByQ.get(qKey) ?? 0;
    if (dist > prevQ) maxRadiusByQ.set(qKey, dist);
    const prevR = maxRadiusByR.get(rKey) ?? 0;
    if (dist > prevR) maxRadiusByR.set(rKey, dist);
}

export function ensureTileExists(q: number, r: number): Tile {
    const id = axialKey(q, r);
    let t = tileIndex[id];
    if (!t) {
        t = {id, q, r, terrain: null, biome: null, discovered: false};
        tiles.push(t);
        indexTile(t);
    }
    return t;
}

// Axial coordinate neighbor deltas (pointy-top layout):
const AXIAL_NEIGHBOR_DELTAS: Array<[number, number]> = [
    [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]
];

function ensureTileNeighbors(tile: Tile): TileNeighborMap {
    if (tile.neighbors) return tile.neighbors;
    const obj: Partial<TileNeighborMap> = {};
    for (let i = 0; i < AXIAL_NEIGHBOR_DELTAS.length; i++) {
        const [dq, dr] = AXIAL_NEIGHBOR_DELTAS[i]!;
        const side = SIDE_NAMES[i]!;
        obj[side] = ensureTileExists(tile.q + dq, tile.r + dr);
    }
    // Define as non-enumerable & mark raw to prevent Vue from deep proxying (avoids circular reactive graph & JSON stringify loops)
    Object.defineProperty(tile, 'neighbors', { value: markRaw(obj as TileNeighborMap), configurable: true, writable: true });
    // Reverse linking (still non-enumerable for target tiles if not yet defined)
    for (const side of SIDE_NAMES) {
        const n = tile.neighbors![side]!;
        const opposite = OPPOSITE_SIDE[side];
        if (n.neighbors && n.neighbors[opposite] !== tile) {
            n.neighbors[opposite] = tile;
        }
    }
    return tile.neighbors!;
}

export function getNeighborTerrains(tile: Tile, radius: number = 1): Terrain[] {
    if (radius === 1) {
        const nm = tile.neighbors ?? ensureTileNeighbors(tile);
        const terrains: TerrainKey[] = [];
        for (const side of SIDE_NAMES) {
            const nt = nm[side];
            if (nt.discovered && nt.terrain) terrains.push(nt.terrain);
        }
        return terrains;
    }
    const neighbors: TerrainKey[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            if (dq === 0 && dr === 0) continue;
            const nt = tileIndex[axialKey(tile.q + dq, tile.r + dr)];
            if (nt && nt.discovered && nt.terrain) neighbors.push(nt.terrain);
        }
    }
    return neighbors;
}

export function discoverTile(tile: Tile) {
    if (tile.discovered && tile.terrain) return;
    if (tile.q === 0 && tile.r === 0) {
        tile.terrain = 'towncenter';
        tile.variant = null;
        tile.discovered = true;
        if (!tileIndex[tile.id]) indexTile(tile);
        ensureTileNeighbors(tile);
        terrainPositions.towncenter.add(tile.id);
        worldVersion.value++;
        return;
    }
    const neighborTerrains = getNeighborTerrains(tile);
    const biomeTerrains = getNeighborTerrains(tile, 2);
    const generated = weightedTerrainChoice(neighborTerrains, biomeTerrains, tile.q, tile.r);

    tile.biome = generated.biome;
    tile.terrain = generated.terrain;
    tile.discovered = true;
    if (!tileIndex[tile.id]) indexTile(tile);
    ensureTileNeighbors(tile);
    if (tile.terrain) terrainPositions[tile.terrain].add(tile.id);

    // --- Variation selection ---
    tile.variant = null;
    if (tile.terrain) {
        const def = TERRAIN_DEFS[tile.terrain];
        const variations = def?.variations;
        if (variations && variations.length) {
            const nm = tile.neighbors ?? ensureTileNeighbors(tile);
            // Build valid variants list based on constraints
            const valid: { key: string; weight: number }[] = [];
            for (const v of variations) {
                let ok = true;
                if (v.constraints && v.constraints.length) {
                    for (const c of v.constraints) {
                        const sideTile = nm[c.side];
                        if (!sideTile) { ok = false; break; }
                        const neighborTerrain = sideTile.discovered ? sideTile.terrain : null;
                        const terrainOk = neighborTerrain && c.anyOf.includes(neighborTerrain);
                        const undiscoveredOk = (!neighborTerrain && c.allowUndiscovered);
                        if (!(terrainOk || undiscoveredOk)) { ok = false; break; }
                    }
                }
                if (ok) valid.push({ key: v.key, weight: Math.max(0, v.weight ?? (def.baseWeight/variations.length)) });
            }
            if (valid.length) {
                const baseWeight = def.baseWeight;
                const total = baseWeight + valid.reduce((a, b) => a + (b.weight ?? (def.baseWeight/variations.length)), 0);
                let roll = Math.random() * total;
                if (roll > baseWeight) {
                    roll -= baseWeight;
                    for (const v of valid) {
                        if (roll < v.weight) { tile.variant = v.key; break; }
                        roll -= v.weight;
                    }
                }
            }
            // If selected variant has growth config, record timestamp and track aging
            if (tile.variant) {
                applyVariant(tile, tile.variant, { stagger: true, respectBiome: true });
            }
        }
    }

    worldVersion.value++;
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

export function getMaxRadiusFor(q: number, r: number, offset: number): number {
    const iq = Math.round(q);
    const ir = Math.round(r);
    const radQs: number[] = [maxRadiusByQ.get(iq) ?? worldOuterRadius.value];
    const radRs: number[] = [maxRadiusByR.get(ir) ?? worldOuterRadius.value];
    const checkRange = offset;
    for (let d = -checkRange; d <= checkRange; d++) {
        const radQ = maxRadiusByQ.get(iq + d);
        if (radQ !== undefined) radQs.push(radQ);
        const radR = maxRadiusByR.get(ir + d);
        if (radR !== undefined) radRs.push(radR);
    }
    return Math.min(worldOuterRadius.value, Math.max(...radQs), Math.max(...radRs));
}

// Async progressive generation
export async function generateInitialWorld(discoverRadius: number = 4, frameTimeBudgetMs: number = 8) {
    if (generationInProgress.value || generationProgress.value >= 1) return;
    // Initialize loader (id stable across regenerations)
    const loaderId = 'world-gen';
    let loader = getLoader(loaderId);
    if (!loader) {
        createLoader(loaderId, {title: 'World Generation', status: 'Preparing world...', unitLabel: 'Tiles'});
    } else {
        updateLoader(loaderId, {status: 'Preparing world...', completed: 0, total: 0, active: true});
    }

    generationInProgress.value = true;
    generationProgress.value = 0;
    generationCompleted.value = 0;

    discoverTile(ensureTileExists(0, 0));
    const placeholderRadius = discoverRadius + 1;
    const coords: Array<{ q: number; r: number; dist: number }> = [];
    for (let q = 0; q <= placeholderRadius; q++) {
        for (let r = 0; r <= placeholderRadius; r++) {
            const variants: [number, number][] = [[q, r], [-q, r], [q, -r], [-q, -r]];
            for (const [sq, sr] of variants) {
                const dist = hexDistance(sq, sr);
                if (dist > placeholderRadius) continue;
                if (sq === 0 && sr === 0) continue;
                coords.push({q: sq, r: sr, dist});
            }
        }
    }
    generationTotal.value = coords.length;
    updateLoader(loaderId, {total: coords.length});
    updateLoader(loaderId, {status: 'Generating world...'});
    let index = 0;

    function step() {
        const start = performance.now();
        while (index < coords.length && (performance.now() - start) < frameTimeBudgetMs) {
            const entry = coords[index]!;
            index++;
            const {q, r, dist} = entry;
            const t = ensureTileExists(q, r);
            if (dist <= discoverRadius) discoverTile(t);
            generationCompleted.value = index;
        }
        generationProgress.value = generationTotal.value === 0 ? 1 : generationCompleted.value / generationTotal.value;
        const status = generationProgress.value >= 1 ? 'Finalizing...' : `Generating tiles ${generationCompleted.value} / ${generationTotal.value}`;
        updateLoader(loaderId, {completed: generationCompleted.value, status});
        worldVersion.value++;
        if (index < coords.length) {
            requestAnimationFrame(step);
        } else {
            generationProgress.value = 1;
            generationInProgress.value = false;
            updateLoader(loaderId, {completed: generationTotal.value, status: 'Reducing terrain islands...'});
            reduceTerrainIslands();
            finishLoader(loaderId, 'World ready');
            worldVersion.value++;
        }
    }

    requestAnimationFrame(step);
}

function clearWorld() {
    generationInProgress.value = false;
    generationProgress.value = 0;
    tiles.length = 0;
    tileIndex = {};

    minQ = 0;
    maxQ = 0;
    minR = 0;
    maxR = 0;
    maxRadiusByQ.clear();
    maxRadiusByR.clear();
    resetTerrainWeightCache(); // ensure terrain weight contexts are recomputed for new world
    for (const key of Object.keys(terrainPositions) as TerrainKey[]) terrainPositions[key].clear();
}

export function startWorldGeneration(radius: number) {
    clearWorld();
    generateInitialWorld(radius);
    store.tiles = tiles;
}

export function loadWorld(tileData: Tile[]) {
    clearWorld()
    for (const t of tileData ?? []) {
        tiles.push(t);
        indexTile(t);
    }
    for (const t of tiles) {
        if (t.terrain) terrainPositions[t.terrain].add(t.id);
        if (!t.discovered) continue;
        const legacy = (t as any).neighbors;
        if (Array.isArray(legacy)) {
            const obj: Partial<TileNeighborMap> = {};
            for (let i = 0; i < Math.min(legacy.length, 6); i++) {
                const side = SIDE_NAMES[i]!;
                obj[side] = legacy[i];
            }
            Object.defineProperty(t, 'neighbors', { value: markRaw(obj as TileNeighborMap), configurable: true, writable: true });
        }
        ensureTileNeighbors(t);
    }
    // Re-register aging tiles after load
    registerExistingAgingTiles(tiles);
    worldVersion.value++;
}

function reduceTerrainIslands() {
    let changed = false;
    for (const t of tiles) {
        if (!t.discovered || !t.terrain) continue;
        const def = TERRAIN_DEFS[t.terrain];
        if (def?.preserveIsolation) continue;
        const nm = t.neighbors ?? ensureTileNeighbors(t);
        let sameCount = 0;
        let discoveredNeighborCount = 0;
        const neighborTerrainCounts: Record<string, number> = {};
        for (const side of ['a','b','c','d','e','f'] as const) {
            const n = nm[side];
            if (!n.discovered || !n.terrain) continue;
            discoveredNeighborCount++;
            if (n.terrain === t.terrain) sameCount++;
            neighborTerrainCounts[n.terrain] = (neighborTerrainCounts[n.terrain] ?? 0) + 1;
        }
        if (discoveredNeighborCount === 0) continue;
        // Island if no discovered neighbor shares terrain
        if (sameCount === 0) {
            // Pick majority terrain among neighbors (exclude towncenter)
            let bestTerrain: TerrainKey | null = null;
            let bestCount = -1;
            for (const [terrain, count] of Object.entries(neighborTerrainCounts)) {
                if (terrain === 'towncenter') continue;
                if (count > bestCount) { bestCount = count; bestTerrain = terrain as TerrainKey; }
            }
            if (bestTerrain && bestTerrain !== t.terrain) {
                t.terrain = bestTerrain;
                changed = true;
            }
        }
    }
    if (changed) worldVersion.value++;
}
