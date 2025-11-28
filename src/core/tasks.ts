import {type ResourceType, type Tile, worldVersion} from './world';
import type {Hero, HeroStat} from '../store/heroStore';
import {startTask, joinTask, getTaskByTile} from '../store/taskStore';
import { HexMapService } from './HexMapService';
import { depositResource } from '../store/resourceStore';

// Import task definitions to register them
import.meta.glob('../core/taskDefs/*', { eager: true });

import {startHeroMovement} from '../store/heroStore';
import {listTaskDefinitions} from "./taskRegistry.ts";
// Task definition interfaces enable future extension.
export interface TaskDefinition {
    key: TaskType;
    label: string;

    // Whether a hero can start this task on the given tile
    canStart(tile: Tile, hero: Hero): boolean;

    // Total XP required for completion (can depend on tile distance)
    requiredXp(distance: number): number;

    // XP contribution per tick for a given hero (can depend on hero & tile)
    heroRate(hero: Hero, tile: Tile): number;

    // Optional hook when task starts
    onStart?(tile: Tile, participants: Hero[]): void;

    // Optional hook each tick after progress applied
    onProgress?(tile: Tile, instance: TaskInstance): void;

    // Completion hook (e.g. discover tile, distribute rewards)
    onComplete?(tile: Tile, instance: TaskInstance, participants: Hero[]): void;

    // Optional base reward XP for participants collectively (split proportionally)
    totalRewardedStats?(distance: number): Record<HeroStat, number>;

    // Optional base reward resources for participants collectively (split proportionally)
    totalRewardedResources?(distance: number): ResourceAmount;

    requiredResources?(distance: number): ResourceAmount[]

    repeatTask?: boolean; // whether task can be repeated on same tile
    chainAdjacentSameTerrain?: boolean|Function; // optional flag to auto-chain task to neighboring same-terrain tiles
}
export type ResourceAmount = { type: ResourceType; amount: number };
export type TaskType = 'explore' | 'chopWood' | 'plantTrees' | string;

export interface TaskInstance {
    id: string;
    type: TaskType;
    tileId: string;
    progressXp: number;
    requiredXp: number;
    createdTick: number; // legacy tick when created
    completedTick?: number; // legacy tick when completed
    // Real-time fields for offline progression
    createdMs: number; // Date.now() when task started
    lastUpdateMs: number; // last Date.now() when progress applied
    completedMs?: number; // Date.now() when completed
    participants: Record<string, number>; // heroId -> contributedXp (time-scaled cumulative)
    active: boolean;
}

// Removed local registry & explore task definition; see taskRegistry.ts and taskDefs/explore.ts

// Helper invoked when hero arrives at a tile (from heroStore)
export function handleHeroArrival(hero: Hero, tile: Tile) {
    if (!hero || !tile) return;
    const pending = hero.pendingChain; // capture before potential clearing

    // Handle resource fetch: if hero is fetching a resource and arrived at source
    if (hero.carryingPayload && hero.carryingPayload.amount < 0 && pending && hero.returnPos) {
        // Hero arrived at resource location to pick it up
        const resourceType = hero.carryingPayload.type;
        const neededAmount = Math.abs(hero.carryingPayload.amount);
        const payload = hero.carryingPayload as any;

        if (resourceType === 'water' && payload.waterSourceTileId) {
            // Check if hero is adjacent to the water tile
            const waterTile = tileIndex[payload.waterSourceTileId];
            if (waterTile) {
                const neighbors = tile.neighbors ?? ensureTileExists(tile.q, tile.r).neighbors;
                let isAdjacentToWater = false;

                if (neighbors) {
                    for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
                        if (neighbors[side]?.id === waterTile.id) {
                            isAdjacentToWater = true;
                            break;
                        }
                    }
                }

                if (isAdjacentToWater) {
                    // Pick up water
                    hero.carryingPayload = { type: 'water' as any, amount: neededAmount };
                    // Now return to task location
                    const service = new HexMapService();
                    const pathBack = service.findWalkablePath(hero.q, hero.r, hero.returnPos.q, hero.returnPos.r);
                    if (pathBack && pathBack.length > 0) {
                        const taskType = pending.taskType;
                        startHeroMovement(hero.id, pathBack, hero.returnPos, taskType);
                        return;
                    }
                }
            }
        } else if (tile.terrain === 'towncenter' && resourceType !== 'water') {
            // Pick up resource from warehouse
            hero.carryingPayload = { type: resourceType, amount: neededAmount };
            // Deduct from warehouse inventory would happen here if tracked per-warehouse
            // Now return to task location
            const service = new HexMapService();
            const pathBack = service.findWalkablePath(hero.q, hero.r, hero.returnPos.q, hero.returnPos.r);
            if (pathBack && pathBack.length > 0) {
                const taskType = pending.taskType;
                startHeroMovement(hero.id, pathBack, hero.returnPos, taskType);
                return;
            }
        }
    }

    // Resource deposit: if hero carrying a payload and tile is towncenter, deposit and send hero back
    if (hero.carryingPayload && hero.carryingPayload.amount > 0 && tile.terrain === 'towncenter' && !pending) {
        depositResource(hero.carryingPayload.type as any, hero.carryingPayload.amount);
        hero.carryingPayload = undefined;
    }

    if (!hero.movement?.taskType) {
        hero.movement = undefined; // clear movement on arrival
        // Trigger deferred chain now if pending and hero back at source tile
        if (pending) {
            hero.movement = undefined;
            attemptDeferredChain(hero, pending);
            hero.pendingChain = undefined;
        }
        return;
    }
    const selected = hero.movement?.taskType;
    if (selected) {
        const existing = getTaskByTile(tile.id, selected);
        if (!existing) {
            startTask(tile, selected, hero);
        } else if (existing.active && !existing.completedTick) {
            joinTask(existing.id, hero);
        }
    }
    // After starting/joining, if pendingChain present AND hero at source, trigger it too
    if (pending && hero.q === tileIndex[pending.sourceTileId]?.q && hero.r === tileIndex[pending.sourceTileId]?.r) {
        hero.movement = undefined; // clear movement on arrival
        attemptDeferredChain(hero, pending);
        hero.pendingChain = undefined;
    }
}

