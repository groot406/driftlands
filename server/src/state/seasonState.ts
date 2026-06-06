import { readFileSync, writeFileSync } from 'fs';
import { broadcast } from '../messages/messageRouter';
import { tileIndex, tiles } from '../../../src/shared/game/world.ts';
import { playerSettlementState } from './playerSettlementState';
import { runState } from './runState';
import { getTileConditionState, isMaintainedBuildingTile } from '../../../src/shared/buildings/maintenance.ts';
import { getBuildingDefinitionForTile } from '../../../src/shared/buildings/registry.ts';
import { getHungerFoodMealValue } from '../../../src/shared/game/resourceDefinitions.ts';
import { isWatchtowerTile } from '../../../src/shared/game/military.ts';
import { getTileSettlementId } from '../../../src/shared/game/settlement.ts';
import { getWorkforceSnapshot } from '../../../src/shared/game/state/jobStore.ts';
import { getPopulationSnapshot } from '../../../src/shared/game/state/populationStore.ts';
import { getSettlementResourceInventory } from '../../../src/shared/game/state/resourceStore.ts';
import type { GameplayEvent } from '../../../src/shared/gameplay/events.ts';
import {
  buildLeaderboard,
  evaluateEndGoal,
} from '../../../src/shared/seasons/scoring.ts';
import {
  createDefaultSeasonConfig,
  type ActiveSeasonStageKey,
  type LeaderboardEntry,
  type ScoreCategory,
  type SeasonArchiveEntry,
  type SeasonCompletedReason,
  type SeasonConfig,
  type SeasonEndGoalKind,
  type SeasonReward,
  type SeasonScoreBaseline,
  type SeasonScoreInput,
  type SettlementDefeatSummary,
  type SeasonSnapshot,
  type SeasonStageConfig,
  type SeasonStageKey,
} from '../../../src/shared/seasons/types.ts';
import type { BuildingKey } from '../../../src/shared/story/progression.ts';
import type { SeasonCompletedMessage, SeasonUpdateMessage } from '../../../src/shared/protocol.ts';

const SCORE_BROADCAST_INTERVAL_MS = 5_000;
const MAX_SEASON_ARCHIVE_ENTRIES = 12;
const SCORE_CATEGORIES: ScoreCategory[] = ['charter', 'frontier', 'logistics', 'military', 'resilience'];

const CATEGORY_REWARD_LABELS: Record<ScoreCategory, string> = {
  charter: 'Charter Laurels',
  frontier: 'Frontier Laurels',
  logistics: 'Harbor Saint',
  military: 'Iron Warden',
  resilience: 'Ashkeeper',
};

function cloneConfig(config: SeasonConfig): SeasonConfig {
  return {
    stages: config.stages.map((stage) => ({
      ...stage,
      scoreMultiplier: stage.scoreMultiplier ? { ...stage.scoreMultiplier } : undefined,
      gameplay: stage.gameplay ? { ...stage.gameplay } : undefined,
    })),
    endGoals: config.endGoals.map((goal) => ({ ...goal, enabledDuring: goal.enabledDuring.slice() })),
  };
}

function normalizeConfig(input: unknown): SeasonConfig {
  const defaults = createDefaultSeasonConfig();
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const candidate = input as Partial<SeasonConfig>;
  const stages = Array.isArray(candidate.stages)
    ? defaults.stages.map((fallback) => {
      const stage = candidate.stages?.find((entry) => entry?.key === fallback.key);
      return {
        ...fallback,
        ...(stage ?? {}),
        durationMs: Math.max(0, Number(stage?.durationMs ?? fallback.durationMs)),
        enabled: stage?.enabled !== false,
        gameplay: {
          ...(fallback.gameplay ?? {}),
          ...(stage?.gameplay ?? {}),
        },
      };
    })
    : defaults.stages;

  const fallbackGoalStages: ActiveSeasonStageKey[] = ['endgame'];
  const endGoals: SeasonConfig['endGoals'] = Array.isArray(candidate.endGoals)
    ? candidate.endGoals
      .filter((goal): goal is NonNullable<typeof goal> => !!goal && typeof goal.id === 'string' && typeof goal.kind === 'string')
      .map((goal) => {
        const enabledDuring = Array.isArray(goal.enabledDuring)
          ? goal.enabledDuring.filter((stage): stage is ActiveSeasonStageKey => (
            stage === 'preparation' || stage === 'midgame' || stage === 'endgame'
          ))
          : fallbackGoalStages;
        return {
          id: goal.id!,
          label: goal.label || goal.id!,
          kind: goal.kind as SeasonEndGoalKind,
          enabled: goal.enabled === true,
          enabledDuring: enabledDuring.length ? enabledDuring : fallbackGoalStages,
          target: Number.isFinite(goal.target) ? Number(goal.target) : undefined,
          percent: Number.isFinite(goal.percent) ? Number(goal.percent) : undefined,
          buildingKey: goal.buildingKey as BuildingKey | undefined,
          settlementScoped: goal.settlementScoped !== false,
        };
      })
    : defaults.endGoals;

  return { stages, endGoals };
}

