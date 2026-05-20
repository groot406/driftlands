import { discoverTile, ensureTileExists, startWorldGeneration, tiles, tileIndex } from '../../src/shared/game/world';
import { heroes, loadHeroes } from "../../src/shared/game/state/heroStore";
import { loadTasks, taskStore } from "../../src/shared/game/state/taskStore";
import {
  depositResourceToStorage,
  getStorageUsedCapacity,
  listSettlementResourceSnapshots,
  listStorageSnapshots,
  resetResourceState,
  resourceInventory,
} from "../../src/shared/game/state/resourceStore";
import { getWorkforceSnapshot, resetWorkforceState } from '../../src/shared/game/state/jobStore';
import { getStudySnapshot, resetStudyState } from '../../src/store/studyStore';
import {
  broadcastPopulationState,
  getPopulationSnapshot,
  getPopulationBySettlementInput,
  getPopulationState,
  initializePopulation,
  initializeSettlementPopulation,
  recalculatePopulationLimits,
  resetPopulationState,
} from "../../src/shared/game/state/populationStore";
import { getSettlerSnapshot, loadSettlers, resetSettlerState } from '../../src/shared/game/state/settlerStore';
import { recalculateSettlementSupport, resetSettlementSupportState } from '../../src/shared/game/state/settlementSupportStore';
import { setSupportMetrics } from '../../src/shared/game/state/populationStore';
import type { Tile } from "../../src/shared/game/types/Tile";
import type { Hero } from "../../src/shared/game/types/Hero";
import type { Settler } from '../../src/shared/game/types/Settler';
import type { TaskInstance } from "../../src/shared/game/types/Task";
import type { ResourceAmount, ResourceType } from "../../src/shared/game/types/Resource";
import type { StorageSnapshot } from '../../src/shared/game/storage';
import type { PopulationSnapshot } from '../../src/store/populationStore';
import type { WorkforceSnapshot } from '../../src/store/jobStore';
import type { StudyStateSnapshot } from '../../src/store/studyStore';
import { runState } from "./state/runState";
import { resetMineReserveState } from './state/mineReserveState';
import { loadStoryProgression, resetStoryProgression } from '../../src/shared/story/progressionState';
import { createInitialProgressionSnapshot } from '../../src/shared/story/progression';
import { tickEngine } from './tick';
import { syncSettlerPopulation } from './systems/settlerSystem';
import { resetCalamitySystem } from './systems/calamitySystem';
import { promoteTileToTowncenter } from '../../src/shared/buildings/registry';
import { broadcastGameMessage as broadcast } from '../../src/shared/game/runtime';
import { createHeroFromTemplate, type StoryHeroId } from '../../src/shared/story/heroRoster';
import type { HeroRosterUpdateMessage, ResourceDepositMessage, TileUpdatedMessage } from '../../src/shared/protocol';
import type { LooperlandsHeroSelection } from '../../src/shared/looperlands';
import {
  ensureBarracksMilitaryState,
  ensureTownCenterMilitaryState,
  ensureWatchtowerMilitaryState,
} from '../../src/shared/game/military.ts';
import { playerSettlementState } from './state/playerSettlementState';
import { marketState } from './state/marketState';
import type { MarketOverviewSnapshot } from '../../src/shared/game/market';
import { shipOrderState } from './state/shipOrderState';
import type { ShipOrderOverviewSnapshot } from '../../src/shared/game/shipOrders';

const STARTING_BREAD = 4;
const STARTING_FISH = 4;
const STARTING_MEAT = 4;
const SETTLEMENT_START_REVEAL_RADIUS = 3;
const SETTLEMENT_STARTER_RESOURCES: ResourceAmount[] = [
  { type: 'bread', amount: STARTING_BREAD },
  { type: 'fish', amount: STARTING_FISH },
  { type: 'meat', amount: STARTING_MEAT },
];
const SETTLEMENT_STARTER_HERO_TEMPLATES: StoryHeroId[] = ['h2', 'h5', 'h3', 'h4', 'h1'];
const MAX_UINT32 = 0xffffffff;
const SETTLEMENT_STARTER_HERO_COUNT = 2;
const DEFAULT_WORLD_DISCOVER_RADIUS = 1;
// Keep debug restarts below snapshot sizes that can overwhelm the dev server.
const MAX_WORLD_DISCOVER_RADIUS = 64;

function normalizeSeed(seed: number | null | undefined) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    return null;
  }

  const truncated = Math.trunc(seed);
  return ((truncated % (MAX_UINT32 + 1)) + (MAX_UINT32 + 1)) % (MAX_UINT32 + 1);
}