import { tileIndex, ensureTileExists, hexDistance as worldHexDistance } from './world';
import { getTaskDefinition } from './taskRegistry';
import {TERRAIN_DEFS} from "./terrainDefs.ts";

function attemptDeferredChain(hero: Hero, pending: { sourceTileId: string; taskType: string }) {
    const source = tileIndex[pending.sourceTileId];
    if (!source || !source.discovered || !source.terrain) return;
    const def = getTaskDefinition(pending.taskType);

    if (!def?.chainAdjacentSameTerrain) return;

    let canChain = false;
    if (typeof def.chainAdjacentSameTerrain === 'function') {
        canChain = def.chainAdjacentSameTerrain(source, hero);
    } else {
        canChain = true;
    }
    if(!canChain) return;

    // Do not start if hero still busy or carrying
    if (hero.carryingPayload || hero.movement) return;

    const terrain = source.terrain;
    // BFS full cluster of same terrain
    const visited = new Set<string>();
    const cluster: Tile[] = [];
    const queue: Tile[] = [source];
    const MAX_CLUSTER = 800; // safety cap
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

    // Build candidate tiles, requiring canStart and no existing task instance of this type
    const candidates: Tile[] = [];
    for (const ct of cluster) {
        if (getTaskByTile(ct.id, pending.taskType)) continue;
        if (!def.canStart(ct, hero)) continue;
        candidates.push(ct);
    }
    if (!candidates.length) return;

    candidates.sort((a,b) => {
        const da = worldHexDistance(a.q, a.r);
        const db = worldHexDistance(b.q, b.r);
        if (da !== db) return da - db;

        // final tiebreaker: random
        return Math.random() - 0.5;
    });

    const service = new HexMapService();
    for (const targetTile of candidates) {
        const path = service.findWalkablePath(hero.q, hero.r, targetTile.q, targetTile.r);
        if (!path.length) continue;
        worldVersion.value++;
        startHeroMovement(hero.id, path, { q: targetTile.q, r: targetTile.r }, pending.taskType);
        worldVersion.value++;
        break;
    }
}

export function getAvailableTasks(tile: Tile, hero: Hero): TaskDefinition[] {
    let tasks = listTaskDefinitions().filter(def => def.canStart(tile, hero));
    const terrainDef = tile.terrain ? TERRAIN_DEFS[tile.terrain] : null;
    if(tasks.length > 0 && terrainDef?.walkable) {
        tasks.push({
            key: 'walk',
            label: 'Go here',
            canStart: (_tile, _hero) => true,
            requiredXp: (_distance: number) => 0,
            heroRate: (_hero: Hero, _tile: Tile) => 1,
        })
    }

    return tasks;
}
