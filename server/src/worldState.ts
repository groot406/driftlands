import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { discoverTile, ensureTileExists, loadWorld, startWorldGeneration, tiles, tileIndex } from '../../src/shared/game/world';
import { heroes, loadHeroes } from "../../src/shared/game/state/heroStore";
import { loadTasks, taskStore } from "../../src/shared/game/state/taskStore";
import {
  depositResourceToStorage,
  getStorageUsedCapacity,
  listSettlementResourceSnapshots,
  listStorageSnapshots,
  replaceStorageInventories,
  resetResourceState,
  resourceInventory,
} from "../../src/shared/game/state/resourceStore";
import { getWorkforceSnapshot, loadWorkforceSnapshot, resetWorkforceState } from '../../src/shared/game/state/jobStore';
import { getStudySnapshot, loadStudySnapshot, resetStudyState } from '../../src/store/studyStore';
import {
  broadcastPopulationState,
  getPopulationSnapshot,
  getPopulationBySettlementInput,
  getSettlementHungerInput,
  initializePopulation,
  initializeSettlementPopulation,
  loadPopulationSnapshot,
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
import { getTileSettlementId } from '../../src/shared/game/settlement';
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
import { seasonState } from './state/seasonState';
import type { ShipOrderOverviewSnapshot } from '../../src/shared/game/shipOrders';
import { resetAttendanceState } from './state/attendanceState';
import { setWorldGenerationSeed } from '../../src/core/worldVariation';
import type { PersistenceSavedStateSummary } from '../../src/shared/protocol';

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
const SAVE_SCHEMA_VERSION = 1;
const DEFAULT_SAVE_INTERVAL_MS = 5_000;
const DEFAULT_LOCAL_SAVE_PATH = '.driftlands/world-save.json';
const SAVED_STATES_DIR_NAME = 'saved-states';
const MAX_SAVED_STATE_NAME_LENGTH = 64;

interface WorldPersistenceSnapshot {
  version: typeof SAVE_SCHEMA_VERSION;
  savedAt: number;
  snapshotId?: string;
  name?: string;
  seed: number;
  tiles: Tile[];
  heroes: Hero[];
  settlers: Settler[];
  tasks: TaskInstance[];
  storages: StorageSnapshot[];
  population: PopulationSnapshot;
  jobs: WorkforceSnapshot;
  studies: StudyStateSnapshot;
  players: ReturnType<typeof playerSettlementState.getPersistenceSnapshot>;
  run: ReturnType<typeof runState.getPersistenceSnapshot>;
  season: ReturnType<typeof seasonState.getPersistenceSnapshot>;
  market: ReturnType<typeof marketState.getPersistenceSnapshot>;
  shipOrders: ReturnType<typeof shipOrderState.getPersistenceSnapshot>;
}

interface PersistenceSummary {
  tiles: number;
  discoveredTiles: number;
  settlements: number;
  heroes: number;
  settlers: number;
  tasks: number;
  storages: number;
}

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

function resolveSavePath() {
  const configured = process.env.SERVER_SAVE_PATH ?? process.env.DRIFTLANDS_SAVE_PATH;
  const trimmed = configured?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (process.env.NODE_ENV === 'production' || isTestProcess()) {
    return null;
  }

  return resolve(process.cwd(), DEFAULT_LOCAL_SAVE_PATH);
}

function resolveSavedStatesDir() {
  const savePath = resolveSavePath();
  return savePath ? join(dirname(savePath), SAVED_STATES_DIR_NAME) : null;
}

function resolveSaveIntervalMs() {
  const configured = Number.parseInt(process.env.SERVER_SAVE_INTERVAL_MS ?? '', 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SAVE_INTERVAL_MS;
  }

  return Math.max(1_000, configured);
}

function normalizeSavedStateName(name: string | null | undefined) {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return 'Saved State';
  }

  return trimmed.slice(0, MAX_SAVED_STATE_NAME_LENGTH);
}

function createSavedStateSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'saved-state';
}

function normalizeSavedStateId(id: string | null | undefined) {
  const trimmed = (id ?? '').trim();
  return /^[a-z0-9][a-z0-9._-]*\.json$/i.test(trimmed) ? trimmed : null;
}

