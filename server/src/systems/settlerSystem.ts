import type { TickContext } from '../tick';
import { PathService } from '../../../src/shared/game/PathService';
import { canUseWarehouseAtTile, findNearestWarehouseWithCapacity, findNearestWarehouseWithResource } from '../../../src/shared/buildings/storage';
import { HOUSE_VARIANT_KEYS, HUNGER_GRACE_MINUTES, FOOD_PER_SETTLER_PER_MINUTE, getPopulationState, growPopulation, killSettler, setHungerMs } from '../../../src/shared/game/state/populationStore';
import { broadcastSettlersState, settlers } from '../../../src/shared/game/state/settlerStore';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import { resolveJobResources } from './jobSiteRuntime';
import {
    computePathTimings,
    isTileWalkable,
} from '../../../src/shared/game/navigation';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events';
import {
    depositResourceToStorage,
    getStorageResourceAmount,
    resourceInventory,
    withdrawResourceFromStorage,
} from '../../../src/shared/game/state/resourceStore';
import type { ResourceAmount } from '../../../src/shared/game/types/Resource';
import type { Settler, SettlerActivity } from '../../../src/shared/game/types/Settler';
import type { Tile } from '../../../src/shared/game/types/Tile';
import type { ResourceDepositMessage, ResourceWithdrawMessage } from '../../../src/shared/protocol';
import { findNearestTaskAccessTile } from '../../../src/shared/tasks/taskAccess';
import { tileIndex } from '../../../src/shared/game/world';
import { canAssignWorkersToSite, finalizeMineExtraction, listResolvedJobSites } from './jobSiteRuntime';
import { isTileActive } from '../../../src/shared/game/state/settlementSupportStore';

const pathService = new PathService();

const SETTLER_MEAL_INTERVAL_MS = 60_000;
const SETTLER_FOOD_SEEK_MS = 90_000;
const SETTLER_STARVATION_MS = HUNGER_GRACE_MINUTES * 60_000;
const SETTLER_MAX_ACTIVE_MS = 3 * 60_000;
const SETTLER_SLEEP_MS = 45_000;
const POPULATION_GROWTH_INTERVAL_MS = 60_000;
const SETTLER_STEP_BASE_MS = 900;

let nextSettlerId = 1;
let lastGrowthCheckMs = 0;

