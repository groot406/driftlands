import type { BuildingKey } from '../story/progression.ts';

export type SeasonStageKey = 'preparation' | 'midgame' | 'endgame' | 'completed';
export type ActiveSeasonStageKey = Exclude<SeasonStageKey, 'completed'>;
export type SeasonStatus = 'active' | 'completed' | 'archived';
export type SeasonBorderPolicy = 'locked_closed' | 'locked_open' | 'player_choice';
export type ScoreCategory = 'charter' | 'frontier' | 'logistics' | 'military' | 'resilience';
export type SeasonRewardKind = 'title' | 'badge' | 'banner' | 'hall_of_fame' | 'statue';

export interface ScoreBreakdown extends Record<ScoreCategory, number> {}

export interface SeasonStageGameplayConfig {
  serverTickRate?: number;
  gameSpeedMultiplier?: number;
  heroMovementSpeedMultiplier?: number;
  taskProgressSpeedMultiplier?: number;
  growthSpeedMultiplier?: number;
  populationGrowthSpeedMultiplier?: number;
  settlerCycleSpeedMultiplier?: number;
  guardTrainingSpeedMultiplier?: number;
  shipScheduleSpeedMultiplier?: number;
  calamityScheduleSpeedMultiplier?: number;
  calamityInitialDelayMs?: number;
  calamityRollIntervalMs?: number;
  calamityRollChance?: number;
  calamityWarningLeadMs?: number;
  shipFirstArrivalMinMs?: number;
  shipFirstArrivalMaxMs?: number;
  shipNextArrivalMinMs?: number;
  shipNextArrivalMaxMs?: number;
  shipApproachMs?: number;
  shipDockedDurationMs?: number;
  shipDepartureMs?: number;
  shipOrderSizeMultiplier?: number;
  shipRewardGoldMultiplier?: number;
  shipRewardGoodsMultiplier?: number;
}

export interface SeasonStageConfig {
  key: ActiveSeasonStageKey;
  enabled: boolean;
  durationMs: number;
  borderPolicy: SeasonBorderPolicy;
  allowSettlementStarts: boolean;
  allowNewHeroTasks: boolean;
  scoreMultiplier?: Partial<Record<ScoreCategory, number>>;
  gameplay?: SeasonStageGameplayConfig;
}

export type SeasonEndGoalKind =
  | 'controlled_tiles'
  | 'controlled_tiles_and_percent'
  | 'discovered_tiles'
  | 'score_reached'
  | 'special_building'
  | 'special_building_count'
  | 'ship_orders_completed'
  | 'watchtowers_controlled';

export interface SeasonEndGoalConfig {
  id: string;
  label: string;
  kind: SeasonEndGoalKind;
  enabled: boolean;
  enabledDuring: ActiveSeasonStageKey[];
  target?: number;
  percent?: number;
  buildingKey?: BuildingKey;
  settlementScoped?: boolean;
}

export interface SeasonConfig {
  stages: SeasonStageConfig[];
  endGoals: SeasonEndGoalConfig[];
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  playerColor?: string | null;
  settlementId: string;
  score: number;
  breakdown: ScoreBreakdown;
  controlledTiles: number;
  discoveredTiles: number;
  activeTiles: number;
  watchtowersControlled: number;
  shipOrdersCompleted: number;
  rewardTitles: string[];
}

export interface SeasonReward {
  id: string;
  kind: SeasonRewardKind;
  playerId: string;
  label: string;
  description: string;
  seasonId: string;
  category?: ScoreCategory | 'overall';
}

export interface SeasonArchiveEntry {
  seasonId: string;
  seed: number;
  startedAt: number;
  completedAt: number;
  completedReason?: SeasonCompletedReason;
  winner?: Pick<LeaderboardEntry, 'rank' | 'playerId' | 'playerName' | 'playerColor' | 'settlementId' | 'score'>;
  leaderboard: LeaderboardEntry[];
  rewards: SeasonReward[];
}

export interface SeasonEndGoalProgress {
  id: string;
  label: string;
  kind: SeasonEndGoalKind;
  enabled: boolean;
  active: boolean;
  target: number;
  progress: number;
  percent?: number;
  leaderPlayerId?: string | null;
  leaderSettlementId?: string | null;
  completed: boolean;
}