function resolveConfiguredSeed() {
  const rawSeed = process.env.SERVER_SEED;
  if (!rawSeed?.trim()) {
    return null;
  }

  return normalizeSeed(Number.parseInt(rawSeed, 10));
}

function createRandomSeed() {
  return Math.floor(Math.random() * (MAX_UINT32 + 1));
}

function normalizeWorldRadius(radius: number | null | undefined) {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return DEFAULT_WORLD_DISCOVER_RADIUS;
  }

  return Math.min(MAX_WORLD_DISCOVER_RADIUS, Math.max(DEFAULT_WORLD_DISCOVER_RADIUS, Math.trunc(radius)));
}

function serializeTile(tile: Tile): Tile {
  return {
    id: tile.id,
    q: tile.q,
    r: tile.r,
    biome: tile.biome,
    terrain: tile.terrain,
    discovered: tile.discovered,
    scouted: tile.scouted,
    scoutedForResource: tile.scoutedForResource ?? null,
    scoutedResourceTypes: tile.scoutedResourceTypes?.slice(),
    scoutFoundResource: tile.scoutFoundResource ?? null,
    isBaseTile: tile.isBaseTile,
    variant: tile.variant ?? null,
    variantSetMs: tile.variantSetMs,
    variantAgeMs: tile.variantAgeMs,
    fencedEdges: tile.fencedEdges ? { ...tile.fencedEdges } : undefined,
    ownerSettlementId: tile.ownerSettlementId ?? null,
    controlledBySettlementId: tile.controlledBySettlementId ?? null,
    activationState: tile.activationState ?? null,
    supportBand: tile.supportBand ?? null,
    jobSiteEnabled: tile.jobSiteEnabled ?? null,
    condition: tile.condition ?? null,
    conditionState: tile.conditionState ?? null,
    lastConditionUpdateMs: tile.lastConditionUpdateMs ?? null,
    modifier: tile.modifier ?? null,
    modifierRevealed: !!tile.modifier,
    special: tile.special ?? null,
    specialRevealed: !!tile.special,
    specialActivated: tile.specialActivated ?? false,
    conditionStabilizedUntilMs: tile.conditionStabilizedUntilMs ?? null,
    nextProductionBoostMultiplier: tile.nextProductionBoostMultiplier ?? null,
    nextProductionBoostCyclesRemaining: tile.nextProductionBoostCyclesRemaining ?? null,
    nextProductionBoostInputReduction: tile.nextProductionBoostInputReduction ?? null,
    borderMode: tile.borderMode ?? null,
    borderModeCooldownUntilMs: tile.borderModeCooldownUntilMs ?? null,
    borderLockedUntilMs: tile.borderLockedUntilMs ?? null,
    guardReserve: tile.guardReserve ?? null,
    raidTargetTileId: tile.raidTargetTileId ?? null,
    raidCommittedGuards: tile.raidCommittedGuards ?? null,
    raidBlockedReason: tile.raidBlockedReason ?? null,
    towerDurability: tile.towerDurability ?? null,
    towerDurabilityMax: tile.towerDurabilityMax ?? null,
    towerCaptureProgress: tile.towerCaptureProgress ?? null,
    towerConflictState: tile.towerConflictState ?? null,
    towerAttackerSettlementId: tile.towerAttackerSettlementId ?? null,
    towerAssignedGuards: tile.towerAssignedGuards ?? null,
    towerWallLevel: tile.towerWallLevel ?? null,
    towerAttackerCasualtyProgress: tile.towerAttackerCasualtyProgress ?? null,
    towerDefenderCasualtyProgress: tile.towerDefenderCasualtyProgress ?? null,
    barracksTrainingQueue: tile.barracksTrainingQueue ?? null,
    barracksTrainingProgressMs: tile.barracksTrainingProgressMs ?? null,
    houseGoods: tile.houseGoods ? { ...tile.houseGoods } : undefined,
    houseGoodsConsumedAtMs: tile.houseGoodsConsumedAtMs ?? null,
  };
}

