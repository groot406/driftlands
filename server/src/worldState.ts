import { startWorldGeneration, tiles } from '../../src/shared/game/world';
import { heroes, loadHeroes } from "../../src/shared/game/state/heroStore";
import { loadTasks, taskStore } from "../../src/shared/game/state/taskStore";
import { depositResourceToStorage, listStorageSnapshots, resetResourceState, resourceInventory } from "../../src/shared/game/state/resourceStore";
import { getWorkforceSnapshot, resetWorkforceState } from '../../src/shared/game/state/jobStore';
import { getStudySnapshot, resetStudyState } from '../../src/store/studyStore';
import { getPopulationSnapshot, getPopulationState, initializePopulation, resetPopulationState } from "../../src/shared/game/state/populationStore";
import { getSettlerSnapshot, loadSettlers, resetSettlerState } from '../../src/shared/game/state/settlerStore';
import { recalculateSettlementSupport, resetSettlementSupportState } from '../../src/shared/game/state/settlementSupportStore';
import { setSupportMetrics } from '../../src/shared/game/state/populationStore';
import type { Tile } from "../../src/shared/game/types/Tile";
import type { Hero } from "../../src/shared/game/types/Hero";
import type { Settler } from '../../src/shared/game/types/Settler';
import type { TaskInstance } from "../../src/shared/game/types/Task";
import type { ResourceType } from "../../src/shared/game/types/Resource";
import type { StorageSnapshot } from '../../src/shared/game/storage';
import type { PopulationSnapshot } from '../../src/store/populationStore';
import type { WorkforceSnapshot } from '../../src/store/jobStore';
import type { StudyStateSnapshot } from '../../src/store/studyStore';
import { runState } from "./state/runState";
import { resetMineReserveState } from './state/mineReserveState';
import { resetStoryProgression } from '../../src/shared/story/progressionState';
import { tickEngine } from './tick';
import { syncSettlerPopulation } from './systems/settlerSystem';

const STARTING_FOOD = 12;
const MAX_UINT32 = 0xffffffff;
const DEFAULT_WORLD_DISCOVER_RADIUS = 1;
const MAX_WORLD_DISCOVER_RADIUS = 200;

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
    modifierRevealed: tile.modifierRevealed ?? false,
    surveyed: tile.surveyed ?? false,
    special: tile.special ?? null,
    specialRevealed: tile.specialRevealed ?? false,
    specialActivated: tile.specialActivated ?? false,
    conditionStabilizedUntilMs: tile.conditionStabilizedUntilMs ?? null,
    nextProductionBoostMultiplier: tile.nextProductionBoostMultiplier ?? null,
  };
}

function serializeHero(hero: Hero): Hero {
  return {
    id: hero.id,
    name: hero.name,
    avatar: hero.avatar,
    q: hero.q,
    r: hero.r,
    stats: { ...hero.stats },
    xpChargeProgress: hero.xpChargeProgress ?? 0,
    abilityCharges: hero.abilityCharges ?? 0,
    abilityChargesEarned: hero.abilityChargesEarned ?? 0,
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
    q: settler.q,
    r: settler.r,
    facing: settler.facing,
    appearanceSeed: settler.appearanceSeed,
    homeTileId: settler.homeTileId,
    homeAccessTileId: settler.homeAccessTileId,
    settlementId: settler.settlementId ?? null,
    assignedWorkTileId: settler.assignedWorkTileId ?? null,
    assignedRole: settler.assignedRole ?? null,
    workTileId: settler.workTileId ?? null,
    hiddenWhileWorking: settler.hiddenWhileWorking ?? null,
    activity: settler.activity,
    blockerReason: settler.blockerReason ? { ...settler.blockerReason } : null,
    stateSinceMs: settler.stateSinceMs,
    hungerMs: settler.hungerMs,
    fatigueMs: settler.fatigueMs,
    workProgressMs: settler.workProgressMs,
    carryingKind: settler.carryingKind ?? null,
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
    loadTasks([]);
    loadHeroes([]);
    loadSettlers([]);
    resetStoryProgression();
    tickEngine.setSeed(resolvedSeed);
    startWorldGeneration(worldRadius, resolvedSeed);
    initializePopulation();
    syncSettlerPopulation(Date.now());
    depositResourceToStorage('0,0', 'food', STARTING_FOOD);
    const population = getPopulationState();
    const support = recalculateSettlementSupport(population.current, population.hungerMs);
    setSupportMetrics(support.snapshot);
    runState.initialize(resolvedSeed);
    return Promise.resolve();
  }

  getSeed() {
    return this.activeSeed;
  }

  getSnapshot(): { tiles: Tile[], heroes: Hero[], settlers: Settler[], tasks: TaskInstance[], resources: Partial<Record<ResourceType, number>>, storages: StorageSnapshot[], population: PopulationSnapshot, jobs: WorkforceSnapshot, studies: StudyStateSnapshot } {
    const resources: Partial<Record<ResourceType, number>> = {};
    for (const [k, v] of Object.entries(resourceInventory)) {
      (resources as any)[k] = v as number;
    }

    const storages = listStorageSnapshots();
    const population = getPopulationSnapshot();
    const jobs = getWorkforceSnapshot();
    const studies = getStudySnapshot();
    const settlers = getSettlerSnapshot();

    return {
      tiles: tiles.map(serializeTile),
      heroes: heroes.map(serializeHero),
      settlers: settlers.map(serializeSettler),
      tasks: taskStore.tasks.map(serializeTask),
      resources,
      storages,
      population,
      jobs,
      studies,
    };
  }
}

export const worldState = new WorldState();