export interface SeasonScoreBaseline {
  chapterNumber: number;
  chaptersCompleted: number;
  completedObjectives: number;
  controlledTiles: number;
  activeTiles: number;
  inactiveTiles: number;
  discoveredTiles: number;
  restoredTiles: number;
  frontierDistance: number;
  buildings: Partial<Record<BuildingKey, number>>;
  watchtowersControlled: number;
  shipOrdersCompleted: number;
  shipOrderValue: number;
  towerCaptures: number;
  towerDefenses: number;
  calamitiesSurvived: number;
  population?: number;
  beds?: number;
  foodMeals?: number;
  maintainedBuildings?: number;
  healthyBuildings?: number;
  staffedJobSites?: number;
  productiveJobSites?: number;
}

export interface SeasonCompletedReason {
  kind: 'timer' | 'end_goal' | 'admin';
  goalId?: string;
  playerId?: string | null;
  settlementId?: string | null;
  value?: number;
  completedAt: number;
  message: string;
}

export interface SeasonSnapshot {
  seasonId: string;
  seed: number;
  status: SeasonStatus;
  startedAt: number;
  currentStage: SeasonStageKey;
  stageStartedAt: number;
  stageEndsAt: number | null;
  nextSeasonStartsAt?: number | null;
  completedAt?: number;
  completedReason?: SeasonCompletedReason;
  config: SeasonConfig;
  leaderboard: LeaderboardEntry[];
  endGoals: SeasonEndGoalProgress[];
  rewards: SeasonReward[];
  archive: SeasonArchiveEntry[];
}

export interface SeasonScoreInput {
  playerId: string;
  playerName: string;
  playerColor?: string | null;
  settlementId: string;
  chapterNumber: number;
  chaptersCompleted: number;
  completedObjectives: number;
  totalObjectives: number;
  controlledTiles: number;
  activeTiles: number;
  inactiveTiles: number;
  discoveredTiles: number;
  restoredTiles: number;
  frontierDistance: number;
  buildings: Partial<Record<BuildingKey, number>>;
  watchtowersControlled: number;
  shipOrdersCompleted: number;
  shipOrderValue: number;
  towerCaptures: number;
  towerDefenses: number;
  calamitiesSurvived: number;
  population?: number;
  beds?: number;
  foodMeals?: number;
  maintainedBuildings?: number;
  healthyBuildings?: number;
  wornBuildings?: number;
  damagedBuildings?: number;
  offlineBuildings?: number;
  staffedJobSites?: number;
  productiveJobSites?: number;
  blockedJobSites?: number;
  baseline?: SeasonScoreBaseline;
}

const DEFAULT_STAGE_DURATION_MS = 3 * 60 * 60_000;