function serializeHero(hero: Hero): Hero {
  return {
    id: hero.id,
    name: hero.name,
    avatar: hero.avatar,
    avatarSource: hero.avatarSource,
    avatarSpriteUrl: hero.avatarSpriteUrl,
    avatarFallbackSpriteUrl: hero.avatarFallbackSpriteUrl,
    avatarNftId: hero.avatarNftId,
    avatarTokenHash: hero.avatarTokenHash,
    storyTemplateId: hero.storyTemplateId ?? null,
    playerId: hero.playerId,
    playerName: hero.playerName,
    settlementId: hero.settlementId ?? null,
    q: hero.q,
    r: hero.r,
    stats: { ...hero.stats },
    xpChargeProgress: hero.xpChargeProgress ?? 0,
    abilityCharges: hero.abilityCharges ?? 0,
    abilityChargesEarned: hero.abilityChargesEarned ?? 0,
    skillPoints: hero.skillPoints ?? 0,
    skillPointsEarned: hero.skillPointsEarned ?? 0,
    skills: { ...(hero.skills ?? {}) },
    facing: hero.facing,
    movement: hero.movement
      ? {
          path: hero.movement.path.map((step) => ({ ...step })),
          origin: { ...hero.movement.origin },
          target: { ...hero.movement.target },
          startMs: hero.movement.startMs,
          stepDurations: hero.movement.stepDurations.slice(),
          cumulative: hero.movement.cumulative.slice(),
          taskType: hero.movement.taskType,
          requestId: hero.movement.requestId,
          authoritative: hero.movement.authoritative,
        }
      : undefined,
    currentTaskId: hero.currentTaskId,
    pendingTask: hero.pendingTask ? { ...hero.pendingTask } : undefined,
    pendingExploreTarget: hero.pendingExploreTarget ? { ...hero.pendingExploreTarget } : undefined,
    scoutResourceIntent: hero.scoutResourceIntent ? { ...hero.scoutResourceIntent } : undefined,
    carryingPayload: hero.carryingPayload ? { ...hero.carryingPayload } : undefined,
    pendingChain: hero.pendingChain ? { ...hero.pendingChain } : undefined,
    returnPos: hero.returnPos ? { ...hero.returnPos } : undefined,
  };
}

function serializeTask(task: TaskInstance): TaskInstance {
  return {
    id: task.id,
    type: task.type,
    tileId: task.tileId,
    progressXp: task.progressXp,
    requiredXp: task.requiredXp,
    createdMs: task.createdMs,
    lastUpdateMs: task.lastUpdateMs,
    completedMs: task.completedMs,
    participants: { ...task.participants },
    active: task.active,
    requiredResources: task.requiredResources?.map((resource) => ({ ...resource })),
    collectedResources: task.collectedResources?.map((resource) => ({ ...resource })),
    context: task.context ? { ...task.context } : undefined,
  };
}

function serializeSettler(settler: Settler): Settler {
  return {
    id: settler.id,
    nameSeed: settler.nameSeed,
    gender: settler.gender,
    q: settler.q,
    r: settler.r,
    facing: settler.facing,
    appearanceSeed: settler.appearanceSeed,
    homeTileId: settler.homeTileId,
    homeAccessTileId: settler.homeAccessTileId,
    settlementId: settler.settlementId ?? null,
    assignedWorkTileId: settler.assignedWorkTileId ?? null,
    assignedRole: settler.assignedRole ?? null,
    guardTowerTileId: settler.guardTowerTileId ?? null,
    workTileId: settler.workTileId ?? null,
    hiddenWhileWorking: settler.hiddenWhileWorking ?? null,
    activity: settler.activity,
    blockerReason: settler.blockerReason ? { ...settler.blockerReason } : null,
    stateSinceMs: settler.stateSinceMs,
    hungerMs: settler.hungerMs,
    fatigueMs: settler.fatigueMs,
    happiness: settler.happiness,
    traits: settler.traits ? [...settler.traits] : undefined,
    drinkPreference: settler.drinkPreference,
    workProgressMs: settler.workProgressMs,
    carryingKind: settler.carryingKind ?? null,
    socialTileId: settler.socialTileId ?? null,
    movement: settler.movement
      ? {
          path: settler.movement.path.map((step) => ({ ...step })),
          origin: { ...settler.movement.origin },
          target: { ...settler.movement.target },
          startMs: settler.movement.startMs,
          stepDurations: settler.movement.stepDurations.slice(),
          cumulative: settler.movement.cumulative.slice(),
          taskType: settler.movement.taskType,
          requestId: settler.movement.requestId,
          authoritative: settler.movement.authoritative,
        }
      : undefined,
    carryingPayload: settler.carryingPayload ? { ...settler.carryingPayload } : undefined,
  };
}

// Simple in-memory world state. For now, generate a minimal world.
// This can later be replaced with a richer generator and persistence layer.
class WorldState {
  private activeSeed = 123456789;

