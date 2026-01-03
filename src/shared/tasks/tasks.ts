import {startTask, joinTask, getTaskByTile, addResourcesToTask, getTaskById} from '../../store/taskStore';
import { depositResource, resourceInventory } from '../../store/resourceStore';
import { tileIndex, ensureTileExists, hexDistance as worldHexDistance } from '../../core/world';
import { getTaskDefinition } from './taskRegistry';
import {TERRAIN_DEFS} from "../../core/terrainDefs";
import {listTaskDefinitions} from "./taskRegistry";

// Import task definitions to register them
import './taskDefinitions';
import type {Tile} from "../../core/types/Tile";
import type {Hero} from "../../core/types/Hero";
import type {TaskDefinition} from "../../core/types/Task";
import {ServerMovementHandler} from "../../../server/src/handlers/movementHandler.ts";
import {broadcast} from "../../../server/src/messages/messageRouter.ts";
import type {ResourceDepositMessage} from "../protocol.ts";

const MAX_CARRY_AMOUNT = 10;

function isFetching(hero: Hero): boolean {
    return !!(hero.carryingPayload && hero.carryingPayload.amount < 0);
}

function tryToFetchFromWarehouse(hero: Hero, tile: Tile) {
    const carrying = hero.carryingPayload;
    if (tile.terrain !== 'towncenter' || !carrying || carrying?.amount > 0) {
        return
    }

    // Pick up resource from warehouse - take what's available (up to needed amount)
    const resourceType = carrying.type;
    const available = resourceInventory[resourceType] || 0;
    const amountToTake = Math.min(Math.abs(carrying.amount), available, MAX_CARRY_AMOUNT);

    if (amountToTake > 0) {
        // Deduct from warehouse inventory
        resourceInventory[resourceType] = (resourceInventory[resourceType] ?? amountToTake) - amountToTake;
        //resourceVersion.value++;

        hero.carryingPayload = { type: resourceType, amount: amountToTake };

        // playPositionalSound('take-' + tile.q + '.' + tile.r, 'take.mp3', tile.q, tile.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }
}

function tryToFetchWater(hero: Hero, tile: Tile) {
    const carrying = hero.carryingPayload;
    if(!carrying || carrying.amount > 0 || carrying.type !== 'water') return;

    // Check if hero is adjacent to the water tile
    const neighbors = tile.neighbors ?? ensureTileExists(tile.q, tile.r).neighbors;
    let isAdjacentToWater = false;

    if (neighbors) {
        for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
            if (neighbors[side]?.terrain === 'water') {
                isAdjacentToWater = true;
                break;
            }
        }
    }

    if (isAdjacentToWater) {
        // Pick up water
        hero.carryingPayload = { type: 'water' as any, amount: 1 };

        // playPositionalSound('splash-' + tile.q + '.' + tile.r, 'splash.mp3', tile.q, tile.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }
}

// Helper invoked when hero arrives at a tile (from heroStore)
export function handleHeroArrival(hero: Hero, tile: Tile) {
    if (!hero || !tile) return;

    const pending = hero.pendingChain; // capture before potential clearing

    // Handle resource fetch: if hero is fetching a resource and arrived at source
    if (isFetching(hero)) {
        const carrying = hero.carryingPayload;
        if (!carrying) return;

        // Hero arrived at resource location to pick it up
        const resourceType = carrying.type;
        if(resourceType === 'water') {
            tryToFetchWater(hero, tile)
        } else {
            tryToFetchFromWarehouse(hero, tile)
        }

        // Now return to task location
        if (hero.carryingPayload && hero.carryingPayload.amount > 0 && hero.returnPos) {
            ServerMovementHandler.getInstance().moveHero(hero, hero.returnPos, hero.movement?.taskType)
            return;
        }
    }

    // Resource deposit: if hero carrying a payload and tile is towncenter, deposit and send hero back
    if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
        if (tile.terrain === 'towncenter') {
            console.log('at towncenter, depositing', hero.carryingPayload);
            depositResource(hero.carryingPayload.type as any, hero.carryingPayload.amount);
            const resourceDepositMessage: ResourceDepositMessage = {
                type: 'resource:deposit',
                heroId: hero.id,
                resource: {
                    type: hero.carryingPayload.type,
                    amount: hero.carryingPayload.amount,
                },
            }
            broadcast(resourceDepositMessage);
            hero.carryingPayload = undefined;
        } else if(hero.currentTaskId) {
            // If not at towncenter but carrying resource for a task, try to deposit to that task if possible
            const task = getTaskById(hero.currentTaskId);
            if (task) {
                addResourcesToTask(task, hero.carryingPayload);
                //playPositionalSound('drop-' + tile.q + '.' + tile.r, 'drop.mp3', tile.q, tile.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
                hero.carryingPayload = undefined;
                joinTask(task.id, hero);
                return;
            }
        }
    }

    if (!hero.movement?.taskType) {
        hero.movement = undefined; // clear movement on arrival
        // Trigger deferred chain now if pending and hero back at source tile
        if (pending) {
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
        } else if (existing.active) {
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

    for (const targetTile of candidates) {
        ServerMovementHandler.getInstance().moveHero(hero, targetTile, pending.taskType);
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
            canStart: (_tile: Tile, _hero: Hero) => true,
            requiredXp: (_distance: number) => 0,
            heroRate: (_hero: Hero, _tile: Tile) => 1,
        })
    }

    return tasks;
}