function seedFromString(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function getHomeFallbackTile(settlementId?: string | null) {
    const townCenters = Object.values(tileIndex)
        .filter((tile): tile is Tile => tile.discovered && tile.terrain === 'towncenter');

    townCenters.sort((a, b) => {
        const aPrimary = a.id === settlementId ? 0 : 1;
        const bPrimary = b.id === settlementId ? 0 : 1;
        if (aPrimary !== bPrimary) {
            return aPrimary - bPrimary;
        }

        return a.id.localeCompare(b.id);
    });

    return townCenters[0] ?? tileIndex['0,0'] ?? null;
}

function createSettler(now: number): Settler {
    const fallback = getHomeFallbackTile();
    const id = `settler-${nextSettlerId++}`;

    return {
        id,
        q: fallback?.q ?? 0,
        r: fallback?.r ?? 0,
        facing: 'down',
        appearanceSeed: seedFromString(id),
        homeTileId: fallback?.id ?? '0,0',
        homeAccessTileId: fallback?.id ?? '0,0',
        settlementId: fallback?.id ?? '0,0',
        assignedWorkTileId: null,
        activity: 'idle',
        stateSinceMs: now,
        hungerMs: 0,
        fatigueMs: 0,
        workProgressMs: 0,
        carryingKind: null,
    };
}

function refreshSettlerIdCounter() {
    let highest = 0;
    for (const settler of settlers) {
        const match = /settler-(\d+)/.exec(settler.id);
        const value = match ? Number.parseInt(match[1] ?? '0', 10) : 0;
        highest = Math.max(highest, Number.isFinite(value) ? value : 0);
    }
    nextSettlerId = highest + 1;
}

function cloneResource(resource: ResourceAmount | null | undefined) {
    return resource ? { ...resource } : null;
}

function setActivity(settler: Settler, activity: SettlerActivity, now: number) {
    if (settler.activity === activity) {
        return false;
    }

    settler.activity = activity;
    settler.stateSinceMs = now;
    if (activity !== 'working') {
        settler.workProgressMs = 0;
    }
    return true;
}

function updateFacing(settler: Settler, from: { q: number; r: number }, to: { q: number; r: number }) {
    const dq = to.q - from.q;
    const dr = to.r - from.r;
    if (dr < 0) {
        settler.facing = 'up';
    } else if (dr > 0) {
        settler.facing = 'down';
    } else if (dq > 0) {
        settler.facing = 'right';
    } else if (dq < 0) {
        settler.facing = 'left';
    }
}

function isMovementComplete(settler: Settler, now: number) {
    const movement = settler.movement;
    if (!movement?.cumulative.length) {
        return true;
    }

    return now >= movement.startMs + movement.cumulative[movement.cumulative.length - 1]!;
}

function startMovement(settler: Settler, target: Tile, activity: SettlerActivity, now: number) {
    if (settler.q === target.q && settler.r === target.r) {
        updateFacing(settler, { q: settler.q, r: settler.r }, target);
        setActivity(settler, activity, now);
        settler.movement = undefined;
        return true;
    }

    const path = pathService.findWalkablePath(settler.q, settler.r, target.q, target.r);
    if (!path.length) {
        return false;
    }

    const origin = { q: settler.q, r: settler.r };
    const timings = computePathTimings(path, origin, 1.15, SETTLER_STEP_BASE_MS);
    updateFacing(settler, origin, path[0] ?? target);
    settler.movement = {
        path: path.slice(),
        origin,
        target: { q: target.q, r: target.r },
        startMs: now,
        stepDurations: timings.durations,
        cumulative: timings.cumulative,
        authoritative: true,
    };
    setActivity(settler, activity, now);
    return true;
}

function removeSettler(settlerId: string) {
    const index = settlers.findIndex((candidate) => candidate.id === settlerId);
    if (index >= 0) {
        settlers.splice(index, 1);
        return true;
    }

    return false;
}

function getAssignedSite(settler: Settler) {
    if (!settler.assignedWorkTileId) {
        return null;
    }

    return listResolvedJobSites().find((site) => site.tile.id === settler.assignedWorkTileId) ?? null;
}

function getHomeAccessTile(settler: Settler) {
    const explicit = tileIndex[settler.homeAccessTileId];
    if (explicit?.discovered && isTileWalkable(explicit)) {
        return explicit;
    }

    return getHomeFallbackTile(settler.settlementId);
}

function getWorkAccessTile(settler: Settler, tile: Tile | null | undefined) {
    if (!tile) {
        return null;
    }

    return findNearestTaskAccessTile(null, tile, settler.q, settler.r)
        ?? (isTileWalkable(tile) ? tile : null);
}

function resolvePrimaryResource(resources: ResourceAmount[]) {
    return resources[0] ? { ...resources[0] } : null;
}

function getSiteInputsOutputs(settler: Settler) {
    const site = getAssignedSite(settler);
    if (!site) {
        return null;
    }

    const resolved = resolveJobResources(site, 1);
    return {
        site,
        input: resolvePrimaryResource(resolved.consumes),
        output: resolvePrimaryResource(resolved.produces),
    };
}

function getStarvationMs(settler: Settler) {
    return Math.max(0, settler.hungerMs - SETTLER_MEAL_INTERVAL_MS);
}

function isHungry(settler: Settler) {
    return settler.hungerMs >= SETTLER_MEAL_INTERVAL_MS;
}

function needsFood(settler: Settler) {
    return settler.hungerMs >= SETTLER_FOOD_SEEK_MS;
}

function needsSleep(settler: Settler) {
    return settler.fatigueMs >= SETTLER_MAX_ACTIVE_MS;
}

function canProduceFood(settler: Settler) {
    const siteInfo = getSiteInputsOutputs(settler);
    if (!siteInfo?.output || siteInfo.output.type !== 'food' || siteInfo.output.amount <= 0) {
        return false;
    }

    if (!siteInfo.input) {
        return true;
    }

    return (resourceInventory[siteInfo.input.type] ?? 0) >= siteInfo.input.amount
        || (settler.carryingKind === 'input'
            && settler.carryingPayload?.type === siteInfo.input.type
            && settler.carryingPayload.amount >= siteInfo.input.amount);
}

function broadcastWithdrawal(settler: Settler, storageTileId: string, resource: ResourceAmount) {
    broadcast({
        type: 'resource:withdraw',
        heroId: settler.id,
        storageTileId,
        resource,
    } satisfies ResourceWithdrawMessage);
}

function broadcastDeposit(settler: Settler, storageTileId: string, resource: ResourceAmount) {
    broadcast({
        type: 'resource:deposit',
        heroId: settler.id,
        storageTileId,
        resource,
    } satisfies ResourceDepositMessage);
}

function tryEatFromStorage(settler: Settler, storageTile: Tile) {
    const mealAmount = Math.max(1, FOOD_PER_SETTLER_PER_MINUTE);
    if ((getStorageResourceAmount(storageTile.id, 'food') ?? 0) < mealAmount) {
        return false;
    }

    const withdrawn = withdrawResourceFromStorage(storageTile.id, 'food', mealAmount);
    if (withdrawn < mealAmount) {
        return false;
    }

    broadcastWithdrawal(settler, storageTile.id, { type: 'food', amount: withdrawn });
    settler.hungerMs = 0;
    return true;
}

function tryWithdrawInput(settler: Settler, storageTile: Tile) {
    const siteInfo = getSiteInputsOutputs(settler);
    const input = siteInfo?.input;
    if (!input) {
        return false;
    }

    if ((getStorageResourceAmount(storageTile.id, input.type) ?? 0) < input.amount) {
        return false;
    }

    const withdrawn = withdrawResourceFromStorage(storageTile.id, input.type, input.amount);
    if (withdrawn < input.amount) {
        return false;
    }

    broadcastWithdrawal(settler, storageTile.id, { type: input.type, amount: withdrawn });
    settler.carryingPayload = { type: input.type, amount: withdrawn };
    settler.carryingKind = 'input';
    return true;
}

function tryDepositOutput(settler: Settler, storageTile: Tile) {
    if (settler.carryingKind !== 'output' || !settler.carryingPayload) {
        return false;
    }

    const previousPayload = { ...settler.carryingPayload };
    const deposited = depositResourceToStorage(
        storageTile.id,
        settler.carryingPayload.type,
        settler.carryingPayload.amount,
    );
    if (deposited <= 0) {
        return false;
    }

    broadcastDeposit(settler, storageTile.id, {
        type: settler.carryingPayload.type,
        amount: deposited,
    });

    emitGameplayEvent({
        type: 'resource:delivered',
        heroId: settler.id,
        resourceType: settler.carryingPayload.type,
        amount: deposited,
    });

    if (deposited >= previousPayload.amount) {
        settler.carryingPayload = undefined;
        settler.carryingKind = null;
    } else {
        settler.carryingPayload = {
            type: previousPayload.type,
            amount: previousPayload.amount - deposited,
        };
    }

    const site = getAssignedSite(settler);
    if (previousPayload.type === 'ore' && site?.building.key === 'mine') {
        finalizeMineExtraction(site, [{ type: 'ore', amount: deposited }]);
    }

    return true;
}

export function syncSettlerPopulation(now: number) {
    refreshSettlerIdCounter();
    const target = Math.max(0, getPopulationState().current);
    const originalLength = settlers.length;

    while (settlers.length < target) {
        settlers.push(createSettler(now));
    }

    while (settlers.length > target) {
        settlers.pop();
    }

    return settlers.length !== originalLength;
}

function buildHomeSlots() {
    const slots: Array<{ key: string; homeTileId: string; accessTileId: string; settlementId: string | null }> = [];

    const houses = Object.values(tileIndex)
        .filter((tile): tile is Tile => {
            return !!tile?.discovered
                && !!tile.variant
                && HOUSE_VARIANT_KEYS.includes(tile.variant as typeof HOUSE_VARIANT_KEYS[number])
                && !!tile.controlledBySettlementId
                && isTileActive(tile);
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const house of houses) {
        const accessTile = findNearestTaskAccessTile(null, house, house.q, house.r);
        if (!accessTile) {
            continue;
        }

        for (let slotIndex = 0; slotIndex < 2; slotIndex++) {
            slots.push({
                key: `${house.id}:${slotIndex}`,
                homeTileId: house.id,
                accessTileId: accessTile.id,
                settlementId: house.ownerSettlementId ?? house.controlledBySettlementId ?? null,
            });
        }
    }

    return slots;
}

function reconcileHomes() {
    const homeSlots = buildHomeSlots();
    const usedSlotKeys = new Set<string>();
    const remaining: Settler[] = [];
    let changed = false;

    for (const settler of settlers) {
        const existingSlot = homeSlots.find((slot) => {
            return !usedSlotKeys.has(slot.key)
                && slot.homeTileId === settler.homeTileId
                && slot.accessTileId === settler.homeAccessTileId;
        });

        if (existingSlot) {
            usedSlotKeys.add(existingSlot.key);
            if (settler.settlementId !== existingSlot.settlementId) {
                settler.settlementId = existingSlot.settlementId;
                changed = true;
            }
            continue;
        }

        remaining.push(settler);
    }

    for (const settler of remaining) {
        const nextSlot = homeSlots.find((slot) => !usedSlotKeys.has(slot.key));
        if (nextSlot) {
            usedSlotKeys.add(nextSlot.key);
            if (settler.homeTileId !== nextSlot.homeTileId) {
                settler.homeTileId = nextSlot.homeTileId;
                changed = true;
            }
            if (settler.homeAccessTileId !== nextSlot.accessTileId) {
                settler.homeAccessTileId = nextSlot.accessTileId;
                changed = true;
            }
            if (settler.settlementId !== nextSlot.settlementId) {
                settler.settlementId = nextSlot.settlementId;
                changed = true;
            }
            continue;
        }

        const fallback = getHomeFallbackTile(settler.settlementId);
        if (!fallback) {
            continue;
        }

        if (settler.homeTileId !== fallback.id) {
            settler.homeTileId = fallback.id;
            changed = true;
        }
        if (settler.homeAccessTileId !== fallback.id) {
            settler.homeAccessTileId = fallback.id;
            changed = true;
        }
        if (settler.settlementId !== fallback.id) {
            settler.settlementId = fallback.id;
            changed = true;
        }
    }

    return changed;
}

function sortSettlersForAssignment(a: Settler, b: Settler, siteTile: Tile) {
    const aSettlement = a.settlementId === siteTile.controlledBySettlementId ? 0 : 1;
    const bSettlement = b.settlementId === siteTile.controlledBySettlementId ? 0 : 1;
    if (aSettlement !== bSettlement) {
        return aSettlement - bSettlement;
    }

    const aOrigin = tileIndex[a.homeAccessTileId] ?? a;
    const bOrigin = tileIndex[b.homeAccessTileId] ?? b;
    const aDistance = pathService.axialDistance(aOrigin.q, aOrigin.r, siteTile.q, siteTile.r);
    const bDistance = pathService.axialDistance(bOrigin.q, bOrigin.r, siteTile.q, siteTile.r);
    if (aDistance !== bDistance) {
        return aDistance - bDistance;
    }

    return a.id.localeCompare(b.id);
}

function reconcileAssignments() {
    const sites = listResolvedJobSites();
    const siteById = new Map(sites.map((site) => [site.tile.id, site]));
    const availableWorkers = Math.max(0, Math.min(getPopulationState().current, settlers.length));
    const eligibleSettlers = settlers
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, availableWorkers);
    const eligibleIds = new Set(eligibleSettlers.map((settler) => settler.id));
    const assignmentCounts = new Map<string, number>();
    let changed = false;

    for (const settler of settlers) {
        if (!eligibleIds.has(settler.id)) {
            if (settler.assignedWorkTileId !== null) {
                settler.assignedWorkTileId = null;
                changed = true;
            }
            continue;
        }

        const site = settler.assignedWorkTileId ? siteById.get(settler.assignedWorkTileId) : null;
        if (!site) {
            if (settler.assignedWorkTileId !== null) {
                settler.assignedWorkTileId = null;
                changed = true;
            }
            continue;
        }

        const nextCount = (assignmentCounts.get(site.tile.id) ?? 0) + 1;
        if (nextCount > site.slots || !canAssignWorkersToSite(site, nextCount)) {
            settler.assignedWorkTileId = null;
            changed = true;
            continue;
        }

        assignmentCounts.set(site.tile.id, nextCount);
    }

    for (const site of sites) {
        let assigned = assignmentCounts.get(site.tile.id) ?? 0;
        while (assigned < site.slots) {
            const candidates = eligibleSettlers
                .filter((settler) => !settler.assignedWorkTileId)
                .sort((a, b) => sortSettlersForAssignment(a, b, site.tile));

            const candidate = candidates[0];
            if (!candidate) {
                break;
            }

            const nextCount = assigned + 1;
            if (!canAssignWorkersToSite(site, nextCount)) {
                break;
            }

            candidate.assignedWorkTileId = site.tile.id;
            changed = true;
            assigned = nextCount;
            assignmentCounts.set(site.tile.id, nextCount);
        }
    }

    return changed;
}

function chooseDeliveryStorage(settler: Settler) {
    if (!settler.carryingPayload) {
        return null;
    }

    const storage = findNearestWarehouseWithCapacity(
        settler.q,
        settler.r,
        settler.carryingPayload.amount,
    );

    return storage ?? findNearestWarehouseWithCapacity(settler.q, settler.r, 1);
}

function handleStorageArrival(settler: Settler, storageTile: Tile, now: number) {
    let changed = false;

    if (settler.carryingKind === 'output') {
        changed = tryDepositOutput(settler, storageTile) || changed;
    } else if (settler.carryingKind === 'input') {
        changed = changed;
    } else {
        changed = tryWithdrawInput(settler, storageTile) || changed;
    }

    if (isHungry(settler)) {
        changed = tryEatFromStorage(settler, storageTile) || changed;
    }

    if (settler.activity === 'fetching_food' && !isHungry(settler)) {
        changed = setActivity(settler, 'idle', now) || changed;
    }

    return changed;
}

function maybeStartSleep(settler: Settler, now: number) {
    const homeTile = getHomeAccessTile(settler);
    if (!homeTile) {
        return false;
    }

    if (settler.q !== homeTile.q || settler.r !== homeTile.r) {
        return startMovement(settler, homeTile, 'commuting_home', now);
    }

    settler.fatigueMs = Math.min(settler.fatigueMs, SETTLER_MAX_ACTIVE_MS);
    return setActivity(settler, 'sleeping', now);
}

function maybeFetchFood(settler: Settler, now: number) {
    const storage = findNearestWarehouseWithResource(settler.q, settler.r, 'food', FOOD_PER_SETTLER_PER_MINUTE);
    if (!storage) {
        return false;
    }

    if (settler.q === storage.q && settler.r === storage.r) {
        return handleStorageArrival(settler, storage, now);
    }

    return startMovement(settler, storage, 'fetching_food', now);
}

function maybeDeliverOutput(settler: Settler, now: number) {
    if (settler.carryingKind !== 'output' || !settler.carryingPayload) {
        return false;
    }

    const storage = chooseDeliveryStorage(settler);
    if (!storage) {
        return setActivity(settler, 'waiting', now);
    }

    if (settler.q === storage.q && settler.r === storage.r) {
        return handleStorageArrival(settler, storage, now);
    }

    return startMovement(settler, storage, 'delivering', now);
}

function maybeFetchInput(settler: Settler, now: number) {
    const siteInfo = getSiteInputsOutputs(settler);
    if (!siteInfo?.input) {
        return false;
    }

    if (
        settler.carryingKind === 'input'
        && settler.carryingPayload?.type === siteInfo.input.type
        && settler.carryingPayload.amount >= siteInfo.input.amount
    ) {
        return false;
    }

    const storage = findNearestWarehouseWithResource(
        settler.q,
        settler.r,
        siteInfo.input.type,
        siteInfo.input.amount,
    );
    if (!storage) {
        return setActivity(settler, 'waiting', now);
    }

    if (settler.q === storage.q && settler.r === storage.r) {
        return handleStorageArrival(settler, storage, now);
    }

    return startMovement(settler, storage, 'fetching_input', now);
}

function completeWorkCycle(settler: Settler, now: number) {
    const siteInfo = getSiteInputsOutputs(settler);
    if (!siteInfo?.output || siteInfo.output.amount <= 0) {
        return setActivity(settler, 'waiting', now);
    }

    settler.workProgressMs = 0;
    settler.carryingPayload = cloneResource(siteInfo.output) ?? undefined;
    settler.carryingKind = settler.carryingPayload ? 'output' : null;

    return maybeDeliverOutput(settler, now) || setActivity(settler, 'delivering', now);
}

function maybeWork(settler: Settler, now: number, dt: number) {
    const siteInfo = getSiteInputsOutputs(settler);
    const workTile = siteInfo?.site.tile ?? null;
    const accessTile = getWorkAccessTile(settler, workTile);

    if (!siteInfo || !accessTile || !workTile || !isTileActive(workTile)) {
        settler.assignedWorkTileId = null;
        return false;
    }

    if (siteInfo.input) {
        const hasInput = settler.carryingKind === 'input'
            && settler.carryingPayload?.type === siteInfo.input.type
            && settler.carryingPayload.amount >= siteInfo.input.amount;

        if (!hasInput) {
            return maybeFetchInput(settler, now);
        }
    }

    if (settler.q !== accessTile.q || settler.r !== accessTile.r) {
        return startMovement(settler, accessTile, 'commuting_work', now);
    }

    setActivity(settler, 'working', now);
    settler.workProgressMs += dt;

    if (settler.workProgressMs < Math.max(1, siteInfo.site.building.cycleMs ?? SETTLER_MEAL_INTERVAL_MS)) {
        return true;
    }

    if (settler.carryingKind === 'input') {
        settler.carryingPayload = undefined;
        settler.carryingKind = null;
    }

    return completeWorkCycle(settler, now);
}

function maybeIdleAtHome(settler: Settler, now: number) {
    const homeTile = getHomeAccessTile(settler);
    if (!homeTile) {
        return false;
    }

    if (settler.q !== homeTile.q || settler.r !== homeTile.r) {
        return startMovement(settler, homeTile, 'commuting_home', now);
    }

    return setActivity(settler, 'idle', now);
}

function handleArrival(settler: Settler, now: number) {
    const tile = tileIndex[`${settler.q},${settler.r}`] ?? null;
    if (!tile) {
        return false;
    }

    if (canUseWarehouseAtTile(tile)) {
        return handleStorageArrival(settler, tile, now);
    }

    if (tile.id === settler.homeAccessTileId) {
        if (needsSleep(settler)) {
            return setActivity(settler, 'sleeping', now);
        }

        return setActivity(settler, 'idle', now);
    }

    if (tile.id === settler.assignedWorkTileId) {
        return setActivity(settler, 'working', now);
    }

    return false;
}

function planSettler(settler: Settler, now: number, dt: number) {
    if (settler.carryingKind === 'output' && maybeDeliverOutput(settler, now)) {
        return true;
    }

    const hungry = needsFood(settler);
    const starving = getStarvationMs(settler) > 0;
    const storedFood = (resourceInventory.food ?? 0) >= FOOD_PER_SETTLER_PER_MINUTE;

    if (hungry && storedFood && maybeFetchFood(settler, now)) {
        return true;
    }

    if (needsSleep(settler) && maybeStartSleep(settler, now)) {
        return true;
    }

    if (hungry && !storedFood && starving && !canProduceFood(settler)) {
        return maybeIdleAtHome(settler, now);
    }

    if (maybeWork(settler, now, dt)) {
        return true;
    }

    return maybeIdleAtHome(settler, now);
}

function applyNeeds(settler: Settler, dt: number) {
    settler.hungerMs += dt;

    if (settler.activity === 'sleeping') {
        return;
    }

    settler.fatigueMs += dt;
}

function updateSleeping(settler: Settler, now: number) {
    if (settler.activity !== 'sleeping') {
        return false;
    }

    if (now - settler.stateSinceMs < SETTLER_SLEEP_MS) {
        return true;
    }

    settler.fatigueMs = 0;
    setActivity(settler, 'idle', now);
    return false;
}

function updateMovement(settler: Settler, now: number) {
    if (!settler.movement || !isMovementComplete(settler, now)) {
        return false;
    }

    settler.q = settler.movement.target.q;
    settler.r = settler.movement.target.r;
    settler.movement = undefined;
    return handleArrival(settler, now) || true;
}

function computeColonyHungerMs() {
    return settlers.reduce((worst, settler) => {
        return Math.max(worst, getStarvationMs(settler));
    }, 0);
}

function tryGrowPopulation(now: number) {
    const population = getPopulationState();
    if (population.current >= population.max || population.current >= population.beds) {
        return false;
    }

    if (now - lastGrowthCheckMs < POPULATION_GROWTH_INTERVAL_MS) {
        return false;
    }

    lastGrowthCheckMs = now;

    const currentFood = resourceInventory.food ?? 0;
    const foodNeededNow = population.current * FOOD_PER_SETTLER_PER_MINUTE;
    const foodNeededNext = (population.current + 1) * FOOD_PER_SETTLER_PER_MINUTE;
    if (currentFood < foodNeededNow + foodNeededNext) {
        return false;
    }

    return growPopulation();
}

export const settlerSystem = {
    name: 'settlers',

    init: () => {
        refreshSettlerIdCounter();
        lastGrowthCheckMs = Date.now();
    },

    tick: (ctx: TickContext) => {
        refreshSettlerIdCounter();
        let changed = false;

        changed = tryGrowPopulation(ctx.now) || changed;
        changed = syncSettlerPopulation(ctx.now) || changed;
        changed = reconcileHomes() || changed;
        changed = reconcileAssignments() || changed;

        const settlersToKill: string[] = [];

        for (const settler of settlers) {
            applyNeeds(settler, ctx.dt);
            changed = updateMovement(settler, ctx.now) || changed;

            if (getStarvationMs(settler) >= SETTLER_STARVATION_MS) {
                settlersToKill.push(settler.id);
                continue;
            }

            if (settler.movement) {
                continue;
            }

            if (updateSleeping(settler, ctx.now)) {
                continue;
            }

            changed = planSettler(settler, ctx.now, ctx.dt) || changed;
        }

        for (const settlerId of settlersToKill) {
            if (removeSettler(settlerId)) {
                changed = true;
                killSettler();
            }
        }

        changed = syncSettlerPopulation(ctx.now) || changed;

        const nextHunger = computeColonyHungerMs();
        if (getPopulationState().hungerMs !== nextHunger) {
            setHungerMs(nextHunger);
            changed = true;
        }

        if (changed) {
            broadcastSettlersState(ctx.now);
        }
    },
};