export function createDefaultSeasonConfig(): SeasonConfig {
  return {
    stages: [
      {
        key: 'preparation',
        enabled: true,
        durationMs: DEFAULT_STAGE_DURATION_MS,
        borderPolicy: 'locked_closed',
        allowSettlementStarts: true,
        allowNewHeroTasks: true,
        scoreMultiplier: { charter: 1.15, frontier: 0.8, military: 0.35 },
        gameplay: {
          serverTickRate: 10,
          gameSpeedMultiplier: 1,
          heroMovementSpeedMultiplier: 1,
          taskProgressSpeedMultiplier: 1,
          growthSpeedMultiplier: 1,
          populationGrowthSpeedMultiplier: 1,
          settlerCycleSpeedMultiplier: 1,
          guardTrainingSpeedMultiplier: 1,
          shipScheduleSpeedMultiplier: 1,
          calamityScheduleSpeedMultiplier: 1,
          calamityInitialDelayMs: 12 * 60_000,
          calamityRollIntervalMs: 9 * 60_000,
          calamityRollChance: 0.28,
          calamityWarningLeadMs: 3 * 60_000,
          shipFirstArrivalMinMs: 2 * 60_000,
          shipFirstArrivalMaxMs: 5 * 60_000,
          shipNextArrivalMinMs: 15 * 60_000,
          shipNextArrivalMaxMs: 20 * 60_000,
          shipApproachMs: 45_000,
          shipDockedDurationMs: 12 * 60_000,
          shipDepartureMs: 35_000,
          shipOrderSizeMultiplier: 1,
          shipRewardGoldMultiplier: 1,
          shipRewardGoodsMultiplier: 1,
        },
      },
      {
        key: 'midgame',
        enabled: true,
        durationMs: DEFAULT_STAGE_DURATION_MS,
        borderPolicy: 'locked_open',
        allowSettlementStarts: true,
        allowNewHeroTasks: true,
        gameplay: {
          serverTickRate: 10,
          gameSpeedMultiplier: 1,
          heroMovementSpeedMultiplier: 1,
          taskProgressSpeedMultiplier: 1,
          growthSpeedMultiplier: 1,
          populationGrowthSpeedMultiplier: 1,
          settlerCycleSpeedMultiplier: 1,
          guardTrainingSpeedMultiplier: 1,
          shipScheduleSpeedMultiplier: 1,
          calamityScheduleSpeedMultiplier: 1,
          calamityInitialDelayMs: 12 * 60_000,
          calamityRollIntervalMs: 9 * 60_000,
          calamityRollChance: 0.28,
          calamityWarningLeadMs: 3 * 60_000,
          shipFirstArrivalMinMs: 2 * 60_000,
          shipFirstArrivalMaxMs: 5 * 60_000,
          shipNextArrivalMinMs: 15 * 60_000,
          shipNextArrivalMaxMs: 20 * 60_000,
          shipApproachMs: 45_000,
          shipDockedDurationMs: 12 * 60_000,
          shipDepartureMs: 35_000,
          shipOrderSizeMultiplier: 1,
          shipRewardGoldMultiplier: 1,
          shipRewardGoodsMultiplier: 1,
        },
      },
      {
        key: 'endgame',
        enabled: true,
        durationMs: DEFAULT_STAGE_DURATION_MS,
        borderPolicy: 'locked_open',
        allowSettlementStarts: false,
        allowNewHeroTasks: true,
        scoreMultiplier: { military: 1.35, frontier: 1.2, logistics: 1.1 },
        gameplay: {
          serverTickRate: 10,
          gameSpeedMultiplier: 1,
          heroMovementSpeedMultiplier: 1,
          taskProgressSpeedMultiplier: 1,
          growthSpeedMultiplier: 1,
          populationGrowthSpeedMultiplier: 1,
          settlerCycleSpeedMultiplier: 1,
          guardTrainingSpeedMultiplier: 1,
          shipScheduleSpeedMultiplier: 1,
          calamityScheduleSpeedMultiplier: 1,
          calamityInitialDelayMs: 12 * 60_000,
          calamityRollIntervalMs: 9 * 60_000,
          calamityRollChance: 0.28,
          calamityWarningLeadMs: 3 * 60_000,
          shipFirstArrivalMinMs: 2 * 60_000,
          shipFirstArrivalMaxMs: 5 * 60_000,
          shipNextArrivalMinMs: 15 * 60_000,
          shipNextArrivalMaxMs: 20 * 60_000,
          shipApproachMs: 45_000,
          shipDockedDurationMs: 12 * 60_000,
          shipDepartureMs: 35_000,
          shipOrderSizeMultiplier: 1,
          shipRewardGoldMultiplier: 1,
          shipRewardGoodsMultiplier: 1,
        },
      },
    ],
    endGoals: [
      {
        id: 'score-5000',
        label: 'Reach 5,000 season score',
        kind: 'score_reached',
        enabled: false,
        enabledDuring: ['endgame'],
        target: 5000,
      },
      {
        id: 'control-120-35',
        label: 'Control 120 tiles and 35% of claimed land',
        kind: 'controlled_tiles_and_percent',
        enabled: false,
        enabledDuring: ['endgame'],
        target: 120,
        percent: 35,
      },
      {
        id: 'watchtowers-8',
        label: 'Control 8 watchtowers',
        kind: 'watchtowers_controlled',
        enabled: false,
        enabledDuring: ['endgame'],
        target: 8,
      },
    ],
  };
}