function isTestProcess() {
  return process.env.NODE_ENV === 'test'
    || process.env.npm_lifecycle_event?.includes('test')
    || process.argv.some((argument) => argument === '--test' || /\.test\.[cm]?tsx?$/.test(argument));
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
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private saving = false;
  private lastSaveAt: number | null = null;
  private lastSaveReason: string | null = null;
  private lastSaveOk: boolean | null = null;
  private lastSaveError: string | null = null;

  init(seed?: number | null, radius?: number | null): Promise<void> {
    if (seed == null && radius == null && this.tryLoadSavedWorld()) {
      return Promise.resolve();
    }

    const resolvedSeed = normalizeSeed(seed) ?? resolveConfiguredSeed() ?? createRandomSeed();
    const worldRadius = normalizeWorldRadius(radius);
    this.activeSeed = resolvedSeed;
    this.logPersistenceStartup('fresh', {
      seed: resolvedSeed,
      radius: worldRadius,
      requestedSeed: seed ?? null,
      configuredSeed: resolveConfiguredSeed(),
    });
    this.resetMutableState();
    tickEngine.setSeed(resolvedSeed);
    startWorldGeneration(worldRadius, resolvedSeed);
    initializePopulation();
    syncSettlerPopulation(Date.now());
    const support = recalculateSettlementSupport(getPopulationBySettlementInput(), getSettlementHungerInput());
    setSupportMetrics(support.snapshot);
    runState.initialize(resolvedSeed);
    seasonState.initialize(resolvedSeed);
    this.saveNow('fresh-world');
    return Promise.resolve();
  }

  private resetMutableState() {
    resetResourceState();
    resetWorkforceState();
    resetStudyState();
    resetPopulationState();
    resetSettlerState();
    resetSettlementSupportState();
    resetMineReserveState();
    resetCalamitySystem();
    resetAttendanceState();
    playerSettlementState.reset();
    marketState.reset();
    shipOrderState.reset();
    loadTasks([]);
    loadHeroes([]);
    loadSettlers([]);
    resetStoryProgression();
  }

  private createPersistenceSnapshot(): WorldPersistenceSnapshot {
    const snapshot = this.getSnapshot();
    return {
      version: SAVE_SCHEMA_VERSION,
      savedAt: Date.now(),
      seed: this.activeSeed,
      tiles: snapshot.tiles,
      heroes: snapshot.heroes,
      settlers: snapshot.settlers,
      tasks: snapshot.tasks,
      storages: snapshot.storages,
      population: snapshot.population,
      jobs: snapshot.jobs,
      studies: snapshot.studies,
      players: playerSettlementState.getPersistenceSnapshot(),
      run: runState.getPersistenceSnapshot(),
      season: seasonState.getPersistenceSnapshot(),
      market: marketState.getPersistenceSnapshot(),
      shipOrders: shipOrderState.getPersistenceSnapshot(),
    };
  }

  private getPersistenceSummary(snapshot: Pick<WorldPersistenceSnapshot, 'tiles' | 'heroes' | 'settlers' | 'tasks' | 'storages'>): PersistenceSummary {
    const settlementIds = new Set<string>();
    for (const tile of snapshot.tiles) {
      if (tile.terrain === 'towncenter') {
        settlementIds.add(getTileSettlementId(tile) ?? tile.id);
      } else if (tile.ownerSettlementId) {
        settlementIds.add(tile.ownerSettlementId);
      } else if (tile.controlledBySettlementId) {
        settlementIds.add(tile.controlledBySettlementId);
      }
    }

    return {
      tiles: snapshot.tiles.length,
      discoveredTiles: snapshot.tiles.filter((tile) => tile.discovered).length,
      settlements: settlementIds.size,
      heroes: snapshot.heroes.length,
      settlers: snapshot.settlers.length,
      tasks: snapshot.tasks.length,
      storages: snapshot.storages.length,
    };
  }

  private getCurrentPersistenceSummary(): PersistenceSummary {
    return this.getPersistenceSummary({
      tiles: tiles.map(serializeTile),
      heroes: heroes.map(serializeHero),
      settlers: getSettlerSnapshot(),
      tasks: taskStore.tasks.map(serializeTask),
      storages: listStorageSnapshots(),
    });
  }

  private formatPersistenceSummary(summary: PersistenceSummary) {
    return `tiles=${summary.tiles} discovered=${summary.discoveredTiles} settlements=${summary.settlements} heroes=${summary.heroes} settlers=${summary.settlers} tasks=${summary.tasks} storages=${summary.storages}`;
  }

  private validatePersistenceSnapshot(snapshot: Partial<WorldPersistenceSnapshot>, savePath: string) {
    if (snapshot.version !== SAVE_SCHEMA_VERSION || !Array.isArray(snapshot.tiles) || typeof snapshot.seed !== 'number') {
      console.warn(`[persistence] ignoring incompatible save file at ${savePath}`);
      return null;
    }

    return snapshot as WorldPersistenceSnapshot;
  }

  private readPersistenceSnapshot(savePath: string) {
    const snapshot = JSON.parse(readFileSync(savePath, 'utf8')) as Partial<WorldPersistenceSnapshot>;
    return this.validatePersistenceSnapshot(snapshot, savePath);
  }

  private applyPersistenceSnapshot(snapshot: WorldPersistenceSnapshot, sourcePath: string) {
    this.activeSeed = normalizeSeed(snapshot.seed) ?? this.activeSeed;
    this.resetMutableState();
    tickEngine.setSeed(this.activeSeed);
    setWorldGenerationSeed(this.activeSeed);
    loadWorld(snapshot.tiles);
    replaceStorageInventories(snapshot.storages ?? []);
    loadPopulationSnapshot(snapshot.population ?? {
      current: 0,
      max: 0,
      beds: 0,
      hungerMs: 0,
      supportCapacity: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      pressureState: 'stable',
      settlements: [],
    });
    loadWorkforceSnapshot(snapshot.jobs ?? {
      availableWorkers: 0,
      assignedWorkers: 0,
      idleWorkers: 0,
      sites: [],
    });
    loadStudySnapshot(snapshot.studies);
    loadTasks(snapshot.tasks ?? []);
    loadHeroes(snapshot.heroes ?? []);
    loadSettlers(snapshot.settlers ?? []);
    playerSettlementState.loadPersistenceSnapshot(snapshot.players);
    runState.loadPersistenceSnapshot(snapshot.run);
    if (snapshot.season) {
      seasonState.loadPersistenceSnapshot(snapshot.season);
    } else {
      seasonState.initialize(this.activeSeed);
    }
    marketState.loadPersistenceSnapshot(snapshot.market);
    shipOrderState.loadPersistenceSnapshot(snapshot.shipOrders);

    const support = recalculateSettlementSupport(getPopulationBySettlementInput(), getSettlementHungerInput());
    setSupportMetrics(support.snapshot);
    recalculatePopulationLimits();
    this.logPersistenceStartup('restore', {
      seed: this.activeSeed,
      savedAt: snapshot.savedAt ? new Date(snapshot.savedAt).toISOString() : null,
    });
    console.log(`[persistence] restored world from ${sourcePath}: ${this.formatPersistenceSummary(this.getPersistenceSummary(snapshot))}`);
  }

  private resolveSavedStatePath(id: string) {
    const savedStatesDir = resolveSavedStatesDir();
    const safeId = normalizeSavedStateId(id);
    if (!savedStatesDir || !safeId) {
      return null;
    }

    const resolvedDir = resolve(savedStatesDir);
    const resolvedPath = resolve(resolvedDir, safeId);
    if (resolvedPath !== resolvedDir && !resolvedPath.startsWith(`${resolvedDir}${sep}`)) {
      return null;
    }

    return resolvedPath;
  }

  private createSavedStateId(name: string) {
    const savedStatesDir = resolveSavedStatesDir();
    const slug = createSavedStateSlug(name);
    let attempt = 0;
    while (true) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
      const id = `${Date.now().toString(36)}-${slug}${suffix}.json`;
      if (!savedStatesDir || !existsSync(join(savedStatesDir, id))) {
        return id;
      }
      attempt += 1;
    }
  }

  private writePersistenceSnapshot(savePath: string, snapshot: WorldPersistenceSnapshot, reason: string) {
    mkdirSync(dirname(savePath), { recursive: true });
    const temporaryPath = `${savePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
    renameSync(temporaryPath, savePath);
    this.lastSaveAt = Date.now();
    this.lastSaveReason = reason;
    this.lastSaveOk = true;
    this.lastSaveError = null;
    console.log(`[persistence] saved reason=${reason} path=${savePath} ${this.formatPersistenceSummary(this.getPersistenceSummary(snapshot))}`);
  }

  private logPersistenceStartup(mode: 'fresh' | 'restore', details: Record<string, unknown>) {
    const savePath = resolveSavePath();
    if (!savePath) {
      console.log('[persistence] disabled; no SERVER_SAVE_PATH resolved for this environment');
      return;
    }

    const detailText = Object.entries(details)
      .map(([key, value]) => `${key}=${value ?? '-'}`)
      .join(' ');
    console.log(`[persistence] ${mode === 'restore' ? 'restore mode' : 'fresh world mode'} path=${savePath} ${detailText}`);
  }

  private tryLoadSavedWorld() {
    const savePath = resolveSavePath();
    if (!savePath || !existsSync(savePath)) {
      if (savePath) {
        console.log(`[persistence] no save file found at ${savePath}; starting a fresh world`);
      } else {
        console.log('[persistence] no save path configured; starting without persistence');
      }
      return false;
    }

    try {
      console.log(`[persistence] reading save file from ${savePath}`);
      const snapshot = this.readPersistenceSnapshot(savePath);
      if (!snapshot) {
        return false;
      }

      this.applyPersistenceSnapshot(snapshot, savePath);
      return true;
    } catch (error) {
      console.warn(`[persistence] failed to restore save file from ${savePath}`, error);
      return false;
    }
  }

  startAutosave() {
    const savePath = resolveSavePath();
    if (this.saveTimer) {
      console.log('[persistence] autosave already running');
      return;
    }

    if (!savePath) {
      console.log('[persistence] autosave disabled; no save path configured');
      return;
    }

    const intervalMs = resolveSaveIntervalMs();
    console.log(`[persistence] autosave started path=${savePath} intervalMs=${intervalMs}`);
    this.saveTimer = setInterval(() => {
      this.saveNow('autosave');
    }, intervalMs);
  }

  stopAutosave() {
    if (!this.saveTimer) {
      console.log('[persistence] autosave stop requested; timer was not running');
      return;
    }

    clearInterval(this.saveTimer);
    this.saveTimer = null;
    console.log('[persistence] autosave stopped');
  }

  saveNow(reason: string = 'manual') {
    const savePath = resolveSavePath();
    if (!savePath || this.saving) {
      if (!savePath) {
        console.log(`[persistence] save skipped reason=${reason}; no save path configured`);
        this.lastSaveAt = Date.now();
        this.lastSaveReason = reason;
        this.lastSaveOk = false;
        this.lastSaveError = 'No save path configured.';
      } else {
        console.log(`[persistence] save skipped reason=${reason}; save already in progress`);
      }
      return false;
    }

    try {
      this.saving = true;
      const snapshot = this.createPersistenceSnapshot();
      this.writePersistenceSnapshot(savePath, snapshot, reason);
      return true;
    } catch (error) {
      this.lastSaveAt = Date.now();
      this.lastSaveReason = reason;
      this.lastSaveOk = false;
      this.lastSaveError = error instanceof Error ? error.message : String(error);
      console.warn(`[persistence] failed to save world reason=${reason} path=${savePath}`, error);
      return false;
    } finally {
      this.saving = false;
    }
  }

  saveAs(name: string) {
    const savedStatesDir = resolveSavedStatesDir();
    if (!savedStatesDir || this.saving) {
      if (!savedStatesDir) {
        console.log('[persistence] save-as skipped; no save path configured');
        this.lastSaveAt = Date.now();
        this.lastSaveReason = 'save-as';
        this.lastSaveOk = false;
        this.lastSaveError = 'No save path configured.';
      } else {
        console.log('[persistence] save-as skipped; save already in progress');
      }
      return false;
    }

    const saveName = normalizeSavedStateName(name);
    const id = this.createSavedStateId(saveName);
    const savePath = join(savedStatesDir, id);
    try {
      this.saving = true;
      const snapshot = {
        ...this.createPersistenceSnapshot(),
        snapshotId: id,
        name: saveName,
      };
      this.writePersistenceSnapshot(savePath, snapshot, `save-as:${saveName}`);
      return true;
    } catch (error) {
      this.lastSaveAt = Date.now();
      this.lastSaveReason = `save-as:${saveName}`;
      this.lastSaveOk = false;
      this.lastSaveError = error instanceof Error ? error.message : String(error);
      console.warn(`[persistence] failed to save named state name="${saveName}" path=${savePath}`, error);
      return false;
    } finally {
      this.saving = false;
    }
  }

  loadSavedState(id: string) {
    const savePath = this.resolveSavedStatePath(id);
    if (!savePath || !existsSync(savePath)) {
      console.warn(`[persistence] load-saved failed; saved state not found id=${id}`);
      this.lastSaveAt = Date.now();
      this.lastSaveReason = 'load-saved';
      this.lastSaveOk = false;
      this.lastSaveError = 'Saved state not found.';
      return false;
    }

    try {
      console.log(`[persistence] loading named saved state id=${id} path=${savePath}`);
      const snapshot = this.readPersistenceSnapshot(savePath);
      if (!snapshot) {
        this.lastSaveAt = Date.now();
        this.lastSaveReason = `load-saved:${id}`;
        this.lastSaveOk = false;
        this.lastSaveError = 'Saved state is incompatible.';
        return false;
      }

      this.applyPersistenceSnapshot(snapshot, savePath);
      this.lastSaveAt = Date.now();
      this.lastSaveReason = `load-saved:${snapshot.name ?? id}`;
      this.lastSaveOk = true;
      this.lastSaveError = null;
      this.saveNow(`loaded:${snapshot.name ?? id}`);
      return true;
    } catch (error) {
      this.lastSaveAt = Date.now();
      this.lastSaveReason = `load-saved:${id}`;
      this.lastSaveOk = false;
      this.lastSaveError = error instanceof Error ? error.message : String(error);
      console.warn(`[persistence] failed to load named saved state id=${id} path=${savePath}`, error);
      return false;
    }
  }

  removeSavedState(id: string) {
    const savePath = this.resolveSavedStatePath(id);
    if (!savePath || !existsSync(savePath)) {
      console.warn(`[persistence] remove-saved failed; saved state not found id=${id}`);
      return false;
    }

    try {
      unlinkSync(savePath);
      console.log(`[persistence] removed named saved state id=${id} path=${savePath}`);
      return true;
    } catch (error) {
      console.warn(`[persistence] failed to remove named saved state id=${id} path=${savePath}`, error);
      return false;
    }
  }

  listSavedStates(): PersistenceSavedStateSummary[] {
    const savedStatesDir = resolveSavedStatesDir();
    if (!savedStatesDir || !existsSync(savedStatesDir)) {
      return [];
    }

    return readdirSync(savedStatesDir)
      .filter((fileName) => !!normalizeSavedStateId(fileName))
      .map((fileName): PersistenceSavedStateSummary | null => {
        const savePath = join(savedStatesDir, fileName);
        try {
          const snapshot = this.readPersistenceSnapshot(savePath);
          if (!snapshot) {
            return null;
          }
          const summary = this.getPersistenceSummary(snapshot);
          const savedAt = typeof snapshot.savedAt === 'number' ? snapshot.savedAt : statSync(savePath).mtimeMs;
          return {
            id: fileName,
            name: snapshot.name ?? fileName.replace(/\.json$/i, ''),
            savedAt,
            fileName,
            path: savePath,
            summary: {
              seed: normalizeSeed(snapshot.seed) ?? this.activeSeed,
              ...summary,
            },
          };
        } catch (error) {
          console.warn(`[persistence] failed to inspect named saved state path=${savePath}`, error);
          return null;
        }
      })
      .filter((entry): entry is PersistenceSavedStateSummary => !!entry)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  getPersistenceStatus() {
    const savePath = resolveSavePath();
    const summary = this.getCurrentPersistenceSummary();
    return {
      enabled: !!savePath,
      path: savePath,
      fileExists: !!savePath && existsSync(savePath),
      lastSaveAt: this.lastSaveAt,
      lastSaveReason: this.lastSaveReason,
      lastSaveOk: this.lastSaveOk,
      lastSaveError: this.lastSaveError,
      summary: {
        seed: this.activeSeed,
        ...summary,
      },
      savedStates: this.listSavedStates(),
    };
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

    const support = recalculateSettlementSupport(getPopulationBySettlementInput(), getSettlementHungerInput());
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
    for (const tile of tiles) {
      const settlementId = tile.terrain === 'towncenter' ? getTileSettlementId(tile) : null;
      if (settlementId) {
        getStudySnapshot(settlementId);
      }
    }
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