  init(seed?: number | null, radius?: number | null): Promise<void> {
    const resolvedSeed = normalizeSeed(seed) ?? resolveConfiguredSeed() ?? createRandomSeed();
    const worldRadius = normalizeWorldRadius(radius);
    this.activeSeed = resolvedSeed;
    resetResourceState();
    resetWorkforceState();
    resetStudyState();
    resetPopulationState();
    resetSettlerState();
    resetSettlementSupportState();
    resetMineReserveState();
    resetCalamitySystem();
    marketState.reset();
    shipOrderState.reset();
    loadTasks([]);
    loadHeroes([]);
    loadSettlers([]);
    resetStoryProgression();
    tickEngine.setSeed(resolvedSeed);
    startWorldGeneration(worldRadius, resolvedSeed);
    initializePopulation();
    syncSettlerPopulation(Date.now());
    const population = getPopulationState();
    const support = recalculateSettlementSupport(getPopulationBySettlementInput(), population.hungerMs);
    setSupportMetrics(support.snapshot);
    runState.initialize(resolvedSeed);
    return Promise.resolve();
  }

  getSeed() {
    return this.activeSeed;
  }

  private getStarterHeroId(playerId: string, slot: number) {
    return slot === 0 ? `founder:${playerId}` : `founder:${playerId}:${slot + 1}`;
  }

  private applyLooperlandsHeroSelection(hero: Hero, selection: LooperlandsHeroSelection): void {
    hero.name = selection.name;
    hero.avatar = selection.id;
    hero.avatarSource = 'looperlands';
    hero.avatarSpriteUrl = selection.spriteUrl;
    hero.avatarFallbackSpriteUrl = selection.fallbackSpriteUrl ?? null;
    hero.avatarNftId = selection.nftId;
    hero.avatarTokenHash = selection.tokenHash ?? null;
  }

  private ensureStarterHeroes(founder: { playerId: string; playerName: string } | null | undefined, q: number, r: number, settlementId: string) {
    if (!founder) {
      return [];
    }

    const starterHeroes: Hero[] = [];
    const starterHeroIdSet = new Set<string>();
    let createdHero = false;
    const looperSelections = playerSettlementState.getStarterHeroes(founder.playerId);
    const storyHeroIds = playerSettlementState.getStarterStoryHeroIds(founder.playerId);

    for (let slot = 0; slot < SETTLEMENT_STARTER_HERO_COUNT; slot++) {
      const starterHeroId = this.getStarterHeroId(founder.playerId, slot);
      const looperSelection = looperSelections[slot] ?? null;
      const existingHero = heroes.find((hero) => (
        hero.id === starterHeroId || (hero.playerId === founder.playerId && !starterHeroIdSet.has(hero.id))
      ));

      if (existingHero) {
        if (looperSelection) {
          this.applyLooperlandsHeroSelection(existingHero, looperSelection);
        }
        existingHero.playerId = founder.playerId;
        existingHero.playerName = founder.playerName;
        existingHero.settlementId = settlementId;
        starterHeroes.push(existingHero);
        starterHeroIdSet.add(existingHero.id);
        continue;
      }

      const templateId = storyHeroIds[slot] ?? SETTLEMENT_STARTER_HERO_TEMPLATES[heroes.length % SETTLEMENT_STARTER_HERO_TEMPLATES.length] ?? 'h2';
      const hero = createHeroFromTemplate(templateId, { q, r });
      if (!hero) {
        continue;
      }

      hero.id = starterHeroId;
      if (looperSelection) {
        this.applyLooperlandsHeroSelection(hero, looperSelection);
      } else if (!storyHeroIds[slot]) {
        hero.name = `${founder.playerName}'s ${slot === 0 ? 'Founder' : 'Scout'}`;
      }
      hero.playerId = founder.playerId;
      hero.playerName = founder.playerName;
      hero.settlementId = settlementId;
      heroes.push(hero);
      starterHeroes.push(hero);
      starterHeroIdSet.add(hero.id);
      createdHero = true;
    }

    if (createdHero) {
      broadcast({
        type: 'hero:roster_update',
        heroes: heroes.map(serializeHero),
        timestamp: Date.now(),
      } satisfies HeroRosterUpdateMessage);
    }

    return starterHeroes;
  }

  foundSettlementAt(
    q: number,
    r: number,
    founder?: { playerId: string; playerName: string } | null,
  ): { settlementId: string; q: number; r: number; founderHeroId?: string; founderHeroIds?: string[] } | null {
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      return null;
    }