function loadConfiguredSeasonConfig(): SeasonConfig {
  const inline = process.env.DRIFTLANDS_SEASON_CONFIG_JSON;
  if (inline?.trim()) {
    try {
      return normalizeConfig(JSON.parse(inline));
    } catch (error) {
      console.warn('[season] failed to parse DRIFTLANDS_SEASON_CONFIG_JSON', error);
    }
  }

  const path = process.env.DRIFTLANDS_SEASON_CONFIG;
  if (path?.trim()) {
    try {
      return normalizeConfig(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
      console.warn(`[season] failed to read config from ${path}`, error);
    }
  }

  return createDefaultSeasonConfig();
}

function persistConfiguredSeasonConfig(config: SeasonConfig) {
  const path = process.env.DRIFTLANDS_SEASON_CONFIG_WRITE_PATH ?? process.env.DRIFTLANDS_SEASON_CONFIG;
  if (!path?.trim()) {
    return;
  }

  try {
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn(`[season] failed to persist config to ${path}`, error);
  }
}

function cloneSnapshot(snapshot: SeasonSnapshot): SeasonSnapshot {
  return {
    ...snapshot,
    config: cloneConfig(snapshot.config),
    completedReason: snapshot.completedReason ? { ...snapshot.completedReason } : undefined,
    leaderboard: snapshot.leaderboard.map((entry) => ({
      ...entry,
      breakdown: { ...entry.breakdown },
      rewardTitles: entry.rewardTitles.slice(),
    })),
    endGoals: snapshot.endGoals.map((goal) => ({ ...goal })),
    rewards: snapshot.rewards.map((reward) => ({ ...reward })),
    archive: snapshot.archive.map((entry) => ({
      ...entry,
      completedReason: entry.completedReason ? { ...entry.completedReason } : undefined,
      winner: entry.winner ? { ...entry.winner } : undefined,
      leaderboard: entry.leaderboard.map((leaderboardEntry) => ({
        ...leaderboardEntry,
        breakdown: { ...leaderboardEntry.breakdown },
        rewardTitles: leaderboardEntry.rewardTitles.slice(),
      })),
      rewards: entry.rewards.map((reward) => ({ ...reward })),
    })),
  };
}

function getEnabledStages(config: SeasonConfig) {
  return config.stages.filter((stage) => stage.enabled && stage.durationMs > 0);
}

function getNextStage(config: SeasonConfig, currentStage: SeasonStageKey): SeasonStageConfig | null {
  const enabled = getEnabledStages(config);
  const index = enabled.findIndex((stage) => stage.key === currentStage);
  return enabled[index + 1] ?? null;
}

function getFirstStage(config: SeasonConfig): SeasonStageConfig | null {
  return getEnabledStages(config)[0] ?? null;
}

function getSettlementIdForTile(tile: typeof tiles[number]) {
  return tile.terrain === 'towncenter'
    ? getTileSettlementId(tile)
    : (tile.ownerSettlementId ?? tile.controlledBySettlementId ?? null);
}

export interface SeasonPersistenceSnapshot {
  snapshot: SeasonSnapshot | null;
  archive: SeasonArchiveEntry[];
  shipOrdersCompletedBySettlementId: Array<[string, number]>;
  shipOrderValueBySettlementId: Array<[string, number]>;
  towerCapturesBySettlementId: Array<[string, number]>;
  towerDefensesBySettlementId: Array<[string, number]>;
  calamitiesSurvivedBySettlementId: Array<[string, number]>;
  defeatedSettlementsBySettlementId?: Array<[string, SettlementDefeatSummary]>;
  scoreBaselinesBySettlementId: Array<[string, SeasonScoreBaseline]>;
}

class SeasonState {
  private snapshot: SeasonSnapshot | null = null;
  private archive: SeasonArchiveEntry[] = [];
  private configuredConfigOverride: SeasonConfig | null = null;
  private shipOrdersCompletedBySettlementId = new Map<string, number>();
  private shipOrderValueBySettlementId = new Map<string, number>();
  private towerCapturesBySettlementId = new Map<string, number>();
  private towerDefensesBySettlementId = new Map<string, number>();
  private calamitiesSurvivedBySettlementId = new Map<string, number>();
  private defeatedSettlementsBySettlementId = new Map<string, SettlementDefeatSummary>();
  private scoreBaselinesBySettlementId = new Map<string, SeasonScoreBaseline>();
  private lastBroadcastScoreKey = '';
  private lastScoreBroadcastAt = 0;

  initialize(seed: number, now: number = Date.now(), config: SeasonConfig = this.configuredConfigOverride ?? loadConfiguredSeasonConfig()) {
    const normalized = normalizeConfig(config);
    const firstStage = getFirstStage(normalized);
    this.shipOrdersCompletedBySettlementId.clear();
    this.shipOrderValueBySettlementId.clear();
    this.towerCapturesBySettlementId.clear();
    this.towerDefensesBySettlementId.clear();
    this.calamitiesSurvivedBySettlementId.clear();
    this.defeatedSettlementsBySettlementId.clear();
    this.scoreBaselinesBySettlementId.clear();
    this.lastBroadcastScoreKey = '';
    this.lastScoreBroadcastAt = 0;

    this.snapshot = {
      seasonId: `season-${seed}-${now.toString(36)}`,
      seed,
      status: firstStage ? 'active' : 'completed',
      startedAt: now,
      currentStage: firstStage?.key ?? 'completed',
      stageStartedAt: now,
      stageEndsAt: firstStage ? now + firstStage.durationMs : null,
      nextSeasonStartsAt: null,
      completedAt: firstStage ? undefined : now,
      completedReason: firstStage ? undefined : {
        kind: 'timer',
        completedAt: now,
        message: 'No enabled season stages were configured.',
      },
      config: cloneConfig(normalized),
      leaderboard: [],
      endGoals: [],
      rewards: [],
      archive: this.cloneArchive(),
    };
    this.recompute(now);
  }

  getSnapshot() {
    return this.snapshot ? cloneSnapshot(this.snapshot) : null;
  }

  getPersistenceSnapshot(): SeasonPersistenceSnapshot {
    return {
      snapshot: this.getSnapshot(),
      archive: this.cloneArchive(),
      shipOrdersCompletedBySettlementId: Array.from(this.shipOrdersCompletedBySettlementId.entries()),
      shipOrderValueBySettlementId: Array.from(this.shipOrderValueBySettlementId.entries()),
      towerCapturesBySettlementId: Array.from(this.towerCapturesBySettlementId.entries()),
      towerDefensesBySettlementId: Array.from(this.towerDefensesBySettlementId.entries()),
      calamitiesSurvivedBySettlementId: Array.from(this.calamitiesSurvivedBySettlementId.entries()),
      defeatedSettlementsBySettlementId: Array.from(this.defeatedSettlementsBySettlementId.entries()).map(([settlementId, defeat]) => [
        settlementId,
        { ...defeat },
      ]),
      scoreBaselinesBySettlementId: Array.from(this.scoreBaselinesBySettlementId.entries()).map(([settlementId, baseline]) => [
        settlementId,
        {
          ...baseline,
          buildings: { ...baseline.buildings },
        },
      ]),
    };
  }

  loadPersistenceSnapshot(persistence: SeasonPersistenceSnapshot | null | undefined) {
    if (!persistence?.snapshot) {
      this.snapshot = null;
      this.archive = [];
      this.shipOrdersCompletedBySettlementId.clear();
      this.shipOrderValueBySettlementId.clear();
      this.towerCapturesBySettlementId.clear();
      this.towerDefensesBySettlementId.clear();
      this.calamitiesSurvivedBySettlementId.clear();
      this.defeatedSettlementsBySettlementId.clear();
      this.scoreBaselinesBySettlementId.clear();
      this.lastBroadcastScoreKey = '';
      this.lastScoreBroadcastAt = 0;
      return;
    }

    this.snapshot = cloneSnapshot(persistence.snapshot);
    this.archive = persistence.archive?.map((entry) => ({ ...entry })) ?? cloneSnapshot(persistence.snapshot).archive;
    this.shipOrdersCompletedBySettlementId = new Map(persistence.shipOrdersCompletedBySettlementId ?? []);
    this.shipOrderValueBySettlementId = new Map(persistence.shipOrderValueBySettlementId ?? []);
    this.towerCapturesBySettlementId = new Map(persistence.towerCapturesBySettlementId ?? []);
    this.towerDefensesBySettlementId = new Map(persistence.towerDefensesBySettlementId ?? []);
    this.calamitiesSurvivedBySettlementId = new Map(persistence.calamitiesSurvivedBySettlementId ?? []);
    this.defeatedSettlementsBySettlementId = new Map(
      (persistence.defeatedSettlementsBySettlementId ?? []).map(([settlementId, defeat]): [string, SettlementDefeatSummary] => [
        settlementId,
        { ...defeat },
      ]),
    );
    this.scoreBaselinesBySettlementId = new Map(
      (persistence.scoreBaselinesBySettlementId ?? []).map(([settlementId, baseline]): [string, SeasonScoreBaseline] => [
        settlementId,
        {
          ...baseline,
          buildings: { ...baseline.buildings },
        },
      ]),
    );
    this.lastBroadcastScoreKey = '';
    this.lastScoreBroadcastAt = 0;
    this.recompute(Date.now());
  }

  getCurrentStageConfig() {
    if (!this.snapshot || this.snapshot.currentStage === 'completed') {
      return null;
    }
    return this.snapshot.config.stages.find((stage) => stage.key === this.snapshot?.currentStage) ?? null;
  }

  getEffectiveBorderPolicy() {
    return this.getCurrentStageConfig()?.borderPolicy ?? 'player_choice';
  }

  allowsSettlementStarts() {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return false;
    }
    return this.getCurrentStageConfig()?.allowSettlementStarts !== false;
  }

  allowsNewHeroActions() {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return false;
    }
    return this.getCurrentStageConfig()?.allowNewHeroTasks !== false;
  }

  isSettlementDefeated(settlementId: string | null | undefined) {
    return !!settlementId && this.defeatedSettlementsBySettlementId.has(settlementId);
  }

  isPlayerDefeated(playerId: string | null | undefined) {
    if (!playerId) {
      return false;
    }

    return this.isSettlementDefeated(playerSettlementState.getPlayerSettlement(playerId));
  }

  canPlayerTakeNewActions(playerId: string | null | undefined) {
    if (!playerId) {
      return false;
    }

    return this.allowsNewHeroActions() && !this.isPlayerDefeated(playerId);
  }

  isCompleted() {
    return this.snapshot?.status === 'completed';
  }

  tick(now: number) {
    if (!this.snapshot) {
      return;
    }

    if (this.snapshot.status === 'active' && this.snapshot.stageEndsAt != null && now >= this.snapshot.stageEndsAt) {
      const nextStage = getNextStage(this.snapshot.config, this.snapshot.currentStage);
      if (nextStage) {
        this.snapshot.currentStage = nextStage.key;
        this.snapshot.stageStartedAt = now;
        this.snapshot.stageEndsAt = now + nextStage.durationMs;
        this.recompute(now);
        this.broadcastUpdate();
        return;
      }

      this.complete({
        kind: 'timer',
        completedAt: now,
        message: 'The season timer ended.',
      });
      return;
    }

    if (this.snapshot.status !== 'active') {
      return;
    }

    if (now - this.lastScoreBroadcastAt >= SCORE_BROADCAST_INTERVAL_MS) {
      const before = this.lastBroadcastScoreKey;
      this.recompute(now);
      if (before !== this.lastBroadcastScoreKey) {
        this.broadcastUpdate();
      }
    }
  }

  recordEvent(event: GameplayEvent) {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return;
    }

    if (event.type === 'military:tower_captured') {
      this.increment(this.towerCapturesBySettlementId, event.attackerSettlementId, 1);
    } else if (event.type === 'military:settlement_defeated') {
      const attacker = playerSettlementState.getSettlementOwner(event.attackerSettlementId);
      this.defeatedSettlementsBySettlementId.set(event.defeatedSettlementId, {
        defeatedAt: event.defeatedAt,
        defeatedBySettlementId: event.attackerSettlementId,
        defeatedByPlayerId: attacker?.playerId ?? null,
        defeatedByPlayerName: attacker?.playerName ?? null,
        capturedTownCenterTileId: event.capturedTownCenterTileId,
        transferredTileCount: event.transferredTileIds.length,
      });
      if (this.completeIfLastPlayerStanding(event.defeatedAt)) {
        return;
      }
    } else if (event.type === 'ship_order:completed') {
      this.increment(this.shipOrdersCompletedBySettlementId, event.settlementId, 1);
      this.increment(this.shipOrderValueBySettlementId, event.settlementId, event.fulfilledValue);
    } else if (event.type === 'calamity:survived' && event.settlementId) {
      this.increment(this.calamitiesSurvivedBySettlementId, event.settlementId, 1);
    }

    this.recompute(Date.now());
    this.broadcastUpdate();
  }

  private completeIfLastPlayerStanding(completedAt: number) {
    if (!this.snapshot || this.snapshot.status !== 'active') {
      return false;
    }

    const claimedPlayers = playerSettlementState.listPlayers()
      .filter((player) => !!player.settlementId);
    if (claimedPlayers.length <= 1) {
      return false;
    }

    const survivors = claimedPlayers
      .filter((player) => !this.isSettlementDefeated(player.settlementId))
      .sort((left, right) => left.nickname.localeCompare(right.nickname) || left.id.localeCompare(right.id));
    if (survivors.length !== 1) {
      return false;
    }

    const winner = survivors[0]!;
    this.complete({
      kind: 'last_player_standing',
      playerId: winner.id,
      settlementId: winner.settlementId,
      completedAt,
      message: `${winner.nickname} is the last settlement standing.`,
    });
    return true;
  }

  applyConfig(config: SeasonConfig) {
    if (!this.snapshot) {
      return;
    }
    this.configuredConfigOverride = cloneConfig(normalizeConfig(config));
    persistConfiguredSeasonConfig(this.configuredConfigOverride);
    this.snapshot.config = cloneConfig(this.configuredConfigOverride);
    if (this.snapshot.status === 'active' && !this.getCurrentStageConfig()) {
      const firstStage = getFirstStage(this.snapshot.config);
      if (firstStage) {
        const now = Date.now();
        this.snapshot.currentStage = firstStage.key;
        this.snapshot.stageStartedAt = now;
        this.snapshot.stageEndsAt = now + firstStage.durationMs;
      }
    }
    this.recompute(Date.now());
    this.broadcastUpdate();
  }

  setStage(stageKey: ActiveSeasonStageKey) {
    if (!this.snapshot) {
      return;
    }
    const stage = this.snapshot.config.stages.find((candidate) => candidate.key === stageKey);
    if (!stage) {
      return;
    }
    const now = Date.now();
    this.snapshot.status = 'active';
    this.snapshot.currentStage = stage.key;
    this.snapshot.stageStartedAt = now;
    this.snapshot.stageEndsAt = stage.enabled && stage.durationMs > 0 ? now + stage.durationMs : null;
    this.snapshot.completedAt = undefined;
    this.snapshot.completedReason = undefined;
    this.snapshot.nextSeasonStartsAt = null;
    this.recompute(now);
    this.broadcastUpdate();
  }

  completeNow(message: string = 'The season was completed by an administrator.') {
    this.complete({
      kind: 'admin',
      completedAt: Date.now(),
      message,
    });
  }

  scheduleNextSeason(startsAt: number | null) {
    if (!this.snapshot || this.snapshot.status !== 'completed') {
      return;
    }
    if (this.snapshot.nextSeasonStartsAt === startsAt) {
      return;
    }
    this.snapshot.nextSeasonStartsAt = startsAt;
    this.broadcastUpdate();
  }

  private complete(reason: SeasonCompletedReason) {
    if (!this.snapshot || this.snapshot.status === 'completed') {
      return;
    }
    this.snapshot.status = 'completed';
    this.snapshot.currentStage = 'completed';
    this.snapshot.stageStartedAt = reason.completedAt;
    this.snapshot.stageEndsAt = null;
    this.snapshot.completedAt = reason.completedAt;
    this.snapshot.completedReason = reason;
    this.recompute(reason.completedAt);
    const rewards = this.buildRewards();
    this.snapshot.rewards = rewards;
    this.snapshot.leaderboard = this.applyRewardTitles(this.snapshot.leaderboard, rewards);
    this.archiveCompletedSeason();
    this.snapshot.archive = this.cloneArchive();
    this.broadcastCompleted();
  }

  private recompute(now: number) {
    if (!this.snapshot) {
      return;
    }

    const inputs = this.collectScoreInputs();
    const currentStage = this.getCurrentStageConfig();
    const leaderboard = buildLeaderboard(inputs, currentStage);
    const totalDiscoveredTiles = tiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length;
    const endGoals = this.snapshot.config.endGoals.map((goal) => evaluateEndGoal(goal, leaderboard, totalDiscoveredTiles, this.snapshot!.currentStage, inputs));

    this.snapshot.leaderboard = leaderboard;
    this.snapshot.endGoals = endGoals;
    this.lastBroadcastScoreKey = JSON.stringify({
      stage: this.snapshot.currentStage,
      stageEndsAt: this.snapshot.stageEndsAt,
      leaderboard: leaderboard.map((entry) => [entry.playerId, entry.score, entry.controlledTiles, entry.watchtowersControlled]),
      endGoals: endGoals.map((goal) => [goal.id, goal.progress, goal.completed]),
    });
    this.lastScoreBroadcastAt = now;

    const completedGoal = endGoals.find((goal) => goal.completed);
    if (this.snapshot.status === 'active' && completedGoal) {
      this.complete({
        kind: 'end_goal',
        goalId: completedGoal.id,
        playerId: completedGoal.leaderPlayerId ?? null,
        settlementId: completedGoal.leaderSettlementId ?? null,
        value: completedGoal.progress,
        completedAt: now,
        message: `${completedGoal.label} completed.`,
      });
    }
  }

  private collectScoreInputs(): SeasonScoreInput[] {
    const population = getPopulationSnapshot();
    const workforce = getWorkforceSnapshot();
    const blockedJobStatuses = new Set(['offline', 'missing_input', 'storage_full', 'depleted']);

    return playerSettlementState.listPlayers()
      .filter((player) => !!player.settlementId)
      .map((player) => {
        const settlementId = player.settlementId!;
        const settlementTiles = tiles.filter((tile) => getSettlementIdForTile(tile) === settlementId);
        const buildings: Partial<Record<BuildingKey, number>> = {};
        let watchtowersControlled = 0;
        let frontierDistance = 0;
        let maintainedBuildings = 0;
        let healthyBuildings = 0;
        let wornBuildings = 0;
        let damagedBuildings = 0;
        let offlineBuildings = 0;
        const townCenter = tileIndex[settlementId] ?? null;

        for (const tile of settlementTiles) {
          const building = getBuildingDefinitionForTile(tile);
          if (building) {
            const key = building.key as BuildingKey;
            buildings[key] = (buildings[key] ?? 0) + 1;
          }
          if (isMaintainedBuildingTile(tile)) {
            maintainedBuildings += 1;
            const condition = getTileConditionState(tile.condition);
            if (condition === 'healthy') {
              healthyBuildings += 1;
            } else if (condition === 'worn') {
              wornBuildings += 1;
            } else if (condition === 'damaged') {
              damagedBuildings += 1;
            } else {
              offlineBuildings += 1;
            }
          }
          if (isWatchtowerTile(tile)) {
            watchtowersControlled += 1;
          }
          if (tile.discovered && townCenter) {
            frontierDistance = Math.max(
              frontierDistance,
              Math.max(Math.abs(tile.q - townCenter.q), Math.abs(tile.r - townCenter.r), Math.abs((tile.q - townCenter.q) + (tile.r - townCenter.r))),
            );
          }
        }

        const run = runState.getSnapshotForSettlement(settlementId);
        const objectives = run?.objectives ?? [];
        const settlementPopulation = population.settlements.find((settlement) => settlement.settlementId === settlementId);
        const settlementInventory = getSettlementResourceInventory(settlementId);
        const settlementJobSites = workforce.sites.filter((site) => getSettlementIdForTile(tileIndex[site.tileId]) === settlementId);

        const scoreInput: SeasonScoreInput = {
          playerId: player.id,
          playerName: player.nickname,
          playerColor: player.color,
          settlementId,
          chapterNumber: run?.chapterNumber ?? 1,
          chaptersCompleted: run?.chaptersCompleted ?? 0,
          completedObjectives: objectives.filter((objective) => objective.completed).length,
          totalObjectives: objectives.length,
          controlledTiles: settlementTiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length,
          activeTiles: settlementTiles.filter((tile) => tile.activationState === 'active').length,
          inactiveTiles: settlementTiles.filter((tile) => tile.activationState === 'inactive').length,
          discoveredTiles: settlementTiles.filter((tile) => tile.discovered && tile.terrain && tile.terrain !== 'towncenter').length,
          restoredTiles: run?.restoredTiles ?? 0,
          frontierDistance,
          buildings,
          watchtowersControlled,
          shipOrdersCompleted: this.shipOrdersCompletedBySettlementId.get(settlementId) ?? 0,
          shipOrderValue: this.shipOrderValueBySettlementId.get(settlementId) ?? 0,
          towerCaptures: this.towerCapturesBySettlementId.get(settlementId) ?? 0,
          towerDefenses: this.towerDefensesBySettlementId.get(settlementId) ?? 0,
          calamitiesSurvived: this.calamitiesSurvivedBySettlementId.get(settlementId) ?? 0,
          population: settlementPopulation?.current ?? 0,
          beds: settlementPopulation?.beds ?? 0,
          foodMeals: Math.floor(getHungerFoodMealValue(settlementInventory)),
          maintainedBuildings,
          healthyBuildings,
          wornBuildings,
          damagedBuildings,
          offlineBuildings,
          staffedJobSites: settlementJobSites.filter((site) => site.assignedWorkers > 0).length,
          productiveJobSites: settlementJobSites.filter((site) => site.status === 'staffed').length,
          blockedJobSites: settlementJobSites.filter((site) => blockedJobStatuses.has(site.status)).length,
          defeat: this.defeatedSettlementsBySettlementId.get(settlementId) ?? null,
        };

        return {
          ...scoreInput,
          baseline: this.getOrCreateScoreBaseline(settlementId, scoreInput),
        };
      });
  }

  private getOrCreateScoreBaseline(settlementId: string, input: SeasonScoreInput): SeasonScoreBaseline {
    const existing = this.scoreBaselinesBySettlementId.get(settlementId);
    if (existing) {
      return existing;
    }

    const baseline: SeasonScoreBaseline = {
      chapterNumber: input.chapterNumber,
      chaptersCompleted: input.chaptersCompleted,
      completedObjectives: input.completedObjectives,
      controlledTiles: input.controlledTiles,
      activeTiles: input.activeTiles,
      inactiveTiles: input.inactiveTiles,
      discoveredTiles: input.discoveredTiles,
      restoredTiles: input.restoredTiles,
      frontierDistance: input.frontierDistance,
      buildings: { ...input.buildings },
      watchtowersControlled: input.watchtowersControlled,
      shipOrdersCompleted: input.shipOrdersCompleted,
      shipOrderValue: input.shipOrderValue,
      towerCaptures: input.towerCaptures,
      towerDefenses: input.towerDefenses,
      calamitiesSurvived: input.calamitiesSurvived,
      population: input.population ?? 0,
      beds: input.beds ?? 0,
      foodMeals: input.foodMeals ?? 0,
      maintainedBuildings: input.maintainedBuildings ?? 0,
      healthyBuildings: input.healthyBuildings ?? 0,
      staffedJobSites: input.staffedJobSites ?? 0,
      productiveJobSites: input.productiveJobSites ?? 0,
    };
    this.scoreBaselinesBySettlementId.set(settlementId, baseline);
    return baseline;
  }

  private buildRewards(): SeasonReward[] {
    if (!this.snapshot) {
      return [];
    }
    const rewards: SeasonReward[] = [];
    const winner = this.snapshot.leaderboard[0];
    if (winner) {
      rewards.push({
        id: `${this.snapshot.seasonId}:overall:${winner.playerId}`,
        kind: 'title',
        playerId: winner.playerId,
        label: 'Season Champion',
        description: 'Finished first on the season leaderboard.',
        seasonId: this.snapshot.seasonId,
        category: 'overall',
      });
    }
    for (const entry of this.snapshot.leaderboard.slice(0, 3)) {
      rewards.push({
        id: `${this.snapshot.seasonId}:banner:${entry.rank}:${entry.playerId}`,
        kind: 'banner',
        playerId: entry.playerId,
        label: entry.rank === 1 ? 'Golden Town Banner' : entry.rank === 2 ? 'Silver Town Banner' : 'Bronze Town Banner',
        description: `Finished rank #${entry.rank} on the final leaderboard.`,
        seasonId: this.snapshot.seasonId,
        category: 'overall',
      });
    }
    for (const entry of this.snapshot.leaderboard.slice(0, 10)) {
      rewards.push({
        id: `${this.snapshot.seasonId}:hall-of-fame:${entry.rank}:${entry.playerId}`,
        kind: 'hall_of_fame',
        playerId: entry.playerId,
        label: `Hall of Fame #${entry.rank}`,
        description: 'Recorded in the season archive.',
        seasonId: this.snapshot.seasonId,
        category: 'overall',
      });
    }
    if (this.snapshot.completedReason?.kind === 'end_goal' && this.snapshot.completedReason.playerId) {
      rewards.push({
        id: `${this.snapshot.seasonId}:statue:${this.snapshot.completedReason.goalId ?? 'final'}:${this.snapshot.completedReason.playerId}`,
        kind: 'statue',
        playerId: this.snapshot.completedReason.playerId,
        label: 'Final Goal Statue',
        description: this.snapshot.completedReason.message,
        seasonId: this.snapshot.seasonId,
        category: 'overall',
      });
    }
    for (const category of SCORE_CATEGORIES) {
      const leader = this.snapshot.leaderboard
        .slice()
        .sort((left, right) => right.breakdown[category] - left.breakdown[category])[0];
      if (!leader || leader.breakdown[category] <= 0) {
        continue;
      }
      rewards.push({
        id: `${this.snapshot.seasonId}:${category}:${leader.playerId}`,
        kind: 'badge',
        playerId: leader.playerId,
        label: CATEGORY_REWARD_LABELS[category],
        description: `Led the season in ${category} score.`,
        seasonId: this.snapshot.seasonId,
        category,
      });
    }
    return rewards;
  }

  private applyRewardTitles(leaderboard: LeaderboardEntry[], rewards: SeasonReward[]): LeaderboardEntry[] {
    return leaderboard.map((entry) => ({
      ...entry,
      rewardTitles: rewards
        .filter((reward) => reward.playerId === entry.playerId)
        .map((reward) => reward.label),
    }));
  }

  private cloneArchive(): SeasonArchiveEntry[] {
    return this.archive.map((entry) => ({
      ...entry,
      completedReason: entry.completedReason ? { ...entry.completedReason } : undefined,
      winner: entry.winner ? { ...entry.winner } : undefined,
      leaderboard: entry.leaderboard.map((leaderboardEntry) => ({
        ...leaderboardEntry,
        breakdown: { ...leaderboardEntry.breakdown },
        rewardTitles: leaderboardEntry.rewardTitles.slice(),
      })),
      rewards: entry.rewards.map((reward) => ({ ...reward })),
    }));
  }

  private archiveCompletedSeason() {
    if (!this.snapshot || this.snapshot.status !== 'completed' || !this.snapshot.completedAt) {
      return;
    }
    if (this.archive.some((entry) => entry.seasonId === this.snapshot!.seasonId)) {
      return;
    }

    const winner = this.snapshot.leaderboard[0];
    const archiveEntry: SeasonArchiveEntry = {
      seasonId: this.snapshot.seasonId,
      seed: this.snapshot.seed,
      startedAt: this.snapshot.startedAt,
      completedAt: this.snapshot.completedAt,
      completedReason: this.snapshot.completedReason ? { ...this.snapshot.completedReason } : undefined,
      winner: winner ? {
        rank: winner.rank,
        playerId: winner.playerId,
        playerName: winner.playerName,
        playerColor: winner.playerColor,
        settlementId: winner.settlementId,
        score: winner.score,
      } : undefined,
      leaderboard: this.snapshot.leaderboard.map((entry) => ({
        ...entry,
        breakdown: { ...entry.breakdown },
        rewardTitles: entry.rewardTitles.slice(),
      })),
      rewards: this.snapshot.rewards.map((reward) => ({ ...reward })),
    };

    this.archive = [archiveEntry, ...this.archive].slice(0, MAX_SEASON_ARCHIVE_ENTRIES);
  }

  private increment(map: Map<string, number>, key: string, amount: number) {
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  private broadcastUpdate() {
    if (!this.snapshot) {
      return;
    }
    broadcast({
      type: 'season:update',
      season: this.getSnapshot()!,
      timestamp: Date.now(),
    } satisfies SeasonUpdateMessage);
  }

  private broadcastCompleted() {
    if (!this.snapshot) {
      return;
    }
    broadcast({
      type: 'season:completed',
      season: this.getSnapshot()!,
      timestamp: Date.now(),
    } satisfies SeasonCompletedMessage);
  }
}

export const seasonState = new SeasonState();
