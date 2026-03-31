
import {weightedTerrainChoice, resetTerrainWeightCache} from './terrain';
import type {TerrainKey} from './terrainDefs';
import {TERRAIN_DEFS} from './terrainDefs';
import { applyVariant } from './variants';
import { registerExistingAgingTiles, resetTileGrowthTracking } from './growth';
import { indexTileInRegistry, resetTerrainRegistry, terrainPositions, updateTileVariantIndex } from './terrainRegistry';
import {OPPOSITE_SIDE, SIDE_NAMES, type Terrain, type Tile, type TileNeighborMap} from "./types/Tile";
import type {TileUpdatedMessage} from "../shared/protocol.ts";
import { broadcastGameMessage as broadcast } from '../shared/game/runtime';
import { axialDistanceFromOrigin } from '../shared/game/hex';
import { emitGameplayEvent } from '../shared/gameplay/events';

// Side names clockwise starting at +q (matching first axial delta) then proceeding.
// World data containers
export let tiles: Tile[] = [];
export let tileIndex: Record<string, Tile> = {};
const radiusOffsetCache = new Map<number, Array<[number, number]>>();

export let worldOuterRadius = 0;

// Per-axis discovered radius caches
const maxRadiusByQ = new Map<number, number>();
const maxRadiusByR = new Map<number, number>();
// Internal world bounds tracking
let minQ = 0, maxQ = 0, minR = 0, maxR = 0;
export function axialKey(q: number, r: number) {
    return `${q},${r}`;
}

export function hexDistance(q: number, r: number): number {
    return axialDistanceFromOrigin(q, r);
}

function indexTile(t: Tile) {
    tileIndex[t.id] = t;
    if (t.q < minQ) minQ = t.q;
    if (t.q > maxQ) maxQ = t.q;
    if (t.r < minR) minR = t.r;
    if (t.r > maxR) maxR = t.r;
    const dist = hexDistance(t.q, t.r);
    if (dist > worldOuterRadius) worldOuterRadius = dist;
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

export function updateTile(tile: Tile) {
    const target = tileIndex[tile.id] ?? ensureTileExists(tile.q, tile.r);
    const prevTerrain = target.terrain;
    const prevVariant = target.variant;

    Object.assign(target, tile);
    tileIndex[target.id] = target;

    if (prevTerrain && prevTerrain !== target.terrain) {
        terrainPositions[prevTerrain].delete(target.id);
    }
    if (target.terrain) {
        terrainPositions[target.terrain].add(target.id);
    }
    updateTileVariantIndex(target.id, prevVariant, target.variant);

    if(target.discovered) {
        ensureTileNeighbors(target);
    }
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
    Object.defineProperty(tile, 'neighbors', { value: obj as TileNeighborMap, configurable: true, writable: true });
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
        const nm = tile.neighbors ?? { a: null, b: null, c: null, d: null, e: null, f: null };
        const terrains: TerrainKey[] = [];
        for (const side of SIDE_NAMES) {
            const nt = nm[side];
            if(nt === null) continue;
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
        emitGameplayEvent({
            type: 'tile:discovered',
            tileId: tile.id,
            q: tile.q,
            r: tile.r,
            terrain: tile.terrain,
        });
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
    emitGameplayEvent({
        type: 'tile:discovered',
        tileId: tile.id,
        q: tile.q,
        r: tile.r,
        terrain: tile.terrain,
    });

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

    if(!generating) {
        broadcast({type: 'tile:updated', tile} as TileUpdatedMessage)
    }
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
    const radQs: number[] = [maxRadiusByQ.get(iq) ?? worldOuterRadius];
    const radRs: number[] = [maxRadiusByR.get(ir) ?? worldOuterRadius];
    const checkRange = offset;
    for (let d = -checkRange; d <= checkRange; d++) {
        const radQ = maxRadiusByQ.get(iq + d);
        if (radQ !== undefined) radQs.push(radQ);
        const radR = maxRadiusByR.get(ir + d);
        if (radR !== undefined) radRs.push(radR);
    }
    return Math.min(worldOuterRadius, Math.max(...radQs), Math.max(...radRs));
}

let generating = false;

export async function generateInitialWorld(discoverRadius: number = 4) {
    generating = true;
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

    let index = 0;

    while (index < coords.length) {
        const entry = coords[index]!;
        index++;
        const {q, r, dist} = entry;
        const t = ensureTileExists(q, r);
        if (dist <= discoverRadius) discoverTile(t);
    }

    generating = false;
}

function clearWorld() {
    tiles.length = 0;
    tileIndex = {};
    resetTileGrowthTracking();

    minQ = 0;
    maxQ = 0;
    minR = 0;
    maxR = 0;
    maxRadiusByQ.clear();
    maxRadiusByR.clear();
    resetTerrainWeightCache(); // ensure terrain weight contexts are recomputed for new world
    resetTerrainRegistry();
}

export function startWorldGeneration(radius: number) {
    clearWorld();
    generateInitialWorld(radius);
}

export function getTile(position: { q: number, r: number}) {
    return tileIndex[axialKey(position.q, position.r)];
}

export function loadWorld(tileData: Tile[]) {
    clearWorld()
    for (const t of tileData ?? []) {
        tiles.push(t);
        indexTile(t);
        indexTileInRegistry(t);
    }
    for (const t of tiles) {
        if (!t.discovered) continue;
        const legacy = (t as any).neighbors;
        if (Array.isArray(legacy)) {
            const obj: Partial<TileNeighborMap> = {};
            for (let i = 0; i < Math.min(legacy.length, 6); i++) {
                const side = SIDE_NAMES[i]!;
                obj[side] = legacy[i];
            }
            Object.defineProperty(t, 'neighbors', { value: obj as TileNeighborMap, configurable: true, writable: true });
        }
        ensureTileNeighbors(t);
    }
    // Re-register aging tiles after load
    registerExistingAgingTiles(tiles);
}