    const centerQ = Math.trunc(q);
    const centerR = Math.trunc(r);
    const centerTile = ensureTileExists(centerQ, centerR);
    const wasTownCenter = centerTile.discovered && centerTile.terrain === 'towncenter';
    const hadStarterStorage = getStorageUsedCapacity(centerTile.id) > 0;

    for (let dq = -SETTLEMENT_START_REVEAL_RADIUS; dq <= SETTLEMENT_START_REVEAL_RADIUS; dq++) {
      for (
        let dr = Math.max(-SETTLEMENT_START_REVEAL_RADIUS, -dq - SETTLEMENT_START_REVEAL_RADIUS);
        dr <= Math.min(SETTLEMENT_START_REVEAL_RADIUS, -dq + SETTLEMENT_START_REVEAL_RADIUS);
        dr++
      ) {
        discoverTile(ensureTileExists(centerQ + dq, centerR + dr), {
      q: centerQ,
      r: centerR,
          settlementId: centerTile.id,
    });
      }
    }

    if (centerTile.terrain !== 'towncenter') {
      promoteTileToTowncenter(centerTile);
      ensureTownCenterMilitaryState(centerTile);
    } else if (!wasTownCenter) {
      broadcast({ type: 'tile:updated', tile: centerTile } satisfies TileUpdatedMessage);
    }

    initializeSettlementPopulation(centerTile.id);
    loadStoryProgression(createInitialProgressionSnapshot(), centerTile.id);
    const starterHeroes = this.ensureStarterHeroes(founder, centerTile.q, centerTile.r, centerTile.id);
    runState.initializeSettlement(centerTile.id, this.activeSeed);

    if (!wasTownCenter || !hadStarterStorage) {
      for (const resource of SETTLEMENT_STARTER_RESOURCES) {
        const depositedAmount = depositResourceToStorage(centerTile.id, resource.type, resource.amount);
        if (depositedAmount > 0) {
          broadcast({
            type: 'resource:deposit',
            heroId: 'settlement-start',
            storageTileId: centerTile.id,
            resource: { type: resource.type, amount: depositedAmount },
          } satisfies ResourceDepositMessage);
        }
      }
    }

    const population = getPopulationState();
    const support = recalculateSettlementSupport(getPopulationBySettlementInput(), population.hungerMs);
    setSupportMetrics(support.snapshot);
    recalculatePopulationLimits();

    for (const tileId of support.changedTileIds) {
      const tile = tileIndex[tileId];
      if (tile) {
        broadcast({ type: 'tile:updated', tile } satisfies TileUpdatedMessage);
      }
    }

    broadcastPopulationState();

    const result: { settlementId: string; q: number; r: number; founderHeroId?: string; founderHeroIds?: string[] } = {
      settlementId: centerTile.id,
      q: centerTile.q,
      r: centerTile.r,
    };
    if (starterHeroes.length > 0) {
      result.founderHeroId = starterHeroes[0].id;
      result.founderHeroIds = starterHeroes.map((hero) => hero.id);
    }

    return result;
  }

  getSnapshot(): { tiles: Tile[], heroes: Hero[], settlers: Settler[], tasks: TaskInstance[], resources: Partial<Record<ResourceType, number>>, settlementResources: ReturnType<typeof listSettlementResourceSnapshots>, storages: StorageSnapshot[], population: PopulationSnapshot, jobs: WorkforceSnapshot, studies: StudyStateSnapshot, market: MarketOverviewSnapshot, shipOrders: ShipOrderOverviewSnapshot } {
    const resources: Partial<Record<ResourceType, number>> = {};
    for (const [k, v] of Object.entries(resourceInventory)) {
      (resources as any)[k] = v as number;
    }

    const storages = listStorageSnapshots();
    const settlementResources = listSettlementResourceSnapshots();
    const population = getPopulationSnapshot();
    const jobs = getWorkforceSnapshot();
    const studies = getStudySnapshot();
    const settlers = getSettlerSnapshot();
    const market = marketState.getOverview();
    const shipOrders = shipOrderState.getOverview();

    for (const tile of tiles) {
      ensureTownCenterMilitaryState(tile);
      ensureWatchtowerMilitaryState(tile);
      ensureBarracksMilitaryState(tile);
    }

    return {
      tiles: tiles.map(serializeTile),
      heroes: heroes.map(serializeHero),
      settlers: settlers.map(serializeSettler),
      tasks: taskStore.tasks.map(serializeTask),
      resources,
      settlementResources,
      storages,
      population,
      jobs,
      studies,
      market,
      shipOrders,
    };
  }
}

export const worldState = new WorldState();
