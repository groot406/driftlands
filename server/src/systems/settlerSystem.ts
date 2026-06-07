import type { TickContext } from '../tick';
import { PathService, type PathCoord } from '../../../src/shared/game/PathService';
import {
    canUseWarehouseAtTile,
    listUsableWarehousesWithCapacityForResource,
    listUsableWarehousesWithResource,
} from '../../../src/shared/buildings/storage';
import { HOUSE_VARIANT_KEYS, HUNGER_GRACE_MINUTES, FOOD_PER_SETTLER_PER_MINUTE, broadcastPopulationState, getPopulationState, growPopulation, killSettler, setHungerMs, setSettlementHungerMs } from '../../../src/shared/game/state/populationStore';
import { broadcastSettlersState, settlers } from '../../../src/shared/game/state/settlerStore';
import { broadcastGameMessage as broadcast } from '../../../src/shared/game/runtime';
import { resolveJobResources } from './jobSiteRuntime';
import {
    computePathTimings,
    isEdgeBlocked,
    isTileWalkable,
} from '../../../src/shared/game/navigation';
import { SETTLER_MOVEMENT_SPEED_ADJ } from '../../../src/shared/game/movementBalance';
import {
    getSettlerDrinkHappinessGain,
    getSettlerDrinkPriority,
    getSettlerHappinessDecayMultiplier,
    getSettlerHungerRateMultiplier,
    getSettlerShopThreshold,
    getSettlerSleepDurationMultiplier,
    getSettlerSleepThresholdMultiplier,
    getSettlerSocialThreshold,
    getSettlerTradeGoodHappinessGain,
    getSettlerWorkFatigueMultiplier,
    hasSettlerTrait,
    normalizeDrinkPreference,
    normalizeSettlerTraits,
} from '../../../src/shared/game/settlerPreferences.ts';
import { normalizeSettlerGender } from '../../../src/shared/game/settlerNames.ts';
import { emitGameplayEvent } from '../../../src/shared/gameplay/events';
import {
    depositResourceToStorage,
    getEffectiveResourceInventory,
    getSettlementResourceInventory,
    getStorageResourceAmount,
    planResourceWithdrawalsAcrossStoragesForSettlement,
    resourceInventory,
    withdrawResourceAcrossStoragesForSettlement,
    withdrawResourceFromStorage,
} from '../../../src/shared/game/state/resourceStore';
import { resumeWaitingTasksForResource } from '../../../src/shared/game/state/taskStore';
import type { ResourceAmount, ResourceType } from '../../../src/shared/game/types/Resource';
import type { Settler, SettlerActivity, SettlerBlockerReason } from '../../../src/shared/game/types/Settler';
import type { Tile, TileSide } from '../../../src/shared/game/types/Tile';
import type { ResourceDepositMessage, ResourceWithdrawMessage, TileUpdatedMessage } from '../../../src/shared/protocol';
import type { PopulationIncidentMessage } from '../../../src/shared/protocol';
import { findNearestTaskAccessTile, listTaskAccessTiles } from '../../../src/shared/tasks/taskAccess';
import { getWorldRenderVersion, tileIndex } from '../../../src/shared/game/world';
import { canAssignWorkersToSite, compareResolvedSites, finalizeMineExtraction, getJobSiteSettlementId, isVirtualJobInput, listResolvedJobSites, type ResolvedJobSite } from './jobSiteRuntime';
import { addStudyProgress, broadcastStudyState, hasActiveStudy } from '../../../src/store/studyStore';
import { consumeTileProductionBoost } from '../../../src/shared/game/tileFeatures';
import {
    isTileActive,
    isTileControlled,
    isTileControlledBySettlement,
} from '../../../src/shared/game/state/settlementSupportStore';
import {
    getRepairNeededAmount,
    getTileJobPresentation,
    getTileRepairResources,
    isBuildingOfflineFromCondition,
    listRepairTargets,
    REPAIR_CYCLE_MS,
    REPAIR_RESTORE_AMOUNT,
    updateTileCondition,
} from '../../../src/shared/buildings/maintenance';
import { getHouseComfortHappinessForTile, getHouseGoodCapacityForTile } from '../../../src/shared/buildings/state.ts';
import { playerSettlementState } from '../state/playerSettlementState';
import {
    getPopulationGrowthMultiplier,
    getSettlerCycleSpeedMultiplier,
    isHungerBypassEnabled,
    isMoraleBypassEnabled,
    isUnlimitedResourcesEnabled,
    testModeSettings,
} from '../../../src/shared/game/testMode.ts';
import { RAIDER_COMBAT_HEALTH_MAX, canSettlementUseOpenBorderTransit, isRaidableMilitaryTarget, isWatchtowerTile } from '../../../src/shared/game/military.ts';
import { HUNGER_FOOD_TYPES, TRADE_GOOD_TYPES, getHungerFoodMealValue, getResourceHungerRelief, getTradeGoodHappinessGain, isHungerFoodResource } from '../../../src/shared/game/resourceDefinitions.ts';

const pathService = new PathService();

const SETTLER_MEAL_INTERVAL_MS = 60_000;
const SETTLER_FOOD_SEEK_MS = 90_000;
const SETTLER_STARVATION_MS = HUNGER_GRACE_MINUTES * 60_000;
const SETTLER_STARVATION_DEATH_INTERVAL_MS = SETTLER_MEAL_INTERVAL_MS;
const SETTLER_MAX_ACTIVE_MS = 3 * 60_000;
const SETTLER_SLEEP_MS = 45_000;
const POPULATION_GROWTH_INTERVAL_MS = 60_000;
const SETTLER_STEP_BASE_MS = 900;
const SETTLER_HAPPINESS_DECAY_MS = 10_000;
const SETTLER_SOCIAL_VISIT_MS = 20_000;
const SETTLER_SHOP_VISIT_MS = 16_000;
const HOUSE_GOOD_CONSUME_INTERVAL_MS = 3 * 60_000;
const SETTLER_MAX_HAPPINESS = 100;
const SETTLER_BROADCAST_MIN_INTERVAL_MS = 250;
const POPULATION_BROADCAST_MIN_INTERVAL_MS = 250;
const SETTLER_ROUTE_CACHE_MAX_ENTRIES = 16;
const SHARED_SETTLER_ROUTE_CACHE_MAX_ENTRIES = 2048;
const SHARED_SETTLER_REACHABILITY_FAILURE_CACHE_MAX_ENTRIES = 2048;
const SETTLER_REACHABILITY_FAILURE_RETRY_MS = 10_000;
const SETTLER_PLANNING_MIN_INTERVAL_MS = 750;
const SETTLER_PLANNING_STAGGER_WINDOW_MS = 250;
const SETTLER_BLOCKED_PLANNING_MIN_INTERVAL_MS = 5_000;
const SETTLER_ROUTE_SIDES: Array<{ dq: number; dr: number; side: TileSide }> = [
    { dq: 0, dr: -1, side: 'a' },
    { dq: 1, dr: -1, side: 'b' },
    { dq: 1, dr: 0, side: 'c' },
    { dq: 0, dr: 1, side: 'd' },
    { dq: -1, dr: 1, side: 'e' },
    { dq: -1, dr: 0, side: 'f' },
];
const SOCIAL_DRINKS = [
    { type: 'wine', happiness: 30 },
    { type: 'beer', happiness: 20 },
] as const;

let nextSettlerId = 1;
let lastGrowthCheckMsPerSettlement: Record<string, number> = {};
let lastStarvationLossMsBySettlement = new Map<string, number>();
let lastSettlerBroadcastMs = Number.NEGATIVE_INFINITY;
let settlerBroadcastPending = false;
let lastPopulationBroadcastMs = Number.NEGATIVE_INFINITY;
let populationBroadcastPending = false;

interface SettlerRouteCacheEntry {
    startQ: number;
    startR: number;
    targetId: string;
    targetQ: number;
    targetR: number;
    settlementId: string | null;
    worldVersion: number;
    path: PathCoord[];
}

interface SettlerReachabilityFailureCacheEntry {
    startQ: number;
    startR: number;
    targetId: string;
    targetQ: number;
    targetR: number;
    settlementId: string | null;
    worldVersion: number;
    retryAtMs: number;
}

interface SettlerRouteIdentity {
    startQ: number;
    startR: number;
    targetId: string;
    targetQ: number;
    targetR: number;
    settlementId: string | null;
    worldVersion: number;
}

interface SettlerComponentCacheEntry {
    worldVersion: number;
    settlementId: string | null;
    componentByTileId: Map<string, number>;
}

interface SettlerPlanningCacheEntry {
    accumulatedDt: number;
    nextPlanAtMs: number;
}

interface StarvationCandidate {
    id: string;
    settlementId: string | null;
    starvationMs: number;
    canProduceFood: boolean;
}

const settlerRouteCache = new Map<string, SettlerRouteCacheEntry[]>();
const settlerReachabilityFailureCache = new Map<string, SettlerReachabilityFailureCacheEntry>();
const settlerPlanningCache = new Map<string, SettlerPlanningCacheEntry>();
const sharedSettlerRouteCache = new Map<string, SettlerRouteCacheEntry>();
const sharedSettlerReachabilityFailureCache = new Map<string, SettlerReachabilityFailureCacheEntry>();
const settlerComponentCache = new Map<string, SettlerComponentCacheEntry>();
let currentSettlerTickNow = 0;

function getEffectivePopulationGrowthIntervalMs() {
    return Math.max(1, Math.round(POPULATION_GROWTH_INTERVAL_MS / getPopulationGrowthMultiplier(testModeSettings)));
}

function getEffectiveSettlerCycleProgress(dt: number) {
    return dt * getSettlerCycleSpeedMultiplier(testModeSettings);
}

function getEffectiveSettlerHappinessProgress(dt: number) {
    return dt * getSettlerCycleSpeedMultiplier(testModeSettings);
}

function getEffectiveSettlerCycleIntervalMs(intervalMs: number) {
    return Math.max(1, Math.round(intervalMs / getSettlerCycleSpeedMultiplier(testModeSettings)));
}

function resetSettlerBroadcastThrottle() {
    lastSettlerBroadcastMs = Number.NEGATIVE_INFINITY;
    settlerBroadcastPending = false;
}

function resetPopulationBroadcastThrottle() {
    lastPopulationBroadcastMs = Number.NEGATIVE_INFINITY;
    populationBroadcastPending = false;
}

function queueSettlerBroadcast(now: number) {
    settlerBroadcastPending = true;
    if (now - lastSettlerBroadcastMs < SETTLER_BROADCAST_MIN_INTERVAL_MS) {
        return false;
    }

    broadcastSettlersState(now);
    lastSettlerBroadcastMs = now;
    settlerBroadcastPending = false;
    return true;
}

function queuePopulationBroadcast(now: number) {
    populationBroadcastPending = true;
    if (now - lastPopulationBroadcastMs < POPULATION_BROADCAST_MIN_INTERVAL_MS) {
        return false;
    }

    broadcastPopulationState();
    lastPopulationBroadcastMs = now;
    populationBroadcastPending = false;
    return true;
}

