import {
    startTask,
    joinTask,
    getTaskByTile,
    addResourcesToTask,
    getTaskById,
    getTasksAtTile,
    resumeWaitingTasksForResource,
    canStartTaskWhileCarrying,
} from '../../store/taskStore';
import { depositResourceToStorage, swapResourceAtStorage, withdrawResourceFromStorage } from '../../store/resourceStore';
import { tileIndex } from '../../core/world';
import { getTaskDefinition } from './taskRegistry';
import {listTaskDefinitions} from "./taskRegistry";

// Import task definitions to register them
import './taskDefinitions';
import type {Tile} from "../../core/types/Tile";
import type {Hero} from "../../core/types/Hero";
import type {TaskDefinition} from "../../core/types/Task";
import type {ResourceDepositMessage} from "../protocol.ts";
import type {ResourceWithdrawMessage} from "../protocol.ts";
import { broadcastGameMessage as broadcast, moveHeroWithRuntime } from '../game/runtime';
import { clearHeroPayload, setHeroPayload } from '../game/heroPayload';
import { collectTerrainCluster } from '../game/terrainCluster';
import { isTileWalkable } from '../game/navigation';
import { emitGameplayEvent } from '../gameplay/events';
import { canDrawWaterFromTile } from '../buildings/water';
import { canUseWarehouseAtTile, findNearestWarehouseWithCapacity, findNearestWarehouseWithResource } from '../buildings/storage';
import { getBuildingDefinitionByTaskKey } from '../buildings/registry';
import { getDistanceToNearestTowncenter } from '../game/worldQueries';
import { isStoryTaskUnlocked } from '../story/progressionState.ts';
import { findNearestTaskAccessTile, isHeroAtTaskAccess, taskUsesAdjacentAccess } from './taskAccess';

const MAX_CARRY_AMOUNT = 10;

function isFetching(hero: Hero): boolean {
    return !!(hero.carryingPayload && hero.carryingPayload.amount < 0);
}