function seedFromString(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function createSettlerNameSeed(id: string, now: number) {
    return seedFromString(`${id}:${now}:${Math.random()}`);
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

function createSettler(now: number, settlementId?: string | null): Settler {
    const fallback = getHomeFallbackTile(settlementId);
    const id = `settler-${nextSettlerId++}`;
    const fallbackSettlementId = settlementId ?? fallback?.id ?? '0,0';
    const baseSettler = {
        id,
        nameSeed: createSettlerNameSeed(id, now),
        appearanceSeed: seedFromString(id),
    };

    return {
        id,
        nameSeed: baseSettler.nameSeed,
        gender: normalizeSettlerGender(baseSettler),
        q: fallback?.q ?? 0,
        r: fallback?.r ?? 0,
        facing: 'down',
        appearanceSeed: baseSettler.appearanceSeed,
        homeTileId: fallback?.id ?? '0,0',
        homeAccessTileId: fallback?.id ?? '0,0',
        settlementId: fallbackSettlementId,
        assignedWorkTileId: null,
        assignedRole: null,
        workTileId: null,
        hiddenWhileWorking: null,
        activity: 'idle',
        stateSinceMs: now,
        hungerMs: 0,
        fatigueMs: 0,
        happiness: SETTLER_MAX_HAPPINESS,
        traits: normalizeSettlerTraits(baseSettler),
        drinkPreference: normalizeDrinkPreference(baseSettler),
        workProgressMs: 0,
        carryingKind: null,
        socialTileId: null,
    };
}

function isGuardSettler(settler: Settler) {
    return settler.assignedRole === 'guard' && !!settler.guardTowerTileId;
}

function isRaidSettler(settler: Settler) {
    if (!isGuardSettler(settler)) {
        return false;
    }

    const tower = getGuardTower(settler);
    return !!tower && !!settler.settlementId && tower.ownerSettlementId !== settler.settlementId;
}

function isGuardTowerUnderAttack(settler: Settler) {
    const tower = getGuardTower(settler);
    return !!tower?.towerAttackerSettlementId;
}

function getGuardTower(settler: Settler) {
    return settler.guardTowerTileId ? tileIndex[settler.guardTowerTileId] ?? null : null;
}

function getGuardTowerAccessTile(
    settlementId: string | null | undefined,
    tower: Tile | null | undefined,
    allowForeignAccess: boolean = false,
) {
    if (!tower) {
        return null;
    }

    const candidates = listTaskAccessTiles(null, tower, allowForeignAccess ? null : settlementId)
        .filter((candidate) => candidate.discovered && isTileWalkable(candidate))
        .sort((a, b) => a.id.localeCompare(b.id));
    const nonHomeCandidates = candidates.filter((candidate) => candidate.id !== settlementId);
    if (nonHomeCandidates[0]) {
        return nonHomeCandidates[0];
    }
    if (candidates[0]) {
        return candidates[0];
    }

    const fallback = getHomeFallbackTile(settlementId);
    return findNearestTaskAccessTile(null, tower, fallback?.q ?? tower.q, fallback?.r ?? tower.r, settlementId)
        ?? (isTileWalkable(tower) ? tower : null);
}

function listAdjacentWalkableTiles(tile: Tile | null | undefined) {
    if (!tile) {
        return [];
    }

    return SETTLER_ROUTE_SIDES
        .map(({ dq, dr }) => tileIndex[`${tile.q + dq},${tile.r + dr}`] ?? null)
        .filter((candidate): candidate is Tile => !!candidate?.discovered && isTileWalkable(candidate))
        .sort((a, b) => a.id.localeCompare(b.id));
}

function getGuardRaidAccessTiles(
    settlementId: string | null | undefined,
    target: Tile | null | undefined,
) {
    const adjacentTiles = listAdjacentWalkableTiles(target);
    if (adjacentTiles.length > 0) {
        return adjacentTiles;
    }

    const fallback = getGuardTowerAccessTile(settlementId, target, true);
    return fallback ? [fallback] : [];
}

function canReachGuardAccessTile(homeTile: Tile | null | undefined, accessTile: Tile | null | undefined) {
    if (!homeTile || !accessTile) {
        return false;
    }

    if (homeTile.q === accessTile.q && homeTile.r === accessTile.r) {
        return true;
    }

    return pathService.findWalkablePath(homeTile.q, homeTile.r, accessTile.q, accessTile.r, {
        telemetrySource: 'settler_guard_reachability',
    }).length > 0;
}

function ensureRaiderCombatHealth(raider: Settler) {
    raider.combatHealthMax = Math.max(1, raider.combatHealthMax ?? RAIDER_COMBAT_HEALTH_MAX);
    raider.combatHealth = Math.max(0, Math.min(raider.combatHealthMax, raider.combatHealth ?? raider.combatHealthMax));
}

function createGuardSettler(now: number, settlementId: string, tower: Tile, accessTile: Tile, originTile?: Tile | null): Settler {
    const guard = createSettler(now, settlementId);
    const homeTile = originTile?.discovered && isTileWalkable(originTile) ? originTile : getHomeFallbackTile(settlementId);
    guard.q = homeTile?.q ?? guard.q;
    guard.r = homeTile?.r ?? guard.r;
    guard.homeTileId = homeTile?.id ?? settlementId;
    guard.homeAccessTileId = homeTile?.id ?? settlementId;
    guard.settlementId = settlementId;
    guard.assignedRole = 'guard';
    guard.guardTowerTileId = tower.id;
    guard.assignedWorkTileId = accessTile.id;
    guard.workTileId = tower.id;
    guard.hiddenWhileWorking = false;
    if (tower.ownerSettlementId !== settlementId) {
        guard.combatHealthMax = RAIDER_COMBAT_HEALTH_MAX;
        guard.combatHealth = RAIDER_COMBAT_HEALTH_MAX;
    }
    return guard;
}

function getSettlerPathSettlementId(settler: Settler) {
    return isRaidSettler(settler) ? null : settler.settlementId;
}

function broadcastTileUpdate(tile: Tile | null | undefined) {
    if (!tile) {
        return;
    }

    broadcast({ type: 'tile:updated', tile } as TileUpdatedMessage);
}

function ensureSettlerNameSeeds(now: number) {
    let changed = false;
    for (const settler of settlers) {
        if (typeof settler.nameSeed !== 'number') {
            settler.nameSeed = createSettlerNameSeed(settler.id, now);
            changed = true;
        }
    }

    return changed;
}

function ensureSettlerProfiles() {
    let changed = false;
    for (const settler of settlers) {
        const nextGender = normalizeSettlerGender(settler);
        const nextTraits = normalizeSettlerTraits(settler);
        const nextDrinkPreference = normalizeDrinkPreference(settler);

        if (settler.gender !== nextGender) {
            settler.gender = nextGender;
            changed = true;
        }

        const traitChanged = (settler.traits ?? []).length !== nextTraits.length
            || nextTraits.some((trait, index) => settler.traits?.[index] !== trait);
        if (traitChanged) {
            settler.traits = nextTraits;
            changed = true;
        }

        if (settler.drinkPreference !== nextDrinkPreference) {
            settler.drinkPreference = nextDrinkPreference;
            changed = true;
        }
    }

    return changed;
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

function resetSettlerWorkProgress(settler: Settler) {
    if (settler.workProgressMs <= 0) {
        return false;
    }

    settler.workProgressMs = 0;
    return true;
}

function setActivity(settler: Settler, activity: SettlerActivity, now: number) {
    let changed = false;
    if (settler.activity === activity) {
        if (activity !== 'waiting' && settler.blockerReason) {
            settler.blockerReason = null;
            changed = true;
        }
        return changed;
    }

    settler.activity = activity;
    settler.stateSinceMs = now;
    changed = true;
    if (activity !== 'socializing' && activity !== 'commuting_social' && activity !== 'shopping' && activity !== 'commuting_shop') {
        settler.socialTileId = null;
    }
    if (activity !== 'waiting' && settler.blockerReason) {
        settler.blockerReason = null;
    }
    return changed;
}

function setSettlerBlocker(settler: Settler, reason: SettlerBlockerReason | null) {
    const previous = settler.blockerReason ?? null;
    const changed = previous?.code !== reason?.code
        || previous?.resourceType !== reason?.resourceType
        || previous?.amount !== reason?.amount
        || previous?.tileId !== reason?.tileId;
    settler.blockerReason = reason ? { ...reason } : null;
    return changed;
}

function getSettlementDebugInfo(settlementId: string | null | undefined) {
    if (!settlementId) {
        return null;
    }

    return {
        settlementId,
        owner: playerSettlementState.getSettlementOwner(settlementId),
    };
}

function getTileDebugInfo(tile: Tile | null | undefined) {
    if (!tile) {
        return null;
    }

    const ownerSettlementId = tile.ownerSettlementId ?? null;
    const controlledBySettlementId = tile.controlledBySettlementId ?? null;

    return {
        id: tile.id,
        q: tile.q,
        r: tile.r,
        terrain: tile.terrain,
        variant: tile.variant ?? null,
        discovered: tile.discovered,
        isBaseTile: tile.isBaseTile,
        walkable: isTileWalkable(tile),
        active: isTileActive(tile),
        activationState: tile.activationState ?? null,
        supportBand: tile.supportBand ?? null,
        ownerSettlementId,
        controlledBySettlementId,
        ownerPlayer: ownerSettlementId ? playerSettlementState.getSettlementOwner(ownerSettlementId) : null,
        controllerPlayer: controlledBySettlementId ? playerSettlementState.getSettlementOwner(controlledBySettlementId) : null,
        condition: tile.condition ?? null,
        conditionState: tile.conditionState ?? null,
        jobSiteEnabled: tile.jobSiteEnabled ?? null,
    };
}

function logPathBlockedSettler(settler: Settler, reason: SettlerBlockerReason, debugContext?: Record<string, unknown>) {
    const targetTile = reason.tileId ? tileIndex[reason.tileId] ?? null : null;
    const assignedWorkTile = getAssignedWorkTile(settler);
    const homeTile = tileIndex[settler.homeTileId] ?? null;
    const homeAccessTile = tileIndex[settler.homeAccessTileId] ?? null;

    console.warn('[settler:path_blocked]', {
        reason,
        context: debugContext ?? null,
        settler: {
            id: settler.id,
            q: settler.q,
            r: settler.r,
            activity: settler.activity,
            settlementId: settler.settlementId,
            settlement: getSettlementDebugInfo(settler.settlementId),
            assignedRole: settler.assignedRole ?? null,
            assignedWorkTileId: settler.assignedWorkTileId,
            workTileId: settler.workTileId ?? null,
            homeTileId: settler.homeTileId,
            homeAccessTileId: settler.homeAccessTileId,
            carryingKind: settler.carryingKind,
            carryingPayload: settler.carryingPayload ?? null,
        },
        targetTile: getTileDebugInfo(targetTile),
        assignedWorkTile: getTileDebugInfo(assignedWorkTile),
        homeTile: getTileDebugInfo(homeTile),
        homeAccessTile: getTileDebugInfo(homeAccessTile),
        players: playerSettlementState.listPlayers(),
    });
}

function setWaiting(
    settler: Settler,
    now: number,
    reason: SettlerBlockerReason,
    debugContext?: Record<string, unknown>,
) {
    const blockerChanged = setSettlerBlocker(settler, reason);
    if (blockerChanged && reason.code === 'path_blocked') {
        logPathBlockedSettler(settler, reason, debugContext);
    }
    return setActivity(settler, 'waiting', now) || blockerChanged;
}

function clearSettlerAssignment(settler: Settler) {
    let changed = false;
    changed = resetSettlerWorkProgress(settler) || changed;
    if (settler.assignedWorkTileId !== null) {
        settler.assignedWorkTileId = null;
        changed = true;
    }
    if ((settler.assignedRole ?? null) !== null) {
        settler.assignedRole = null;
        changed = true;
    }
    if ((settler.guardTowerTileId ?? null) !== null) {
        settler.guardTowerTileId = null;
        changed = true;
    }
    if ((settler.workTileId ?? null) !== null) {
        settler.workTileId = null;
        changed = true;
    }
    if ((settler.hiddenWhileWorking ?? null) !== null) {
        settler.hiddenWhileWorking = null;
        changed = true;
    }
    if ((settler.socialTileId ?? null) !== null) {
        settler.socialTileId = null;
        changed = true;
    }
    if ((settler.blockerReason ?? null) !== null) {
        settler.blockerReason = null;
        changed = true;
    }
    return changed;
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

function clonePath(path: PathCoord[]) {
    return path.map((step) => ({ q: step.q, r: step.r }));
}

function getSettlerRouteKey(route: SettlerRouteIdentity) {
    return [
        route.startQ,
        route.startR,
        route.targetId,
        route.targetQ,
        route.targetR,
        route.settlementId ?? '',
        route.worldVersion,
    ].join(':');
}

function getCurrentSettlerRouteIdentity(settler: Settler, target: Tile, settlementId: string | null): SettlerRouteIdentity {
    return {
        startQ: settler.q,
        startR: settler.r,
        targetId: target.id,
        targetQ: target.q,
        targetR: target.r,
        settlementId,
        worldVersion: getWorldRenderVersion(),
    };
}

function matchesSettlerRoute(
    cached: Pick<SettlerRouteCacheEntry, 'startQ' | 'startR' | 'targetId' | 'targetQ' | 'targetR' | 'settlementId'>,
    settler: Settler,
    target: Tile,
    settlementId: string | null,
) {
    return cached.startQ === settler.q
        && cached.startR === settler.r
        && cached.targetId === target.id
        && cached.targetQ === target.q
        && cached.targetR === target.r
        && cached.settlementId === settlementId;
}

function getSettlerRouteSide(from: PathCoord, to: PathCoord) {
    return SETTLER_ROUTE_SIDES.find(({ dq, dr }) => from.q + dq === to.q && from.r + dr === to.r)?.side ?? null;
}

function isRouteStepWalkable(tile: Tile | null | undefined, settlementId: string | null) {
    if (
        settlementId
        && isTileControlled(tile)
        && !isTileControlledBySettlement(tile, settlementId)
        && !canSettlementUseOpenBorderTransit(tile, settlementId, tileIndex)
    ) {
        return false;
    }

    return isTileWalkable(tile);
}

function getSettlerComponentCacheKey(settlementId: string | null) {
    return `${settlementId ?? ''}:${getWorldRenderVersion()}`;
}

function getSettlerComponentCache(settlementId: string | null) {
    const worldVersion = getWorldRenderVersion();
    const key = getSettlerComponentCacheKey(settlementId);
    const cached = settlerComponentCache.get(key);
    if (cached && cached.worldVersion === worldVersion && cached.settlementId === settlementId) {
        return cached;
    }

    for (const [cacheKey, entry] of settlerComponentCache) {
        if (entry.worldVersion !== worldVersion) {
            settlerComponentCache.delete(cacheKey);
        }
    }

    const componentByTileId = new Map<string, number>();
    let nextComponent = 1;

    for (const tile of Object.values(tileIndex)) {
        if (!tile?.id || componentByTileId.has(tile.id) || !isRouteStepWalkable(tile, settlementId)) {
            continue;
        }

        const componentId = nextComponent++;
        const queue: Tile[] = [tile];
        componentByTileId.set(tile.id, componentId);

        for (let index = 0; index < queue.length; index++) {
            const current = queue[index]!;
            for (const { dq, dr, side } of SETTLER_ROUTE_SIDES) {
                const neighbor = tileIndex[`${current.q + dq},${current.r + dr}`] ?? null;
                if (!neighbor?.id || componentByTileId.has(neighbor.id) || !isRouteStepWalkable(neighbor, settlementId)) {
                    continue;
                }
                if (isEdgeBlocked(current, neighbor, side)) {
                    continue;
                }

                componentByTileId.set(neighbor.id, componentId);
                queue.push(neighbor);
            }
        }
    }

    const entry = {
        worldVersion,
        settlementId,
        componentByTileId,
    };
    settlerComponentCache.set(key, entry);
    return entry;
}

function areSettlerTilesConnected(start: Tile | null | undefined, target: Tile | null | undefined, settlementId: string | null) {
    if (!start || !target) {
        return false;
    }
    if (start.q === target.q && start.r === target.r) {
        return true;
    }
    if (!isRouteStepWalkable(start, settlementId) || !isRouteStepWalkable(target, settlementId)) {
        return false;
    }

    const componentByTileId = getSettlerComponentCache(settlementId).componentByTileId;
    const startComponent = componentByTileId.get(start.id);
    return startComponent !== undefined && startComponent === componentByTileId.get(target.id);
}

function isSettlerRouteStillUsable(cached: SettlerRouteCacheEntry) {
    if (cached.worldVersion !== getWorldRenderVersion() || cached.path.length === 0) {
        return false;
    }

    let previous = { q: cached.startQ, r: cached.startR };
    for (const step of cached.path) {
        const side = getSettlerRouteSide(previous, step);
        if (!side) {
            return false;
        }

        const previousTile = tileIndex[`${previous.q},${previous.r}`] ?? null;
        const stepTile = tileIndex[`${step.q},${step.r}`] ?? null;
        if (isEdgeBlocked(previousTile, stepTile, side)) {
            return false;
        }

        const isTarget = step.q === cached.targetQ && step.r === cached.targetR;
        if (!isTarget && !isRouteStepWalkable(stepTile, cached.settlementId)) {
            return false;
        }

        previous = step;
    }

    return previous.q === cached.targetQ && previous.r === cached.targetR;
}

function putSettlerRouteCacheEntry(settlerId: string, entry: SettlerRouteCacheEntry) {
    const routes = (settlerRouteCache.get(settlerId) ?? [])
        .filter((cached) => !(
            cached.startQ === entry.startQ
            && cached.startR === entry.startR
            && cached.targetId === entry.targetId
            && cached.targetQ === entry.targetQ
            && cached.targetR === entry.targetR
            && cached.settlementId === entry.settlementId
        ));

    routes.unshift(entry);
    settlerRouteCache.set(settlerId, routes.slice(0, SETTLER_ROUTE_CACHE_MAX_ENTRIES));

    const sharedKey = getSettlerRouteKey(entry);
    sharedSettlerRouteCache.delete(sharedKey);
    sharedSettlerRouteCache.set(sharedKey, {
        ...entry,
        path: clonePath(entry.path),
    });
    while (sharedSettlerRouteCache.size > SHARED_SETTLER_ROUTE_CACHE_MAX_ENTRIES) {
        const oldest = sharedSettlerRouteCache.keys().next().value;
        if (oldest === undefined) break;
        sharedSettlerRouteCache.delete(oldest);
    }
}

function forgetSettlerRoute(
    settler: Settler,
    target: Tile,
    settlementId: string | null,
) {
    const routes = settlerRouteCache.get(settler.id);
    if (!routes) {
        return;
    }

    const remaining = routes.filter((cached) => !matchesSettlerRoute(cached, settler, target, settlementId));
    if (remaining.length === 0) {
        settlerRouteCache.delete(settler.id);
    } else if (remaining.length !== routes.length) {
        settlerRouteCache.set(settler.id, remaining);
    }
}

function rememberSettlerRoutePath(
    settler: Settler,
    target: Tile,
    settlementId: string | null,
    path: PathCoord[],
) {
    if (!path.length) {
        forgetSettlerRoute(settler, target, settlementId);
        return;
    }

    putSettlerRouteCacheEntry(settler.id, {
        startQ: settler.q,
        startR: settler.r,
        targetId: target.id,
        targetQ: target.q,
        targetR: target.r,
        settlementId,
        worldVersion: getWorldRenderVersion(),
        path: clonePath(path),
    });
}

function getCachedSettlerRoutePath(
    settler: Settler,
    target: Tile,
    settlementId: string | null,
) {
    const routeIdentity = getCurrentSettlerRouteIdentity(settler, target, settlementId);
    const sharedKey = getSettlerRouteKey(routeIdentity);
    const shared = sharedSettlerRouteCache.get(sharedKey);
    if (shared) {
        if (isSettlerRouteStillUsable(shared)) {
            sharedSettlerRouteCache.delete(sharedKey);
            sharedSettlerRouteCache.set(sharedKey, shared);
            return clonePath(shared.path);
        }
        sharedSettlerRouteCache.delete(sharedKey);
    }

    const routes = settlerRouteCache.get(settler.id);
    if (!routes) {
        return null;
    }

    const routeIndex = routes.findIndex((cached) => matchesSettlerRoute(cached, settler, target, settlementId));
    if (routeIndex < 0) {
        return null;
    }

    const cached = routes[routeIndex]!;
    if (!isSettlerRouteStillUsable(cached)) {
        routes.splice(routeIndex, 1);
        if (routes.length === 0) {
            settlerRouteCache.delete(settler.id);
        }
        return null;
    }

    routes.splice(routeIndex, 1);
    routes.unshift(cached);
    return clonePath(cached.path);
}

function clearReachabilityFailure(settler: Settler, target: Tile, settlementId: string | null) {
    const sharedKey = getSettlerRouteKey(getCurrentSettlerRouteIdentity(settler, target, settlementId));
    sharedSettlerReachabilityFailureCache.delete(sharedKey);

    const cached = settlerReachabilityFailureCache.get(settler.id);
    if (cached && matchesSettlerRoute(cached, settler, target, settlementId)) {
        settlerReachabilityFailureCache.delete(settler.id);
    }
}

function rememberReachabilityFailure(settler: Settler, target: Tile, settlementId: string | null, now: number) {
    const entry = {
        startQ: settler.q,
        startR: settler.r,
        targetId: target.id,
        targetQ: target.q,
        targetR: target.r,
        settlementId,
        worldVersion: getWorldRenderVersion(),
        retryAtMs: now + SETTLER_REACHABILITY_FAILURE_RETRY_MS,
    };
    settlerReachabilityFailureCache.set(settler.id, entry);

    const sharedKey = getSettlerRouteKey(entry);
    sharedSettlerReachabilityFailureCache.delete(sharedKey);
    sharedSettlerReachabilityFailureCache.set(sharedKey, entry);
    while (sharedSettlerReachabilityFailureCache.size > SHARED_SETTLER_REACHABILITY_FAILURE_CACHE_MAX_ENTRIES) {
        const oldest = sharedSettlerReachabilityFailureCache.keys().next().value;
        if (oldest === undefined) break;
        sharedSettlerReachabilityFailureCache.delete(oldest);
    }
}

function isReachabilityFailureCoolingDown(settler: Settler, target: Tile, settlementId: string | null, now: number) {
    const sharedKey = getSettlerRouteKey(getCurrentSettlerRouteIdentity(settler, target, settlementId));
    const shared = sharedSettlerReachabilityFailureCache.get(sharedKey);
    if (shared) {
        if (shared.worldVersion === getWorldRenderVersion() && now < shared.retryAtMs) {
            return true;
        }
        sharedSettlerReachabilityFailureCache.delete(sharedKey);
    }

    const cached = settlerReachabilityFailureCache.get(settler.id);
    if (!cached || !matchesSettlerRoute(cached, settler, target, settlementId)) {
        return false;
    }

    if (cached.worldVersion !== getWorldRenderVersion() || now >= cached.retryAtMs) {
        settlerReachabilityFailureCache.delete(settler.id);
        return false;
    }

    return true;
}

function getSettlerPlanningStaggerMs(settlerId: string) {
    let hash = 0;
    for (let index = 0; index < settlerId.length; index++) {
        hash = ((hash * 31) + settlerId.charCodeAt(index)) >>> 0;
    }
    return hash % SETTLER_PLANNING_STAGGER_WINDOW_MS;
}

function getSettlerPlanningCache(settler: Settler) {
    let cached = settlerPlanningCache.get(settler.id);
    if (!cached) {
        cached = {
            accumulatedDt: 0,
            nextPlanAtMs: 0,
        };
        settlerPlanningCache.set(settler.id, cached);
    }
    return cached;
}

function isLongRunningPlanningActivity(settler: Settler) {
    return settler.activity === 'working' || settler.activity === 'repairing';
}

function shouldRunSettlerPlanning(settler: Settler, now: number, justArrived: boolean) {
    if (
        !justArrived
        && settler.activity === 'waiting'
        && settler.blockerReason
        && now < getSettlerPlanningCache(settler).nextPlanAtMs
    ) {
        return false;
    }

    if (
        justArrived
        || !isLongRunningPlanningActivity(settler)
        || settler.activity === 'waiting'
        || !!settler.blockerReason
        || settler.carryingKind !== null
        || needsFood(settler)
        || needsSleep(settler)
    ) {
        return true;
    }

    return now >= getSettlerPlanningCache(settler).nextPlanAtMs;
}

function deferSettlerPlanning(settler: Settler, dt: number) {
    getSettlerPlanningCache(settler).accumulatedDt += dt;
}

function consumeSettlerPlanningDt(settler: Settler, dt: number) {
    const cached = getSettlerPlanningCache(settler);
    const planningDt = cached.accumulatedDt + dt;
    cached.accumulatedDt = 0;
    return planningDt;
}

function scheduleNextSettlerPlanning(settler: Settler, now: number) {
    if (settler.activity === 'waiting' && settler.blockerReason) {
        getSettlerPlanningCache(settler).nextPlanAtMs = now
            + SETTLER_BLOCKED_PLANNING_MIN_INTERVAL_MS
            + getSettlerPlanningStaggerMs(settler.id);
        return;
    }

    if (!isLongRunningPlanningActivity(settler)) {
        return;
    }

    getSettlerPlanningCache(settler).nextPlanAtMs = now
        + SETTLER_PLANNING_MIN_INTERVAL_MS
        + getSettlerPlanningStaggerMs(settler.id);
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

    const pathSettlementId = getSettlerPathSettlementId(settler);
    const pathSettlementKey = pathSettlementId ?? null;
    let path = getCachedSettlerRoutePath(settler, target, pathSettlementKey);
    if (!path) {
        const startTile = tileIndex[`${settler.q},${settler.r}`] ?? null;
        if (!areSettlerTilesConnected(startTile, target, pathSettlementKey)) {
            rememberReachabilityFailure(settler, target, pathSettlementKey, now);
            return false;
        }
        path = pathService.findWalkablePath(settler.q, settler.r, target.q, target.r, {
            settlementId: pathSettlementKey,
            allowOpenBorders: true,
            telemetrySource: 'settler_movement',
        });
        rememberSettlerRoutePath(settler, target, pathSettlementKey, path);
    }
    if (!path.length) {
        return false;
    }
    clearReachabilityFailure(settler, target, pathSettlementKey);

    const origin = { q: settler.q, r: settler.r };
    const timings = computePathTimings(path, origin, SETTLER_MOVEMENT_SPEED_ADJ, SETTLER_STEP_BASE_MS);
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

function canSettlerReachTile(settler: Settler, target: Tile | null | undefined) {
    if (!target) {
        return false;
    }

    if (settler.q === target.q && settler.r === target.r) {
        return true;
    }

    const pathSettlementId = getSettlerPathSettlementId(settler);
    const pathSettlementKey = pathSettlementId ?? null;
    if (getCachedSettlerRoutePath(settler, target, pathSettlementKey)) {
        clearReachabilityFailure(settler, target, pathSettlementKey);
        return true;
    }

    if (isReachabilityFailureCoolingDown(settler, target, pathSettlementKey, currentSettlerTickNow)) {
        return false;
    }

    const startTile = tileIndex[`${settler.q},${settler.r}`] ?? null;
    if (!areSettlerTilesConnected(startTile, target, pathSettlementKey)) {
        rememberReachabilityFailure(settler, target, pathSettlementKey, currentSettlerTickNow);
        return false;
    }

    const path = pathService.findWalkablePath(settler.q, settler.r, target.q, target.r, {
        settlementId: pathSettlementKey,
        allowOpenBorders: true,
        telemetrySource: 'settler_reachability',
    });
    rememberSettlerRoutePath(settler, target, pathSettlementKey, path);
    if (path.length > 0) {
        clearReachabilityFailure(settler, target, pathSettlementKey);
    } else {
        rememberReachabilityFailure(settler, target, pathSettlementKey, currentSettlerTickNow);
    }
    return path.length > 0;
}

function chooseNearestReachableTile(settler: Settler, candidates: Tile[]) {
    const sortedCandidates = candidates
        .slice()
        .sort((a, b) => {
            const distanceDelta = pathService.axialDistance(settler.q, settler.r, a.q, a.r)
                - pathService.axialDistance(settler.q, settler.r, b.q, b.r);
            if (distanceDelta !== 0) {
                return distanceDelta;
            }

            return a.id.localeCompare(b.id);
        });

    for (const candidate of sortedCandidates) {
        if (canSettlerReachTile(settler, candidate)) {
            return candidate;
        }
    }

    return null;
}

function removeSettler(settlerId: string) {
    const index = settlers.findIndex((candidate) => candidate.id === settlerId);
    if (index >= 0) {
        settlers.splice(index, 1);
        settlerRouteCache.delete(settlerId);
        settlerReachabilityFailureCache.delete(settlerId);
        settlerPlanningCache.delete(settlerId);
        return true;
    }

    return false;
}

function getAssignedSite(settler: Settler) {
    if (!settler.assignedWorkTileId || settler.assignedRole === 'repair' || settler.assignedRole === 'guard') {
        return null;
    }

    return listResolvedJobSites().find((site) => site.tile.id === settler.assignedWorkTileId) ?? null;
}

function getAssignedWorkTile(settler: Settler) {
    return settler.assignedWorkTileId ? tileIndex[settler.assignedWorkTileId] ?? null : null;
}

function getRepairInput(settler: Settler) {
    const tile = getAssignedWorkTile(settler);
    const [resource] = getTileRepairResources(tile);
    return resource ? { ...resource } : null;
}

function resolveFieldWorkTile(siteTile: Tile | null | undefined, terrain: Tile['terrain']) {
    if (!siteTile?.neighbors || !terrain) {
        return siteTile ?? null;
    }

    const candidates = Object.values(siteTile.neighbors)
        .filter((tile): tile is Tile => !!tile && tile.discovered && tile.terrain === terrain && isTileActive(tile))
        .sort((a, b) => a.id.localeCompare(b.id));
    return candidates[0] ?? siteTile;
}

function refreshSettlerWorkPresentation(settler: Settler) {
    const assignedTile = getAssignedWorkTile(settler);
    const guardTower = getGuardTower(settler);
    if (!assignedTile) {
        settler.workTileId = null;
        settler.hiddenWhileWorking = null;
        return false;
    }

    const previousWorkTileId = settler.workTileId ?? null;
    const previousHidden = settler.hiddenWhileWorking ?? null;
    let workTileId = assignedTile.id;
    let hiddenWhileWorking = false;

    if (settler.assignedRole === 'guard') {
        workTileId = guardTower?.id ?? assignedTile.id;
        hiddenWhileWorking = false;
    } else if (settler.assignedRole === 'repair') {
        workTileId = assignedTile.id;
        hiddenWhileWorking = false;
    } else {
        const presentation = getTileJobPresentation(assignedTile);
        hiddenWhileWorking = presentation === 'indoor';
        if (presentation === 'field') {
            workTileId = resolveFieldWorkTile(assignedTile, assignedTile.terrain)?.id ?? assignedTile.id;
        }
    }

    settler.workTileId = workTileId;
    settler.hiddenWhileWorking = hiddenWhileWorking;
    return previousWorkTileId !== workTileId || previousHidden !== hiddenWhileWorking;
}

function getHomeAccessTile(settler: Settler) {
    const explicit = tileIndex[settler.homeAccessTileId];
    if (explicit?.discovered && isTileWalkable(explicit)) {
        return explicit;
    }

    return getHomeFallbackTile(settler.settlementId);
}

function getWorkAccessTileResult(settler: Settler, tile: Tile | null | undefined) {
    if (!tile) {
        return null;
    }

    const accessTaskType = tile.terrain === 'water' && tile.variant?.startsWith('water_dock_') ? 'buildDock' : null;
    const candidates = listTaskAccessTiles(accessTaskType, tile, settler.settlementId);
    if (candidates.length > 0) {
        const accessTile = chooseNearestReachableTile(settler, candidates);
        return accessTile ? { tile: accessTile, reachable: true } : null;
    }

    const accessTile = findNearestTaskAccessTile(accessTaskType, tile, settler.q, settler.r, settler.settlementId)
        ?? (isTileWalkable(tile) ? tile : null);
    return accessTile ? { tile: accessTile, reachable: false } : null;
}

function getWorkAccessTile(settler: Settler, tile: Tile | null | undefined) {
    return getWorkAccessTileResult(settler, tile)?.tile ?? null;
}

function getReachableWorkAccessTile(settler: Settler, tile: Tile | null | undefined) {
    const result = getWorkAccessTileResult(settler, tile);
    if (!result) {
        return null;
    }

    if (result.reachable || canSettlerReachTile(settler, result.tile)) {
        return result.tile;
    }

    return null;
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
    const carriedInputs = resolved.consumes.filter((resource) => !isVirtualJobInput(site.tile, resource));
    return {
        site,
        inputs: resolved.consumes,
        input: resolvePrimaryResource(carriedInputs),
        output: resolvePrimaryResource(resolved.produces),
    };
}

function getStarvationMs(settler: Settler) {
    if (isHungerBypassEnabled(testModeSettings)) {
        return 0;
    }

    return Math.max(0, settler.hungerMs - SETTLER_MEAL_INTERVAL_MS);
}

function isHungry(settler: Settler) {
    if (isHungerBypassEnabled(testModeSettings)) {
        return false;
    }

    return settler.hungerMs >= SETTLER_MEAL_INTERVAL_MS;
}

function needsFood(settler: Settler) {
    if (isHungerBypassEnabled(testModeSettings)) {
        return false;
    }

    return settler.hungerMs >= SETTLER_FOOD_SEEK_MS;
}

function needsSleep(settler: Settler) {
    return settler.fatigueMs >= SETTLER_MAX_ACTIVE_MS * getSettlerSleepThresholdMultiplier(settler);
}

function canProduceFood(settler: Settler) {
    const siteInfo = getSiteInputsOutputs(settler);
    if (!siteInfo?.output || !isHungerFoodResource(siteInfo.output.type) || siteInfo.output.amount <= 0) {
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

function chooseReachableWarehouseWithFood(settler: Settler) {
    let blockedStorage: Tile | null = null;
    let blockedResourceType: ResourceAmount['type'] | null = null;
    for (const resourceType of HUNGER_FOOD_TYPES) {
        const result = chooseReachableWarehouseWithResource(settler, {
            type: resourceType,
            amount: FOOD_PER_SETTLER_PER_MINUTE,
        });
        if (!blockedStorage && result.blockedStorage) {
            blockedStorage = result.blockedStorage;
            blockedResourceType = resourceType;
        }
        if (result.storage) {
            return {
                storage: result.storage,
                blockedStorage: result.blockedStorage,
                resourceType,
            };
        }
    }

    return {
        storage: null,
        blockedStorage,
        resourceType: blockedResourceType,
    };
}

function getAssignedInput(settler: Settler) {
    if (settler.assignedRole === 'repair') {
        return getRepairInput(settler);
    }

    return getSiteInputsOutputs(settler)?.input ?? null;
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
    const mealAmount = 1;
    for (const resourceType of HUNGER_FOOD_TYPES) {
        if ((getStorageResourceAmount(storageTile.id, resourceType) ?? 0) < mealAmount) {
            continue;
        }

        const withdrawn = withdrawResourceFromStorage(storageTile.id, resourceType, mealAmount);
        if (withdrawn < mealAmount) {
            continue;
        }

        broadcastWithdrawal(settler, storageTile.id, { type: resourceType, amount: withdrawn });
        const reliefMs = getResourceHungerRelief(resourceType) * SETTLER_MEAL_INTERVAL_MS;
        settler.hungerMs = Math.max(0, settler.hungerMs - reliefMs);
        return true;
    }

    return false;
}

function tryEatFromSettlementStorage(settler: Settler) {
    const mealAmount = 1;
    for (const resourceType of HUNGER_FOOD_TYPES) {
        const planned = planResourceWithdrawalsAcrossStoragesForSettlement(settler.settlementId, resourceType, mealAmount);
        const plannedAmount = planned.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (plannedAmount < mealAmount) {
            continue;
        }

        const transfers = withdrawResourceAcrossStoragesForSettlement(settler.settlementId, resourceType, mealAmount);
        const withdrawn = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (withdrawn < mealAmount) {
            continue;
        }

        for (const transfer of transfers) {
            broadcastWithdrawal(settler, transfer.storageTileId, { type: resourceType, amount: transfer.amount });
        }
        const reliefMs = getResourceHungerRelief(resourceType) * SETTLER_MEAL_INTERVAL_MS;
        settler.hungerMs = Math.max(0, settler.hungerMs - reliefMs);
        return true;
    }

    return false;
}

function tryWithdrawInput(settler: Settler, storageTile: Tile) {
    const input = getAssignedInput(settler);
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

    const deliveredResource = {
        type: previousPayload.type,
        amount: deposited,
    };
    broadcastDeposit(settler, storageTile.id, deliveredResource);

    emitGameplayEvent({
        type: 'resource:delivered',
        heroId: settler.id,
        resourceType: previousPayload.type,
        amount: deposited,
    });
    resumeWaitingTasksForResource(previousPayload.type, storageTile.id);

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

function getStoredCycleInputs(
    siteInfo: NonNullable<ReturnType<typeof getSiteInputsOutputs>>,
    settler: Settler,
) {
    const inputs: ResourceAmount[] = [];
    let skippedCarriedInput = false;

    for (const input of siteInfo.inputs) {
        if (isVirtualJobInput(siteInfo.site.tile, input)) {
            continue;
        }

        if (!skippedCarriedInput
            && settler.carryingKind === 'input'
            && settler.carryingPayload?.type === input.type
            && settler.carryingPayload.amount >= input.amount) {
            skippedCarriedInput = true;
            continue;
        }

        inputs.push(input);
    }

    return inputs;
}

function getMissingStoredCycleInput(
    siteInfo: NonNullable<ReturnType<typeof getSiteInputsOutputs>>,
    settler: Settler,
): ResourceAmount | null {
    for (const input of getStoredCycleInputs(siteInfo, settler)) {
        const plannedTransfers = planResourceWithdrawalsAcrossStoragesForSettlement(
            getJobSiteSettlementId(siteInfo.site.tile),
            input.type,
            input.amount,
        );
        const plannedAmount = plannedTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (plannedAmount < input.amount) {
            return {
                type: input.type,
                amount: Math.max(0, input.amount - plannedAmount),
            };
        }
    }

    return null;
}

function withdrawStoredCycleInputs(
    settler: Settler,
    siteInfo: NonNullable<ReturnType<typeof getSiteInputsOutputs>>,
) {
    const inputs = getStoredCycleInputs(siteInfo, settler);
    const plannedInputs = inputs.map((input) => {
        const transfers = planResourceWithdrawalsAcrossStoragesForSettlement(
            getJobSiteSettlementId(siteInfo.site.tile),
            input.type,
            input.amount,
        );
        const plannedAmount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        return { input, transfers, plannedAmount };
    });

    if (plannedInputs.some((planned) => planned.plannedAmount < planned.input.amount)) {
        return false;
    }

    for (const planned of plannedInputs) {
        const transfers = withdrawResourceAcrossStoragesForSettlement(
            getJobSiteSettlementId(siteInfo.site.tile),
            planned.input.type,
            planned.input.amount,
        );

        for (const transfer of transfers) {
            broadcastWithdrawal(settler, transfer.storageTileId, {
                type: planned.input.type,
                amount: transfer.amount,
            });
        }
    }

    return true;
}

function completeRepairCycle(settler: Settler, repairTile: Tile, now: number) {
    if (settler.carryingKind === 'input') {
        settler.carryingPayload = undefined;
        settler.carryingKind = null;
    }

    settler.workProgressMs = 0;
    const nextCondition = Math.min(100, (repairTile.condition ?? 100) + REPAIR_RESTORE_AMOUNT);
    const changed = updateTileCondition(repairTile, nextCondition, now);
    if (changed) {
        broadcast({ type: 'tile:updated', tile: repairTile } as TileUpdatedMessage);
    }

    return setActivity(settler, 'idle', now) || changed;
}

export function syncSettlerPopulation(now: number) {
    refreshSettlerIdCounter();
    const population = getPopulationState();
    const target = Math.max(0, population.current);
    const originalLength = settlers.length;
    const changed = ensureSettlerNameSeeds(now);
    const countCivilianSettlers = (settlementId?: string | null) => settlers.filter((settler) => {
        if (isGuardSettler(settler)) {
            return false;
        }
        if (settlementId === undefined) {
            return true;
        }
        return settler.settlementId === settlementId;
    }).length;

    if (population.settlements.length > 0) {
        let changedBySettlement = changed;
        const targetBySettlementId = new Map(
            population.settlements.map((settlement) => [settlement.settlementId, Math.max(0, settlement.current)]),
        );
        const countBySettlementId = new Map<string, number>();
        for (const [settlementId] of targetBySettlementId.entries()) {
            countBySettlementId.set(settlementId, countCivilianSettlers(settlementId));
        }
        const isOverTarget = (settlementId: string | null | undefined) => {
            if (!settlementId || !targetBySettlementId.has(settlementId)) {
                return true;
            }
            return (countBySettlementId.get(settlementId) ?? 0) > (targetBySettlementId.get(settlementId) ?? 0);
        };
        const adoptableSettlers = () => settlers.filter((settler) => !isGuardSettler(settler) && isOverTarget(settler.settlementId));

        for (const [settlementId, settlementTarget] of targetBySettlementId.entries()) {
            let settlementSettlers = countBySettlementId.get(settlementId) ?? 0;
            for (const settler of adoptableSettlers()) {
                if (settlementSettlers >= settlementTarget) {
                    break;
                }
                if (settler.settlementId === settlementId) {
                    continue;
                }
                if (settler.settlementId && targetBySettlementId.has(settler.settlementId)) {
                    countBySettlementId.set(
                        settler.settlementId,
                        Math.max(0, (countBySettlementId.get(settler.settlementId) ?? 0) - 1),
                    );
                }
                settler.settlementId = settlementId;
                settlementSettlers++;
                countBySettlementId.set(settlementId, settlementSettlers);
                changedBySettlement = true;
            }

            while (settlementSettlers < settlementTarget) {
                settlers.push(createSettler(now, settlementId));
                settlementSettlers++;
                countBySettlementId.set(settlementId, settlementSettlers);
                changedBySettlement = true;
            }
        }

        for (const [settlementId, settlementTarget] of targetBySettlementId.entries()) {
            let settlementSettlers = countCivilianSettlers(settlementId);
            while (settlementSettlers > settlementTarget) {
                const index = settlers.findLastIndex((settler) => settler.settlementId === settlementId && !isGuardSettler(settler));
                if (index < 0) {
                    break;
                }
                settlers.splice(index, 1);
                settlementSettlers--;
                changedBySettlement = true;
            }
        }

        while (countCivilianSettlers() > target) {
            const index = settlers.findLastIndex((settler) => !isGuardSettler(settler) && (!settler.settlementId || !targetBySettlementId.has(settler.settlementId)));
            if (index < 0) {
                break;
            }
            settlers.splice(index, 1);
            changedBySettlement = true;
        }

        return changedBySettlement || settlers.length !== originalLength;
    }

    while (countCivilianSettlers() < target) {
        settlers.push(createSettler(now));
    }

    while (countCivilianSettlers() > target) {
        const index = settlers.findLastIndex((settler) => !isGuardSettler(settler));
        if (index < 0) {
            break;
        }
        settlers.splice(index, 1);
    }

    return changed || settlers.length !== originalLength;
}

interface HomeSlot {
    key: string;
    homeTileId: string;
    accessTileId: string;
    settlementId: string | null;
}

const HOUSE_CAPACITY_BY_VARIANT: Partial<Record<string, number>> = {
    plains_house: 2,
    dirt_house: 2,
    plains_stone_house: 4,
    dirt_stone_house: 4,
    plains_glass_house: 6,
    dirt_glass_house: 6,
};

function getHouseCapacity(tile: Tile | null | undefined) {
    if (!isHouseTile(tile)) {
        return 0;
    }

    return Math.max(0, HOUSE_CAPACITY_BY_VARIANT[tile.variant ?? ''] ?? 2);
}

function buildHomeSlots() {
    const slots: HomeSlot[] = [];
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
        const settlementId = house.ownerSettlementId ?? house.controlledBySettlementId ?? null;
        const accessTile = findNearestTaskAccessTile(null, house, house.q, house.r, settlementId);
        if (!accessTile) {
            continue;
        }

        const houseCapacity = getHouseCapacity(house);
        for (let slotIndex = 0; slotIndex < houseCapacity; slotIndex++) {
            slots.push({
                key: `${house.id}:${slotIndex}`,
                homeTileId: house.id,
                accessTileId: accessTile.id,
                settlementId,
            });
        }
    }

    return slots;
}

function chooseNearestReachableHomeSlot(
    settler: Settler,
    homeSlots: HomeSlot[],
    usedSlotKeys: Set<string>,
    settlementId: string | null | undefined,
) {
    const startTile = tileIndex[`${settler.q},${settler.r}`] ?? null;
    const pathSettlementId = getSettlerPathSettlementId(settler);
    const candidates = homeSlots
        .filter((slot) => !usedSlotKeys.has(slot.key))
        .filter((slot) => settlementId === undefined || slot.settlementId === settlementId)
        .map((slot) => ({
            slot,
            accessTile: tileIndex[slot.accessTileId] ?? null,
        }))
        .filter((candidate): candidate is { slot: HomeSlot; accessTile: Tile } => !!candidate.accessTile)
        .sort((a, b) => {
            const distanceDelta = pathService.axialDistance(settler.q, settler.r, a.accessTile.q, a.accessTile.r)
                - pathService.axialDistance(settler.q, settler.r, b.accessTile.q, b.accessTile.r);
            if (distanceDelta !== 0) {
                return distanceDelta;
            }

            return a.slot.key.localeCompare(b.slot.key);
        });

    for (const candidate of candidates) {
        if (areSettlerTilesConnected(startTile, candidate.accessTile, pathSettlementId)) {
            return candidate.slot;
        }
    }

    return null;
}

function preserveCurrentHomeIfResident(
    settler: Settler,
    preservedHomeOccupancy: Map<string, number>,
) {
    const homeTile = settler.homeTileId ? tileIndex[settler.homeTileId] ?? null : null;
    const accessTile = settler.homeAccessTileId ? tileIndex[settler.homeAccessTileId] ?? null : null;
    if (
        !homeTile?.discovered
        || !isHouseTile(homeTile)
        || !isBuildingOfflineFromCondition(homeTile)
        || !homeTile.controlledBySettlementId
        || !accessTile?.discovered
        || !isTileWalkable(accessTile)
    ) {
        return { preserved: false, changed: false };
    }

    const capacity = getHouseCapacity(homeTile);
    const occupancy = preservedHomeOccupancy.get(homeTile.id) ?? 0;
    if (capacity <= 0 || occupancy >= capacity) {
        return { preserved: false, changed: false };
    }

    preservedHomeOccupancy.set(homeTile.id, occupancy + 1);
    const settlementId = homeTile.ownerSettlementId ?? homeTile.controlledBySettlementId ?? null;
    if (settler.settlementId !== settlementId) {
        settler.settlementId = settlementId;
        return { preserved: true, changed: true };
    }

    return { preserved: true, changed: false };
}

function reconcileHomes() {
    const homeSlots = buildHomeSlots();
    const usedSlotKeys = new Set<string>();
    const preservedHomeOccupancy = new Map<string, number>();
    const remaining: Settler[] = [];
    let changed = false;

    for (const settler of settlers) {
        if (isGuardSettler(settler)) {
            continue;
        }
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

        const preserved = preserveCurrentHomeIfResident(settler, preservedHomeOccupancy);
        if (preserved.preserved) {
            changed = preserved.changed || changed;
            continue;
        }

        remaining.push(settler);
    }

    for (const settler of remaining) {
        const nextSlot = chooseNearestReachableHomeSlot(settler, homeSlots, usedSlotKeys, settler.settlementId)
            ?? chooseNearestReachableHomeSlot(settler, homeSlots, usedSlotKeys, undefined);
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
    const siteSettlementId = getJobSiteSettlementId(siteTile);
    const aSettlement = a.settlementId === siteSettlementId ? 0 : 1;
    const bSettlement = b.settlementId === siteSettlementId ? 0 : 1;
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

function canSettlerServeTile(settler: Settler, tile: Tile | null | undefined) {
    const tileSettlementId = getJobSiteSettlementId(tile);
    return !tileSettlementId || settler.settlementId === tileSettlementId;
}

function canTakeNewWorkAssignment(settler: Settler) {
    return !settler.assignedWorkTileId
        && !settler.movement
        && settler.carryingKind === null
        && (settler.activity === 'idle' || settler.activity === 'waiting');
}

function chooseNearestAssignableSite(
    settler: Settler,
    sites: ResolvedJobSite[],
    assignmentCounts: Map<string, number>,
) {
    const candidates = sites
        .map((site) => {
            const assigned = assignmentCounts.get(site.tile.id) ?? 0;
            const nextCount = assigned + 1;
            if (
                assigned >= site.slots
                || !canSettlerServeTile(settler, site.tile)
                || !canAssignWorkersToSite(site, nextCount)
            ) {
                return null;
            }

            const accessTile = getReachableWorkAccessTile(settler, site.tile);
            return accessTile ? { site, accessTile, nextCount } : null;
        })
        .filter((candidate): candidate is { site: ResolvedJobSite; accessTile: Tile; nextCount: number } => !!candidate)
        .sort((a, b) => {
            const distanceDelta = pathService.axialDistance(settler.q, settler.r, a.accessTile.q, a.accessTile.r)
                - pathService.axialDistance(settler.q, settler.r, b.accessTile.q, b.accessTile.r);
            if (distanceDelta !== 0) {
                return distanceDelta;
            }

            return compareResolvedSites(a.site, b.site);
        });

    return candidates[0] ?? null;
}

function assignSettlerToRepair(settler: Settler, repairTile: Tile, assignedRepairTargetIds: Set<string>) {
    settler.assignedWorkTileId = repairTile.id;
    settler.assignedRole = 'repair';
    resetSettlerWorkProgress(settler);
    assignedRepairTargetIds.add(repairTile.id);
    refreshSettlerWorkPresentation(settler);
}

function reconcileAssignments() {
    const sites = listResolvedJobSites();
    const siteById = new Map(sites.map((site) => [site.tile.id, site]));
    const repairTargets = listRepairTargets();
    const repairTargetIds = new Set(repairTargets.map((tile) => tile.id));
    const assignedRepairTargetIds = new Set<string>();
    const civilianSettlers = settlers.filter((settler) => !isGuardSettler(settler));
    const availableWorkers = Math.max(0, Math.min(getPopulationState().current, civilianSettlers.length));
    const eligibleSettlers = civilianSettlers
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, availableWorkers);
    const eligibleIds = new Set(eligibleSettlers.map((settler) => settler.id));
    const assignmentCounts = new Map<string, number>();
    let changed = false;

    for (const settler of settlers) {
        if (isGuardSettler(settler)) {
            changed = refreshSettlerWorkPresentation(settler) || changed;
            continue;
        }

        if (!eligibleIds.has(settler.id)) {
            changed = clearSettlerAssignment(settler) || changed;
            continue;
        }

        if (settler.assignedRole === 'repair') {
            const repairTile = settler.assignedWorkTileId ? tileIndex[settler.assignedWorkTileId] ?? null : null;
            if (
                !settler.assignedWorkTileId
                || !repairTargetIds.has(settler.assignedWorkTileId)
                || !canSettlerServeTile(settler, repairTile)
                || assignedRepairTargetIds.has(settler.assignedWorkTileId)
            ) {
                changed = clearSettlerAssignment(settler) || changed;
                continue;
            }

            assignedRepairTargetIds.add(settler.assignedWorkTileId);
            changed = refreshSettlerWorkPresentation(settler) || changed;
            continue;
        }

        const homeRepairTile = settler.homeTileId ? tileIndex[settler.homeTileId] ?? null : null;
        if (
            homeRepairTile
            && isHouseTile(homeRepairTile)
            && isBuildingOfflineFromCondition(homeRepairTile)
            && repairTargetIds.has(homeRepairTile.id)
            && !assignedRepairTargetIds.has(homeRepairTile.id)
            && canSettlerServeTile(settler, homeRepairTile)
        ) {
            assignSettlerToRepair(settler, homeRepairTile, assignedRepairTargetIds);
            changed = true;
            continue;
        }

        const site = settler.assignedWorkTileId ? siteById.get(settler.assignedWorkTileId) : null;
        if (!site || !canSettlerServeTile(settler, site.tile)) {
            changed = clearSettlerAssignment(settler) || changed;
            continue;
        }

        if (
            isBuildingOfflineFromCondition(site.tile)
            && repairTargetIds.has(site.tile.id)
            && !assignedRepairTargetIds.has(site.tile.id)
        ) {
            assignSettlerToRepair(settler, site.tile, assignedRepairTargetIds);
            changed = true;
            continue;
        }

        const nextCount = (assignmentCounts.get(site.tile.id) ?? 0) + 1;
        if (nextCount > site.slots || !canAssignWorkersToSite(site, nextCount)) {
            changed = clearSettlerAssignment(settler) || changed;
            continue;
        }

        assignmentCounts.set(site.tile.id, nextCount);
        if (settler.assignedRole !== 'job') {
            settler.assignedRole = 'job';
            resetSettlerWorkProgress(settler);
            changed = true;
        }
        changed = refreshSettlerWorkPresentation(settler) || changed;
    }

    const unassignedWorkers = eligibleSettlers
        .filter(canTakeNewWorkAssignment)
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const candidate of unassignedWorkers) {
        const assignment = chooseNearestAssignableSite(candidate, sites, assignmentCounts);
        if (!assignment) {
            continue;
        }

        candidate.assignedWorkTileId = assignment.site.tile.id;
        candidate.assignedRole = 'job';
        resetSettlerWorkProgress(candidate);
        refreshSettlerWorkPresentation(candidate);
        assignmentCounts.set(assignment.site.tile.id, assignment.nextCount);
        changed = true;
    }

    for (const repairTile of repairTargets) {
        if (assignedRepairTargetIds.has(repairTile.id)) {
            continue;
        }
        const candidates = eligibleSettlers
            .filter((settler) => !settler.assignedWorkTileId)
            .filter((settler) => canSettlerServeTile(settler, repairTile))
            .sort((a, b) => sortSettlersForAssignment(a, b, repairTile));
        const candidate = candidates[0];
        if (!candidate) {
            continue;
        }

        candidate.assignedWorkTileId = repairTile.id;
        candidate.assignedRole = 'repair';
        resetSettlerWorkProgress(candidate);
        assignedRepairTargetIds.add(repairTile.id);
        refreshSettlerWorkPresentation(candidate);
        changed = true;
    }

    return changed;
}

function reconcileMilitaryGuards(now: number) {
    const guardSettlers = settlers.filter((settler) => isGuardSettler(settler));
    const guardIdsToRemove = new Set<string>();
    let changed = false;
    const townCenters = Object.values(tileIndex)
        .filter((tile): tile is Tile => !!tile?.discovered && tile.terrain === 'towncenter')
        .sort((a, b) => a.id.localeCompare(b.id));

    const towers = Object.values(tileIndex)
        .filter((tile): tile is Tile => !!tile?.discovered && isWatchtowerTile(tile) && !!tile.ownerSettlementId)
        .sort((a, b) => a.id.localeCompare(b.id));

    const desiredGuardCounts = new Map(
        towers.map((tower) => [tower.id, Math.max(0, tower.towerAssignedGuards ?? 0)]),
    );

    for (const guard of guardSettlers) {
        if (isRaidSettler(guard)) {
            continue;
        }
        const tower = getGuardTower(guard);
        if (!tower || !isWatchtowerTile(tower) || !guard.settlementId || tower.ownerSettlementId !== guard.settlementId || (desiredGuardCounts.get(tower.id) ?? 0) <= 0) {
            guardIdsToRemove.add(guard.id);
        }
    }

    for (const tower of towers) {
        const settlementId = tower.ownerSettlementId ?? null;
        if (!settlementId) {
            continue;
        }

        const accessTile = getGuardTowerAccessTile(settlementId, tower);
        if (!accessTile) {
            continue;
        }

        const currentGuards = guardSettlers
            .filter((guard) => !guardIdsToRemove.has(guard.id))
            .filter((guard) => !isRaidSettler(guard) && guard.guardTowerTileId === tower.id && guard.settlementId === settlementId)
            .sort((a, b) => a.id.localeCompare(b.id));
        const desiredCount = desiredGuardCounts.get(tower.id) ?? 0;

        for (const guard of currentGuards) {
            if (guard.assignedWorkTileId !== accessTile.id) {
                guard.assignedWorkTileId = accessTile.id;
                resetSettlerWorkProgress(guard);
                changed = true;
            }
            changed = refreshSettlerWorkPresentation(guard) || changed;
        }

        for (let index = currentGuards.length; index < desiredCount; index++) {
            const originTileId = tower.towerGuardOriginTileIds?.[index] ?? null;
            const originTile = originTileId ? tileIndex[originTileId] ?? null : null;
            settlers.push(createGuardSettler(now, settlementId, tower, accessTile, originTile));
            changed = true;
        }

        for (let index = desiredCount; index < currentGuards.length; index++) {
            guardIdsToRemove.add(currentGuards[index]!.id);
        }
    }

    for (const townCenter of townCenters) {
        const settlementId = townCenter.id;
        const targetTower = townCenter.raidTargetTileId ? tileIndex[townCenter.raidTargetTileId] ?? null : null;
        const desiredRaiders = Math.max(0, townCenter.raidCommittedGuards ?? 0);
        const currentRaiders = guardSettlers
            .filter((guard) => !guardIdsToRemove.has(guard.id))
            .filter((guard) => guard.settlementId === settlementId && isRaidSettler(guard))
            .sort((a, b) => a.id.localeCompare(b.id));

        if (!targetTower || !isRaidableMilitaryTarget(targetTower) || desiredRaiders <= 0) {
            if (townCenter.raidBlockedReason) {
                townCenter.raidBlockedReason = null;
                broadcastTileUpdate(townCenter);
            }
            for (const raider of currentRaiders) {
                guardIdsToRemove.add(raider.id);
            }
            continue;
        }

        const homeTile = getHomeFallbackTile(settlementId);
        const accessTiles = getGuardRaidAccessTiles(settlementId, targetTower);
        const reachableAccessTiles = accessTiles.filter((accessTile) => canReachGuardAccessTile(homeTile, accessTile));
        const formationAccessTiles = reachableAccessTiles.length > 0 ? reachableAccessTiles : accessTiles;
        const hasPath = reachableAccessTiles.length > 0;
        const nextBlockedReason = hasPath ? null : 'No path to the raid target.';
        if ((townCenter.raidBlockedReason ?? null) !== nextBlockedReason) {
            townCenter.raidBlockedReason = nextBlockedReason;
            broadcastTileUpdate(townCenter);
        }

        for (const [index, raider] of currentRaiders.entries()) {
            if (raider.guardTowerTileId !== targetTower.id) {
                raider.guardTowerTileId = targetTower.id;
                changed = true;
            }
            ensureRaiderCombatHealth(raider);
            const accessTile = formationAccessTiles[index % formationAccessTiles.length] ?? null;
            if (accessTile && raider.assignedWorkTileId !== accessTile.id) {
                raider.assignedWorkTileId = accessTile.id;
                resetSettlerWorkProgress(raider);
                changed = true;
            }
            changed = refreshSettlerWorkPresentation(raider) || changed;
        }

        for (let index = currentRaiders.length; index < desiredRaiders; index++) {
            const fallbackAccessTile = formationAccessTiles[index % formationAccessTiles.length] ?? homeTile;
            if (!fallbackAccessTile) {
                break;
            }
            const originTileId = townCenter.raidGuardOriginTileIds?.[index] ?? null;
            const originTile = originTileId ? tileIndex[originTileId] ?? null : null;
            settlers.push(createGuardSettler(now, settlementId, targetTower, fallbackAccessTile, originTile));
            changed = true;
        }

        for (let index = desiredRaiders; index < currentRaiders.length; index++) {
            guardIdsToRemove.add(currentRaiders[index]!.id);
        }
    }

    for (const guardId of guardIdsToRemove) {
        changed = removeSettler(guardId) || changed;
    }

    return changed;
}

function chooseReachableWarehouseWithCapacity(settler: Settler, requiredFreeCapacity: number) {
    const candidates = listUsableWarehousesWithCapacityForResource(
        settler.q,
        settler.r,
        settler.settlementId,
        settler.carryingPayload?.type ?? null,
        requiredFreeCapacity,
    );
    const storage = chooseNearestReachableTile(settler, candidates);
    return {
        storage,
        blockedStorage: storage ? null : candidates[0] ?? null,
    };
}

function chooseReachableWarehouseWithResource(settler: Settler, resource: ResourceAmount) {
    const candidates = listUsableWarehousesWithResource(
        settler.q,
        settler.r,
        settler.settlementId,
        resource.type,
        resource.amount,
        resource.type && isHungerFoodResource(resource.type) ? { allowInactive: true } : {},
    );
    const storage = chooseNearestReachableTile(settler, candidates);
    return {
        storage,
        blockedStorage: storage ? null : candidates[0] ?? null,
    };
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
    if (isHungerBypassEnabled(testModeSettings)) {
        settler.hungerMs = 0;
        return setActivity(settler, 'idle', now) || true;
    }

    const { storage, blockedStorage, resourceType } = chooseReachableWarehouseWithFood(settler);
    if (!storage) {
        if (blockedStorage) {
            return setWaiting(settler, now, {
                code: 'path_blocked',
                resourceType: resourceType ?? 'meat',
                amount: FOOD_PER_SETTLER_PER_MINUTE,
                tileId: blockedStorage.id,
            }, {
                action: 'fetch_food',
                blockedStorageTileId: blockedStorage.id,
            });
        }

        return false;
    }

    if (settler.q === storage.q && settler.r === storage.r) {
        return handleStorageArrival(settler, storage, now);
    }

    return startMovement(settler, storage, 'fetching_food', now);
}

function getSocialDrinkAmount(settlementId: string | null | undefined, resourceType: 'beer' | 'wine') {
    const inventory = settlementId ? getSettlementResourceInventory(settlementId) : getEffectiveResourceInventory();
    return Math.max(0, inventory[resourceType] ?? 0);
}

function getPubWorkerCount(tileId: string, excludeSettlerId?: string | null) {
    return settlers.filter((candidate) => (
        candidate.id !== excludeSettlerId
        && candidate.activity !== 'socializing'
        && candidate.activity !== 'commuting_social'
        && candidate.activity !== 'sleeping'
        && candidate.assignedRole === 'job'
        && candidate.assignedWorkTileId === tileId
    )).length;
}

function getPubVisitorCount(tileId: string) {
    return settlers.filter((candidate) => (
        candidate.socialTileId === tileId
        && (candidate.activity === 'socializing' || candidate.activity === 'commuting_social')
    )).length;
}

function compareVenueAccess(
    settler: Settler,
    a: { site: ResolvedJobSite; accessTile: Tile },
    b: { site: ResolvedJobSite; accessTile: Tile },
) {
    const distanceDelta = pathService.axialDistance(settler.q, settler.r, a.accessTile.q, a.accessTile.r)
        - pathService.axialDistance(settler.q, settler.r, b.accessTile.q, b.accessTile.r);
    if (distanceDelta !== 0) {
        return distanceDelta;
    }

    return compareResolvedSites(a.site, b.site);
}

function chooseSocialVenue(settler: Settler) {
    const pubs = listResolvedJobSites()
        .filter((site) => site.building.key === 'pub' && site.tile.discovered)
        .sort(compareResolvedSites);
    const venues: Array<{ site: ResolvedJobSite; accessTile: Tile }> = [];

    for (const site of pubs) {
        if (getPubWorkerCount(site.tile.id, settler.id) <= 0) {
            continue;
        }
        if (getPubVisitorCount(site.tile.id) >= Math.max(1, site.building.serviceCapacity ?? 3)) {
            continue;
        }
        const hasDrink = SOCIAL_DRINKS.some((drink) => getSocialDrinkAmount(getJobSiteSettlementId(site.tile), drink.type) > 0);
        if (!hasDrink) {
            continue;
        }

        const accessTile = getReachableWorkAccessTile(settler, site.tile);
        if (!accessTile) {
            continue;
        }

        venues.push({
            site,
            accessTile,
        });
    }

    return venues.sort((a, b) => compareVenueAccess(settler, a, b))[0] ?? null;
}

function tryStartSocializing(settler: Settler, pubTileId: string, now: number) {
    const preferredDrinks = getSettlerDrinkPriority(settler);
    if (isUnlimitedResourcesEnabled(testModeSettings)) {
        const chosenDrink = preferredDrinks[0] ?? SOCIAL_DRINKS[0]?.type ?? 'beer';
        settler.happiness = Math.min(SETTLER_MAX_HAPPINESS, settler.happiness + getSettlerDrinkHappinessGain(settler, chosenDrink));
        settler.socialTileId = pubTileId;
        return setActivity(settler, 'socializing', now) || true;
    }

    const settlementId = settler.settlementId;
    const prioritizedDrinks = preferredDrinks
        .map((drinkType) => SOCIAL_DRINKS.find((drink) => drink.type === drinkType))
        .filter((drink): drink is typeof SOCIAL_DRINKS[number] => !!drink);
    for (const drink of prioritizedDrinks) {
        const transfers = withdrawResourceAcrossStoragesForSettlement(settlementId, drink.type, 1);
        const amount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (amount < 1) {
            continue;
        }

        for (const transfer of transfers) {
            broadcastWithdrawal(settler, transfer.storageTileId, { type: drink.type, amount: transfer.amount });
        }

        settler.happiness = Math.min(SETTLER_MAX_HAPPINESS, settler.happiness + getSettlerDrinkHappinessGain(settler, drink.type));
        settler.socialTileId = pubTileId;
        return setActivity(settler, 'socializing', now) || true;
    }

    return false;
}

function maybeVisitPub(settler: Settler, now: number) {
    const venue = chooseSocialVenue(settler);
    if (!venue) {
        return false;
    }

    settler.socialTileId = venue.site.tile.id;
    if (settler.q === venue.accessTile.q && settler.r === venue.accessTile.r) {
        return tryStartSocializing(settler, venue.site.tile.id, now);
    }

    if (!startMovement(settler, venue.accessTile, 'commuting_social', now)) {
        return setWaiting(settler, now, { code: 'path_blocked', tileId: venue.accessTile.id }, {
            action: 'commute_social',
            pubTileId: venue.site.tile.id,
        });
    }

    return true;
}

function getTradeGoodAmount(settlementId: string | null | undefined, resourceType: typeof TRADE_GOOD_TYPES[number]) {
    const inventory = settlementId ? getSettlementResourceInventory(settlementId) : getEffectiveResourceInventory();
    return Math.max(0, inventory[resourceType] ?? 0);
}

function isHouseTile(tile: Tile | null | undefined): tile is Tile {
    return !!tile?.variant && (HOUSE_VARIANT_KEYS as readonly string[]).includes(tile.variant);
}

function getSettlerHomeHouse(settler: Settler) {
    const homeTile = tileIndex[settler.homeTileId] ?? null;
    return isHouseTile(homeTile) ? homeTile : null;
}

function getHouseTradeGoodAmount(homeTileId: string | null | undefined, resourceType: ResourceType) {
    const homeTile = homeTileId ? tileIndex[homeTileId] ?? null : null;
    if (!isHouseTile(homeTile)) {
        return 0;
    }

    return Math.max(0, homeTile.houseGoods?.[resourceType] ?? 0);
}

function hasTradeGoodAtHome(settler: Settler, resourceType: ResourceType) {
    return getHouseTradeGoodAmount(settler.homeTileId, resourceType) > 0;
}

function getHouseGoodTotal(tile: Tile | null | undefined) {
    if (!isHouseTile(tile)) {
        return 0;
    }

    return TRADE_GOOD_TYPES.reduce((sum, resourceType) => (
        sum + Math.max(0, tile.houseGoods?.[resourceType] ?? 0)
    ), 0);
}

function getHouseGoodSpace(tile: Tile | null | undefined) {
    return Math.max(0, getHouseGoodCapacityForTile(tile) - getHouseGoodTotal(tile));
}

function getShoppingGoodsForSettler(settler: Settler, settlementId: string | null | undefined) {
    const homeTile = getSettlerHomeHouse(settler);
    if (!homeTile || getHouseGoodSpace(homeTile) <= 0) {
        return [];
    }

    return [...TRADE_GOOD_TYPES]
        .filter((resourceType) => getTradeGoodHappinessGain(resourceType) > 0)
        .filter((resourceType) => !hasTradeGoodAtHome(settler, resourceType))
        .filter((resourceType) => isUnlimitedResourcesEnabled(testModeSettings) || getTradeGoodAmount(settlementId, resourceType) > 0)
        .sort((left, right) => getTradeGoodHappinessGain(right) - getTradeGoodHappinessGain(left));
}

function stockHouseGood(settler: Settler, resourceType: ResourceType, amount: number, now: number) {
    if (amount <= 0) {
        return false;
    }

    const homeTile = getSettlerHomeHouse(settler);
    if (!homeTile) {
        return false;
    }

    const stockAmount = Math.min(amount, getHouseGoodSpace(homeTile));
    if (stockAmount <= 0) {
        return false;
    }

    homeTile.houseGoods = {
        ...(homeTile.houseGoods ?? {}),
        [resourceType]: Math.max(0, homeTile.houseGoods?.[resourceType] ?? 0) + stockAmount,
    };
    homeTile.houseGoodsConsumedAtMs ??= now;
    broadcast({ type: 'tile:updated', tile: homeTile } satisfies TileUpdatedMessage);
    return true;
}

function chooseHouseGoodToConsume(tile: Tile) {
    return [...TRADE_GOOD_TYPES]
        .filter((resourceType) => Math.max(0, tile.houseGoods?.[resourceType] ?? 0) > 0)
        .sort((left, right) => getTradeGoodHappinessGain(right) - getTradeGoodHappinessGain(left))[0] ?? null;
}

function consumeHouseGoods(now: number) {
    let changed = false;

    for (const tile of Object.values(tileIndex)) {
        if (!isHouseTile(tile)) {
            continue;
        }

        const residents = settlers
            .filter((settler) => !isGuardSettler(settler) && settler.homeTileId === tile.id)
            .sort((left, right) => left.happiness - right.happiness || left.id.localeCompare(right.id));
        const resident = residents.find((candidate) => candidate.happiness < SETTLER_MAX_HAPPINESS);
        const lastConsumedAt = tile.houseGoodsConsumedAtMs ?? now;
        if (now - lastConsumedAt < getEffectiveSettlerCycleIntervalMs(HOUSE_GOOD_CONSUME_INTERVAL_MS)) {
            continue;
        }

        const stockedGood = chooseHouseGoodToConsume(tile);
        const comfortHappiness = getHouseComfortHappinessForTile(tile);
        if (!resident || (!stockedGood && comfortHappiness <= 0)) {
            tile.houseGoodsConsumedAtMs = now;
            continue;
        }

        if (stockedGood) {
            tile.houseGoods = {
                ...(tile.houseGoods ?? {}),
                [stockedGood]: Math.max(0, (tile.houseGoods?.[stockedGood] ?? 0) - 1),
            };
        }
        tile.houseGoodsConsumedAtMs = now;
        resident.happiness = Math.min(
            SETTLER_MAX_HAPPINESS,
            resident.happiness
                + (stockedGood ? getSettlerTradeGoodHappinessGain(resident, getTradeGoodHappinessGain(stockedGood)) : 0)
                + comfortHappiness,
        );
        if (stockedGood) {
            broadcast({ type: 'tile:updated', tile } satisfies TileUpdatedMessage);
        }
        changed = true;
    }

    return changed;
}

function getShopWorkerCount(tileId: string, excludeSettlerId?: string | null) {
    return settlers.filter((candidate) => (
        candidate.id !== excludeSettlerId
        && candidate.activity !== 'shopping'
        && candidate.activity !== 'commuting_shop'
        && candidate.activity !== 'sleeping'
        && candidate.assignedRole === 'job'
        && candidate.assignedWorkTileId === tileId
    )).length;
}

function getShopVisitorCount(tileId: string) {
    return settlers.filter((candidate) => (
        candidate.socialTileId === tileId
        && (candidate.activity === 'shopping' || candidate.activity === 'commuting_shop')
    )).length;
}

function chooseShopVenue(settler: Settler) {
    const shops = listResolvedJobSites()
        .filter((site) => site.building.key === 'shop' && site.tile.discovered)
        .sort(compareResolvedSites);
    const venues: Array<{ site: ResolvedJobSite; accessTile: Tile }> = [];

    for (const site of shops) {
        if (getShopWorkerCount(site.tile.id, settler.id) <= 0) {
            continue;
        }
        if (getShopVisitorCount(site.tile.id) >= Math.max(1, site.building.serviceCapacity ?? 3)) {
            continue;
        }
        const settlementId = getJobSiteSettlementId(site.tile);
        const shoppingGoods = getShoppingGoodsForSettler(settler, settlementId);
        if (shoppingGoods.length === 0) {
            continue;
        }

        const accessTile = getReachableWorkAccessTile(settler, site.tile);
        if (!accessTile) {
            continue;
        }

        venues.push({
            site,
            accessTile,
        });
    }

    return venues.sort((a, b) => compareVenueAccess(settler, a, b))[0] ?? null;
}

function tryStartShopping(settler: Settler, shopTileId: string, now: number) {
    const shopTile = tileIndex[shopTileId] ?? null;
    const settlementId = shopTile ? getJobSiteSettlementId(shopTile) : settler.settlementId;
    const goods = getShoppingGoodsForSettler(settler, settlementId);
    if (!goods.length) {
        return false;
    }

    if (isUnlimitedResourcesEnabled(testModeSettings)) {
        const chosenGood = goods[0]!;
        stockHouseGood(settler, chosenGood, 1, now);
        settler.socialTileId = shopTileId;
        return setActivity(settler, 'shopping', now) || true;
    }

    for (const resourceType of goods) {
        const transfers = withdrawResourceAcrossStoragesForSettlement(settler.settlementId, resourceType, 1);
        const amount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        if (amount < 1) {
            continue;
        }

        for (const transfer of transfers) {
            broadcastWithdrawal(settler, transfer.storageTileId, { type: resourceType, amount: transfer.amount });
        }

        stockHouseGood(settler, resourceType, 1, now);
        settler.socialTileId = shopTileId;
        return setActivity(settler, 'shopping', now) || true;
    }

    return false;
}

function maybeVisitShop(settler: Settler, now: number) {
    const venue = chooseShopVenue(settler);
    if (!venue) {
        return false;
    }

    settler.socialTileId = venue.site.tile.id;
    if (settler.q === venue.accessTile.q && settler.r === venue.accessTile.r) {
        return tryStartShopping(settler, venue.site.tile.id, now);
    }

    if (!startMovement(settler, venue.accessTile, 'commuting_shop', now)) {
        return setWaiting(settler, now, { code: 'path_blocked', tileId: venue.accessTile.id }, {
            action: 'commute_shop',
            shopTileId: venue.site.tile.id,
        });
    }

    return true;
}

function getSettlerShoppingPriorityThreshold(settler: Settler) {
    const shopThreshold = getSettlerShopThreshold(settler);
    if (hasSettlerTrait(settler, 'frugal')) {
        return shopThreshold;
    }

    return Math.max(shopThreshold, getSettlerSocialThreshold(settler));
}

function maybeDeliverOutput(settler: Settler, now: number) {
    if (settler.carryingKind !== 'output' || !settler.carryingPayload) {
        return false;
    }

    const { storage, blockedStorage } = chooseReachableWarehouseWithCapacity(settler, settler.carryingPayload.amount);
    const fallbackStorage = storage ? null : chooseReachableWarehouseWithCapacity(settler, 1);
    const deliveryStorage = storage ?? fallbackStorage?.storage ?? null;
    if (!deliveryStorage) {
        if (blockedStorage || fallbackStorage?.blockedStorage) {
            return setWaiting(settler, now, {
                code: 'path_blocked',
                resourceType: settler.carryingPayload.type,
                amount: settler.carryingPayload.amount,
                tileId: (blockedStorage ?? fallbackStorage?.blockedStorage)?.id,
            }, {
                action: 'deliver_output',
                blockedStorageTileId: (blockedStorage ?? fallbackStorage?.blockedStorage)?.id ?? null,
                requiredFreeCapacity: settler.carryingPayload.amount,
            });
        }

        return setWaiting(settler, now, {
            code: 'storage_full',
            resourceType: settler.carryingPayload.type,
            amount: settler.carryingPayload.amount,
        });
    }

    if (settler.q === deliveryStorage.q && settler.r === deliveryStorage.r) {
        return handleStorageArrival(settler, deliveryStorage, now);
    }

    if (!startMovement(settler, deliveryStorage, 'delivering', now)) {
        return setWaiting(settler, now, {
            code: 'path_blocked',
            resourceType: settler.carryingPayload.type,
            amount: settler.carryingPayload.amount,
            tileId: deliveryStorage.id,
        }, {
            action: 'deliver_output',
            targetStorageTileId: deliveryStorage.id,
            requiredFreeCapacity: settler.carryingPayload.amount,
        });
    }

    return true;
}

function maybeFetchInput(settler: Settler, now: number) {
    const input = getAssignedInput(settler);
    if (!input) {
        return false;
    }

    if (isUnlimitedResourcesEnabled(testModeSettings)) {
        settler.carryingPayload = { type: input.type, amount: input.amount };
        settler.carryingKind = 'input';
        return setActivity(settler, 'idle', now) || true;
    }

    if (
        settler.carryingKind === 'input'
        && settler.carryingPayload?.type === input.type
        && settler.carryingPayload.amount >= input.amount
    ) {
        return false;
    }

    const { storage, blockedStorage } = chooseReachableWarehouseWithResource(settler, input);
    if (!storage) {
        if (blockedStorage) {
            return setWaiting(settler, now, {
                code: 'path_blocked',
                resourceType: input.type,
                amount: input.amount,
                tileId: blockedStorage.id,
            }, {
                action: settler.assignedRole === 'repair' ? 'fetch_repair_input' : 'fetch_job_input',
                blockedStorageTileId: blockedStorage.id,
                assignedWorkTileId: settler.assignedWorkTileId,
            });
        }

        return setWaiting(settler, now, {
            code: settler.assignedRole === 'repair' ? 'missing_repair_material' : 'missing_input',
            resourceType: input.type,
            amount: input.amount,
            tileId: settler.assignedWorkTileId ?? undefined,
        });
    }

    if (settler.q === storage.q && settler.r === storage.r) {
        return handleStorageArrival(settler, storage, now);
    }

    if (!startMovement(settler, storage, 'fetching_input', now)) {
        return setWaiting(settler, now, {
            code: 'path_blocked',
            resourceType: input.type,
            amount: input.amount,
            tileId: storage.id,
        }, {
            action: settler.assignedRole === 'repair' ? 'fetch_repair_input' : 'fetch_job_input',
            targetStorageTileId: storage.id,
            assignedWorkTileId: settler.assignedWorkTileId,
        });
    }

    return true;
}

function completeWorkCycle(settler: Settler, now: number) {
    const siteInfo = getSiteInputsOutputs(settler);
    if (siteInfo?.site.building.jobKind === 'study') {
        const settlementId = getJobSiteSettlementId(siteInfo.site.tile);
        const completedStudy = addStudyProgress(siteInfo.site.building.cycleMs ?? SETTLER_MEAL_INTERVAL_MS, settlementId);
        settler.workProgressMs = 0;
        broadcastStudyState(settlementId);
        if (completedStudy) {
            emitGameplayEvent({
                type: 'study:completed',
                studyKey: completedStudy.key,
            });
        }

        if (hasActiveStudy(settlementId)) {
            setActivity(settler, 'working', now);
            return true;
        }

        setWaiting(settler, now, { code: 'no_work', tileId: settler.assignedWorkTileId ?? undefined });
        return true;
    }

    if (siteInfo?.site.building.jobKind === 'service') {
        settler.workProgressMs = 0;
        setActivity(settler, 'working', now);
        return true;
    }

    if (!siteInfo?.output || siteInfo.output.amount <= 0) {
        const progressReset = resetSettlerWorkProgress(settler);
        return setWaiting(settler, now, { code: 'resource_depleted', tileId: settler.assignedWorkTileId ?? undefined }) || progressReset;
    }

    const missingInput = getMissingStoredCycleInput(siteInfo, settler);
    if (missingInput) {
        return setWaiting(settler, now, {
            code: 'missing_input',
            resourceType: missingInput.type,
            amount: missingInput.amount,
            tileId: settler.assignedWorkTileId ?? undefined,
        });
    }

    if (!withdrawStoredCycleInputs(settler, siteInfo)) {
        return setWaiting(settler, now, { code: 'missing_input', tileId: settler.assignedWorkTileId ?? undefined });
    }

    if (settler.carryingKind === 'input') {
        settler.carryingPayload = undefined;
        settler.carryingKind = null;
    }

    settler.workProgressMs = 0;
    settler.carryingPayload = cloneResource(siteInfo.output) ?? undefined;
    settler.carryingKind = settler.carryingPayload ? 'output' : null;
    if (consumeTileProductionBoost(siteInfo.site.tile)) {
        broadcast({ type: 'tile:updated', tile: siteInfo.site.tile } as TileUpdatedMessage);
    }

    return maybeDeliverOutput(settler, now) || setActivity(settler, 'delivering', now);
}

function maybeWork(settler: Settler, now: number, dt: number) {
    if (settler.assignedRole === 'guard') {
        const accessTile = getAssignedWorkTile(settler);
        const tower = getGuardTower(settler);
        if (!accessTile || !tower || !isRaidableMilitaryTarget(tower)) {
            clearSettlerAssignment(settler);
            return false;
        }

        if (settler.q !== accessTile.q || settler.r !== accessTile.r) {
            if (!startMovement(settler, accessTile, 'commuting_work', now)) {
                return setWaiting(settler, now, { code: 'path_blocked', tileId: accessTile.id }, {
                    action: isRaidSettler(settler) ? 'commute_raid' : 'commute_guard',
                    targetAccessTileId: accessTile.id,
                    towerTileId: tower.id,
                });
            }
            return true;
        }

        refreshSettlerWorkPresentation(settler);
        if (isRaidSettler(settler)) {
            return setActivity(settler, 'raiding', now) || true;
        }
        if (isGuardTowerUnderAttack(settler)) {
            return setActivity(settler, 'defending', now) || true;
        }
        return setActivity(settler, 'idle', now) || true;
    }

    if (settler.assignedRole === 'repair') {
        const workTile = getAssignedWorkTile(settler);
        const repairInput = getRepairInput(settler);
        const accessTile = getWorkAccessTile(settler, workTile);

        if (!workTile || !accessTile || getRepairNeededAmount(workTile) <= 0) {
            clearSettlerAssignment(settler);
            return false;
        }

        if (repairInput) {
            const hasInput = settler.carryingKind === 'input'
                && settler.carryingPayload?.type === repairInput.type
                && settler.carryingPayload.amount >= repairInput.amount;

            if (!hasInput) {
                return maybeFetchInput(settler, now);
            }
        }

        if (settler.q !== accessTile.q || settler.r !== accessTile.r) {
            if (!startMovement(settler, accessTile, 'commuting_work', now)) {
                return setWaiting(settler, now, { code: 'path_blocked', tileId: accessTile.id }, {
                    action: 'commute_repair',
                    targetAccessTileId: accessTile.id,
                    assignedWorkTileId: workTile.id,
                });
            }
            return true;
        }

        refreshSettlerWorkPresentation(settler);
        setActivity(settler, 'repairing', now);
        settler.workProgressMs += getEffectiveSettlerCycleProgress(dt);

        if (settler.workProgressMs < REPAIR_CYCLE_MS) {
            return true;
        }

        return completeRepairCycle(settler, workTile, now);
    }

    const siteInfo = getSiteInputsOutputs(settler);
    const workTile = siteInfo?.site.tile ?? null;
    const accessTile = getWorkAccessTile(settler, workTile);

    if (!siteInfo || !accessTile || !workTile || !isTileActive(workTile) || isBuildingOfflineFromCondition(workTile)) {
        if (settler.assignedWorkTileId && (isBuildingOfflineFromCondition(workTile) || !isTileActive(workTile))) {
            const progressReset = resetSettlerWorkProgress(settler);
            return setWaiting(settler, now, { code: 'site_offline', tileId: settler.assignedWorkTileId }) || progressReset;
        }
        clearSettlerAssignment(settler);
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
        if (!startMovement(settler, accessTile, 'commuting_work', now)) {
            return setWaiting(settler, now, { code: 'path_blocked', tileId: accessTile.id }, {
                action: 'commute_job',
                targetAccessTileId: accessTile.id,
                assignedWorkTileId: workTile.id,
            });
        }
        return true;
    }

    refreshSettlerWorkPresentation(settler);
    setActivity(settler, 'working', now);
    const happinessMultiplier = settler.happiness >= 80
        ? 1.1
        : settler.happiness >= 50
            ? 1
            : settler.happiness >= 20
                ? 0.8
                : 0.6;
    settler.workProgressMs += getEffectiveSettlerCycleProgress(dt) * happinessMultiplier;

    if (settler.workProgressMs < Math.max(1, siteInfo.site.building.cycleMs ?? SETTLER_MEAL_INTERVAL_MS)) {
        return true;
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

    if (
        canUseWarehouseAtTile(tile)
        || (settler.activity === 'fetching_food' && canUseWarehouseAtTile(tile, { allowInactive: true }))
    ) {
        return handleStorageArrival(settler, tile, now);
    }

    if (settler.socialTileId && tile.id === settler.socialTileId) {
        if (settler.activity === 'commuting_shop' || settler.activity === 'shopping') {
            return tryStartShopping(settler, tile.id, now);
        }
        return tryStartSocializing(settler, tile.id, now);
    }

    if (tile.id === settler.homeAccessTileId) {
        if (needsSleep(settler)) {
            return setActivity(settler, 'sleeping', now);
        }

        return setActivity(settler, 'idle', now);
    }

    if (tile.id === settler.assignedWorkTileId) {
        refreshSettlerWorkPresentation(settler);
        return setActivity(settler, settler.assignedRole === 'repair' ? 'repairing' : 'working', now);
    }

    return false;
}

function planSettler(settler: Settler, now: number, dt: number) {
    if (isGuardSettler(settler)) {
        return maybeWork(settler, now, dt) || maybeIdleAtHome(settler, now);
    }

    if (settler.carryingKind === 'output') {
        if (maybeDeliverOutput(settler, now)) {
            return true;
        }

        // A full warehouse or missing delivery route is still an active blocker, not idle time.
        if (settler.activity === 'waiting') {
            return false;
        }
    }

    const hungry = needsFood(settler);
    const starving = getStarvationMs(settler) > 0;
    const storedFood = isHungerBypassEnabled(testModeSettings)
        || getHungerFoodMealValue(settler.settlementId ? getSettlementResourceInventory(settler.settlementId) : getEffectiveResourceInventory()) >= FOOD_PER_SETTLER_PER_MINUTE;

    if (hungry && storedFood && maybeFetchFood(settler, now)) {
        return true;
    }

    if (needsSleep(settler) && maybeStartSleep(settler, now)) {
        return true;
    }

    if (settler.happiness <= getSettlerShoppingPriorityThreshold(settler) && maybeVisitShop(settler, now)) {
        return true;
    }

    if (settler.happiness <= getSettlerSocialThreshold(settler) && maybeVisitPub(settler, now)) {
        return true;
    }

    if (hungry && !storedFood && starving && !canProduceFood(settler)) {
        return maybeIdleAtHome(settler, now);
    }

    if (maybeWork(settler, now, dt)) {
        return true;
    }

    // Missing job/repair inputs can leave an assigned settler waiting. Keep that stable instead of
    // bouncing through idle each tick while the resource shortage remains.
    if (settler.activity === 'waiting' && settler.assignedWorkTileId) {
        return false;
    }

    return maybeIdleAtHome(settler, now);
}

function applyNeeds(settler: Settler, dt: number) {
    if (isMoraleBypassEnabled(testModeSettings)) {
        settler.happiness = SETTLER_MAX_HAPPINESS;
    } else {
        const happinessDt = getEffectiveSettlerHappinessProgress(dt);
        settler.happiness = Math.max(0, settler.happiness - ((happinessDt / SETTLER_HAPPINESS_DECAY_MS) * getSettlerHappinessDecayMultiplier(settler)));
    }

    if (isHungerBypassEnabled(testModeSettings)) {
        settler.hungerMs = 0;
        if (settler.activity !== 'sleeping') {
            settler.fatigueMs += dt;
        }
        return;
    }

    settler.hungerMs += dt * getSettlerHungerRateMultiplier(settler);

    if (settler.activity === 'sleeping') {
        return;
    }

    const fatigueMultiplier = settler.activity === 'working' || settler.activity === 'repairing'
        ? getSettlerWorkFatigueMultiplier(settler)
        : 1;
    settler.fatigueMs += dt * fatigueMultiplier;
}

function updateSleeping(settler: Settler, now: number) {
    if (settler.activity !== 'sleeping') {
        return false;
    }

    if (now - settler.stateSinceMs < SETTLER_SLEEP_MS * getSettlerSleepDurationMultiplier(settler)) {
        return true;
    }

    settler.fatigueMs = 0;
    setActivity(settler, 'idle', now);
    return false;
}

function updateSocializing(settler: Settler, now: number) {
    if (settler.activity !== 'socializing') {
        return false;
    }

    if (now - settler.stateSinceMs < getEffectiveSettlerCycleIntervalMs(SETTLER_SOCIAL_VISIT_MS)) {
        return true;
    }

    settler.socialTileId = null;
    setActivity(settler, 'idle', now);
    return false;
}

function updateShopping(settler: Settler, now: number) {
    if (settler.activity !== 'shopping') {
        return false;
    }

    if (now - settler.stateSinceMs < getEffectiveSettlerCycleIntervalMs(SETTLER_SHOP_VISIT_MS)) {
        return true;
    }

    settler.socialTileId = null;
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
        if (isGuardSettler(settler)) {
            return worst;
        }
        return Math.max(worst, getStarvationMs(settler));
    }, 0);
}

function computeHungerMsBySettlement() {
    const bySettlement = new Map<string, number>();
    for (const settler of settlers) {
        if (isGuardSettler(settler) || !settler.settlementId) {
            continue;
        }
        bySettlement.set(
            settler.settlementId,
            Math.max(bySettlement.get(settler.settlementId) ?? 0, getStarvationMs(settler)),
        );
    }
    return bySettlement;
}

function broadcastPopulationIncident(message: Omit<PopulationIncidentMessage, 'type' | 'timestamp'>) {
    broadcast({
        type: 'population:incident',
        timestamp: Date.now(),
        ...message,
    } satisfies PopulationIncidentMessage);
}

function getStarvationSettlementKey(settlementId: string | null | undefined) {
    return settlementId ?? '__unsettled__';
}

function canLoseSettlerToStarvation(settlementId: string | null | undefined, now: number) {
    const lastLossMs = lastStarvationLossMsBySettlement.get(getStarvationSettlementKey(settlementId));
    return typeof lastLossMs !== 'number' || now - lastLossMs >= SETTLER_STARVATION_DEATH_INTERVAL_MS;
}

function recordStarvationLoss(settlementId: string | null | undefined, now: number) {
    lastStarvationLossMsBySettlement.set(getStarvationSettlementKey(settlementId), now);
}

function compareStarvationCandidates(left: StarvationCandidate, right: StarvationCandidate) {
    if (left.canProduceFood !== right.canProduceFood) {
        return left.canProduceFood ? 1 : -1;
    }

    const starvationDelta = right.starvationMs - left.starvationMs;
    if (starvationDelta !== 0) {
        return starvationDelta;
    }

    return left.id.localeCompare(right.id);
}

function selectStarvationLosses(candidates: StarvationCandidate[], now: number) {
    const bySettlement = new Map<string, StarvationCandidate[]>();
    for (const candidate of candidates) {
        if (!canLoseSettlerToStarvation(candidate.settlementId, now)) {
            continue;
        }

        const key = getStarvationSettlementKey(candidate.settlementId);
        const settlementCandidates = bySettlement.get(key) ?? [];
        settlementCandidates.push(candidate);
        bySettlement.set(key, settlementCandidates);
    }

    const selected: StarvationCandidate[] = [];
    for (const settlementCandidates of bySettlement.values()) {
        settlementCandidates.sort(compareStarvationCandidates);
        const candidate = settlementCandidates[0];
        if (candidate) {
            selected.push(candidate);
        }
    }

    return selected;
}

function tryGrowPopulation(now: number) {
    const population = getPopulationState();
    if (population.settlements.length > 0) {
        const candidates = population.settlements
            .filter((entry) => entry.current < entry.max && entry.current < entry.beds)
            .sort((left, right) => left.settlementId.localeCompare(right.settlementId))
            .filter((entry) => {
                const currentFood = getHungerFoodMealValue(getSettlementResourceInventory(entry.settlementId));
                const foodNeededNow = entry.current * FOOD_PER_SETTLER_PER_MINUTE;
                const foodNeededNext = (entry.current + 1) * FOOD_PER_SETTLER_PER_MINUTE;
                return currentFood >= foodNeededNow + foodNeededNext;
            });

        for (const settlement of candidates) {
            if (now - (lastGrowthCheckMsPerSettlement[settlement.settlementId] ?? 0) < getEffectivePopulationGrowthIntervalMs()) {
                continue;
            }

            lastGrowthCheckMsPerSettlement[settlement.settlementId] = now;
            const grew = growPopulation(settlement.settlementId);
            if (grew) {
                emitGameplayEvent({ type: 'population:changed', settlementId: settlement.settlementId });
            }
            return grew;
        }

        return false;
    }

    if (population.current >= population.max || population.current >= population.beds) {
        return false;
    }

    const currentFood = getHungerFoodMealValue(getEffectiveResourceInventory());
    const foodNeededNow = population.current * FOOD_PER_SETTLER_PER_MINUTE;
    const foodNeededNext = (population.current + 1) * FOOD_PER_SETTLER_PER_MINUTE;
    if (currentFood < foodNeededNow + foodNeededNext) {
        return false;
    }

    const grew = growPopulation();
    if (grew) {
        emitGameplayEvent({ type: 'population:changed', settlementId: null });
    }
    return grew;
}

export const settlerSystem = {
    name: 'settlers',

    init: () => {
        refreshSettlerIdCounter();
        lastGrowthCheckMsPerSettlement = {};
        lastStarvationLossMsBySettlement = new Map();
        settlerRouteCache.clear();
        settlerReachabilityFailureCache.clear();
        settlerPlanningCache.clear();
        sharedSettlerRouteCache.clear();
        sharedSettlerReachabilityFailureCache.clear();
        settlerComponentCache.clear();
        currentSettlerTickNow = 0;
        resetSettlerBroadcastThrottle();
        resetPopulationBroadcastThrottle();
    },

    tick: (ctx: TickContext) => {
        currentSettlerTickNow = ctx.now;
        refreshSettlerIdCounter();
        let changed = false;
        changed = ensureSettlerNameSeeds(ctx.now) || changed;
        changed = ensureSettlerProfiles() || changed;

        changed = tryGrowPopulation(ctx.now) || changed;
        changed = syncSettlerPopulation(ctx.now) || changed;
        changed = reconcileHomes() || changed;
        changed = reconcileAssignments() || changed;
        changed = reconcileMilitaryGuards(ctx.now) || changed;

        const starvationCandidates: StarvationCandidate[] = [];

        for (const settler of settlers) {
            const justArrived = updateMovement(settler, ctx.now);
            changed = justArrived || changed;

            if (isGuardSettler(settler)) {
                if (settler.movement) {
                    continue;
                }
                changed = planSettler(settler, ctx.now, ctx.dt) || changed;
                continue;
            }

            applyNeeds(settler, ctx.dt);

            const starvationMs = getStarvationMs(settler);
            if (starvationMs >= SETTLER_STARVATION_MS) {
                if (tryEatFromSettlementStorage(settler)) {
                    changed = true;
                } else {
                    starvationCandidates.push({
                        id: settler.id,
                        settlementId: settler.settlementId,
                        starvationMs,
                        canProduceFood: canProduceFood(settler),
                    });
                }
            }

            if (settler.movement) {
                continue;
            }

            if (updateSleeping(settler, ctx.now)) {
                continue;
            }

            if (updateSocializing(settler, ctx.now)) {
                continue;
            }

            if (updateShopping(settler, ctx.now)) {
                continue;
            }

            if (!shouldRunSettlerPlanning(settler, ctx.now, justArrived)) {
                deferSettlerPlanning(settler, ctx.dt);
                continue;
            }

            changed = planSettler(settler, ctx.now, consumeSettlerPlanningDt(settler, ctx.dt)) || changed;
            scheduleNextSettlerPlanning(settler, ctx.now);
        }

        const eligibleStarvationCandidates: StarvationCandidate[] = [];
        for (const candidate of starvationCandidates) {
            const settler = settlers.find((entry) => entry.id === candidate.id);
            if (!settler) {
                continue;
            }

            const starvationMs = getStarvationMs(settler);
            if (starvationMs < SETTLER_STARVATION_MS) {
                continue;
            }

            if (tryEatFromSettlementStorage(settler)) {
                changed = true;
                continue;
            }

            eligibleStarvationCandidates.push({
                id: settler.id,
                settlementId: settler.settlementId,
                starvationMs,
                canProduceFood: canProduceFood(settler),
            });
        }

        const starvationLossBySettlement = new Map<string | null, number>();
        const settlersToKill = selectStarvationLosses(eligibleStarvationCandidates, ctx.now);
        for (const settler of settlersToKill) {
            if (removeSettler(settler.id)) {
                changed = true;
                killSettler(settler.settlementId);
                recordStarvationLoss(settler.settlementId, ctx.now);
                emitGameplayEvent({ type: 'population:changed', settlementId: settler.settlementId });
                starvationLossBySettlement.set(
                    settler.settlementId,
                    (starvationLossBySettlement.get(settler.settlementId) ?? 0) + 1,
                );
            }
        }

        for (const [settlementId, populationLoss] of starvationLossBySettlement.entries()) {
            broadcastPopulationIncident({
                settlementId,
                severity: 'critical',
                reason: 'starvation',
                title: 'Settlers lost to hunger',
                message: `${populationLoss} settler${populationLoss === 1 ? '' : 's'} died because they could not reach edible meals. Only bread, meat, and fish count as hunger food; drinks and crops do not.`,
                populationLoss,
            });
        }

        changed = syncSettlerPopulation(ctx.now) || changed;

        changed = consumeHouseGoods(ctx.now) || changed;

        const population = getPopulationState();
        let hungerChanged = false;
        if (population.settlements.length > 0) {
            const hungerBySettlement = computeHungerMsBySettlement();
            for (const settlement of population.settlements) {
                hungerChanged = setSettlementHungerMs(settlement.settlementId, hungerBySettlement.get(settlement.settlementId) ?? 0) || hungerChanged;
            }
        } else {
            const nextHunger = computeColonyHungerMs();
            hungerChanged = setHungerMs(nextHunger);
        }
        if (hungerChanged) {
            populationBroadcastPending = true;
            changed = true;
        }
        if (populationBroadcastPending) {
            queuePopulationBroadcast(ctx.now);
        }

        if (changed) {
            settlerBroadcastPending = true;
        }
        if (settlerBroadcastPending) {
            queueSettlerBroadcast(ctx.now);
        }
    },
};