function tryToFetchFromWarehouse(hero: Hero, tile: Tile) {
    const carrying = hero.carryingPayload;
    if (!canUseWarehouseAtTile(tile) || !carrying || carrying?.amount > 0) {
        return 0;
    }

    const resourceType = carrying.type;
    const amountToTake = withdrawResourceFromStorage(
        tile.id,
        resourceType,
        Math.min(Math.abs(carrying.amount), MAX_CARRY_AMOUNT),
    );

    if (amountToTake > 0) {
        const withdrawMsg: ResourceWithdrawMessage = {
            type: 'resource:withdraw',
            heroId: hero.id,
            storageTileId: tile.id,
            resource: { type: resourceType as any, amount: amountToTake },
        } as any;
        broadcast(withdrawMsg);

        setHeroPayload(hero, { type: resourceType, amount: amountToTake });

        // playPositionalSound('take-' + tile.q + '.' + tile.r, 'take.mp3', tile.q, tile.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }

    return amountToTake;
}

function tryToFetchWater(hero: Hero, tile: Tile) {
    const carrying = hero.carryingPayload;
    if(!carrying || carrying.amount > 0 || carrying.type !== 'water') return;

    if (canDrawWaterFromTile(tile)) {
        // Pick up water
        setHeroPayload(hero, { type: 'water', amount: 1 });

        // playPositionalSound('splash-' + tile.q + '.' + tile.r, 'splash.mp3', tile.q, tile.r, { baseVolume: 0.5, maxDistance: 10, loop: false } );
    }
}

function tryDepositPayloadIntoTask(hero: Hero, task: ReturnType<typeof getTaskById> | undefined) {
    if (!task || !hero.carryingPayload || hero.carryingPayload.amount <= 0) {
        return false;
    }

    const consumed = addResourcesToTask(task, hero.carryingPayload);
    if (consumed <= 0) {
        return false;
    }

    hero.carryingPayload.amount -= consumed;
    if (hero.carryingPayload.amount <= 0) {
        clearHeroPayload(hero);
    } else {
        setHeroPayload(hero, hero.carryingPayload);
    }

    joinTask(task.id, hero);
    return true;
}

// Helper invoked when hero arrives at a tile (from heroStore)
export function handleHeroArrival(hero: Hero, tile: Tile) {
    if (!hero || !tile) return;

    const pending = hero.pendingChain; // capture before potential clearing
    const arrivalTask = hero.pendingTask;
    const pendingTaskTile = arrivalTask ? tileIndex[arrivalTask.tileId] : undefined;
    const isAtPendingTaskAccess = !!arrivalTask
        && !!pendingTaskTile
        && isHeroAtTaskAccess(hero, arrivalTask.taskType, pendingTaskTile);

    // Handle resource fetch: if hero is fetching a resource and arrived at source
    if (isFetching(hero)) {
        const carrying = hero.carryingPayload;
        if (!carrying) return;

        // Hero arrived at resource location to pick it up
        const resourceType = carrying.type;
        if(resourceType === 'water') {
            tryToFetchWater(hero, tile)
        } else {
            const fetchedAmount = tryToFetchFromWarehouse(hero, tile);
            if (fetchedAmount <= 0) {
                const fallbackWarehouse = findNearestWarehouseWithResource(tile.q, tile.r, resourceType, Math.abs(carrying.amount), [tile.id]);
                if (fallbackWarehouse) {
                    moveHeroWithRuntime(hero, fallbackWarehouse);
                    return;
                }
            }
        }

        // Now return to task location
        if (hero.carryingPayload && hero.carryingPayload.amount > 0 && hero.returnPos) {
            moveHeroWithRuntime(
                hero,
                hero.returnPos,
                arrivalTask?.taskType,
                pendingTaskTile ? { q: pendingTaskTile.q, r: pendingTaskTile.r } : undefined,
            );
            return;
        }
    }

    // Resource deposit: if hero carrying a payload and tile is a warehouse node, deposit and send hero back
    if (hero.carryingPayload && hero.carryingPayload.amount > 0) {
        const pendingTaskInstance = arrivalTask && pendingTaskTile
            ? getTaskByTile(pendingTaskTile.id, arrivalTask.taskType)
            : undefined;

        if (tryDepositPayloadIntoTask(hero, hero.currentTaskId ? getTaskById(hero.currentTaskId) : undefined)) {
            return;
        }

        if (isAtPendingTaskAccess && tryDepositPayloadIntoTask(hero, pendingTaskInstance)) {
            return;
        }

        if (canUseWarehouseAtTile(tile)) {
            const carriedType = hero.carryingPayload.type;
            const carriedAmount = hero.carryingPayload.amount;
            const depositedAmount = depositResourceToStorage(tile.id, carriedType as any, carriedAmount);

            if (depositedAmount > 0) {
                const resourceDepositMessage: ResourceDepositMessage = {
                    type: 'resource:deposit',
                    heroId: hero.id,
                    storageTileId: tile.id,
                    resource: {
                        type: carriedType,
                        amount: depositedAmount,
                    },
                }
                broadcast(resourceDepositMessage);
                emitGameplayEvent({
                    type: 'resource:delivered',
                    heroId: hero.id,
                    resourceType: carriedType,
                    amount: depositedAmount,
                });
            }

            const remainingAmount = carriedAmount - depositedAmount;
            if (remainingAmount <= 0) {
                clearHeroPayload(hero);
                hero.movement = undefined;
                if (!arrivalTask && pending) {
                    attemptDeferredChain(hero, pending);
                    hero.pendingChain = undefined;
                }
                if (depositedAmount > 0) {
                    resumeWaitingTasksForResource(carriedType, tile.id);
                }
                return;
            }

            setHeroPayload(hero, {
                type: carriedType,
                amount: remainingAmount,
            });

            const nextWarehouse = findNearestWarehouseWithCapacity(tile.q, tile.r, remainingAmount, [tile.id]);
            if (nextWarehouse) {
                moveHeroWithRuntime(hero, nextWarehouse);
            } else {
                // All warehouses full - try swapping: deposit our resource and pick up
                // a different type so the hero isn't permanently stuck holding one type.
                const swap = swapResourceAtStorage(tile.id, carriedType, remainingAmount);
                if (swap.deposited > 0 && swap.withdrawn) {
                    broadcast({
                        type: 'resource:deposit',
                        heroId: hero.id,
                        storageTileId: tile.id,
                        resource: { type: carriedType, amount: swap.deposited },
                    } as ResourceDepositMessage);
                    broadcast({
                        type: 'resource:withdraw',
                        heroId: hero.id,
                        storageTileId: tile.id,
                        resource: swap.withdrawn,
                    } as ResourceWithdrawMessage);
                    setHeroPayload(hero, swap.withdrawn);
                }
            }
            if (depositedAmount > 0) {
                resumeWaitingTasksForResource(carriedType, tile.id);
            }
            return;
        } else {
            // Lets check if there is a task on this tile that can accept resources
            const tasksHere = getTasksAtTile(tile.id);

            for (const task of tasksHere) {
                const consumed = addResourcesToTask(task, hero.carryingPayload);
                if (consumed > 0) {
                    hero.carryingPayload!.amount -= consumed;
                    if (hero.carryingPayload!.amount <= 0) {
                        clearHeroPayload(hero);
                        // Join the task to trigger activation or fetching of other needed resources
                        joinTask(task.id, hero);
                        return;
                    } else {
                        setHeroPayload(hero, hero.carryingPayload);
                        // Join task and let server decide next steps (continue fetching other resources or start)
                        joinTask(task.id, hero);
                        return;
                    }
                }
            }

        }
    }

    if (!isAtPendingTaskAccess) {
        hero.movement = undefined; // clear movement on arrival
        // Trigger deferred chain for non-task arrivals such as reward delivery.
        if (!arrivalTask && pending) {
            attemptDeferredChain(hero, pending);
            hero.pendingChain = undefined;
        }
        return;
    }

    const selected = arrivalTask?.taskType;
    hero.pendingTask = undefined;
    if (selected) {
        const taskTile = pendingTaskTile ?? tile;
        const existing = getTaskByTile(taskTile.id, selected);
        if (!existing) {
            startTask(taskTile, selected, hero);
        } else {
            joinTask(existing.id, hero);
        }
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

    const cluster = collectTerrainCluster(source, 800);

    // Build candidate tiles, requiring canStart and no existing task instance of this type
    const candidates: Tile[] = [];
    for (const ct of cluster) {
        if (getTaskByTile(ct.id, pending.taskType)) continue;
        if (!def.canStart(ct, hero)) continue;
        candidates.push(ct);
    }
    if (!candidates.length) return;

    candidates.sort((a,b) => {
        const da = getDistanceToNearestTowncenter(a.q, a.r);
        const db = getDistanceToNearestTowncenter(b.q, b.r);
        if (da !== db) return da - db;
        if (a.q !== b.q) return a.q - b.q;
        return a.r - b.r;
    });

    for (const targetTile of candidates) {
        const accessTile = findNearestTaskAccessTile(pending.taskType, targetTile, hero.q, hero.r) ?? targetTile;
        moveHeroWithRuntime(
            hero,
            accessTile,
            pending.taskType,
            taskUsesAdjacentAccess(pending.taskType) ? { q: targetTile.q, r: targetTile.r } : undefined,
        );
        break;
    }
}

export function getAvailableTasks(tile: Tile, hero: Hero): TaskDefinition[] {
    let tasks = listTaskDefinitions().filter(def =>
        (def.key === 'restoreTile' || isStoryTaskUnlocked(def.key))
        && def.canStart(tile, hero)
        && canStartTaskWhileCarrying(hero, def, tile)
    );
    if(tasks.length > 0 && isTileWalkable(tile)) {
        tasks.push({
            key: 'walk',
            label: 'Go here',
            canStart: (_tile: Tile, _hero: Hero) => true,
            requiredXp: (_distance: number) => 0,
            heroRate: (_hero: Hero, _tile: Tile) => 1,
        })
    }

    tasks = tasks.sort((a, b) => {
        if (a.key === 'walk') return 1;
        if (b.key === 'walk') return -1;

        const aBuilding = getBuildingDefinitionByTaskKey(a.key);
        const bBuilding = getBuildingDefinitionByTaskKey(b.key);

        if (aBuilding && bBuilding) {
            return aBuilding.sortOrder - bBuilding.sortOrder || a.label.localeCompare(b.label);
        }

        if (aBuilding) return -1;
        if (bBuilding) return 1;

        return a.label.localeCompare(b.label);
    });

    return tasks;
}
