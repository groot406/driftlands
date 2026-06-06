import type {
  ActiveSeasonStageKey,
  SeasonScoreBaseline,
  LeaderboardEntry,
  ScoreBreakdown,
  ScoreCategory,
  SeasonEndGoalConfig,
  SeasonEndGoalProgress,
  SeasonScoreInput,
  SeasonStageConfig,
} from './types.ts';

const SCORE_CATEGORIES: ScoreCategory[] = ['charter', 'frontier', 'logistics', 'military', 'resilience'];

function roundScore(value: number) {
  return Math.max(0, Math.round(value));
}

function applyMultiplier(category: ScoreCategory, value: number, stage?: SeasonStageConfig | null) {
  return roundScore(value * (stage?.scoreMultiplier?.[category] ?? 1));
}

function positiveDelta(value: number, baselineValue = 0) {
  return Math.max(0, value - baselineValue);
}

function buildingDelta(
  input: SeasonScoreInput,
  baseline: SeasonScoreBaseline | undefined,
  key: keyof SeasonScoreInput['buildings'],
) {
  return positiveDelta(input.buildings[key] ?? 0, baseline?.buildings[key] ?? 0);
}

function metricDelta(
  input: SeasonScoreInput,
  baseline: SeasonScoreBaseline | undefined,
  key: keyof Pick<SeasonScoreInput,
    | 'population'
    | 'beds'
    | 'foodMeals'
    | 'maintainedBuildings'
    | 'healthyBuildings'
    | 'staffedJobSites'
    | 'productiveJobSites'
  >,
) {
  return positiveDelta(input[key] ?? 0, baseline?.[key] ?? 0);
}

export function emptyScoreBreakdown(): ScoreBreakdown {
  return {
    charter: 0,
    frontier: 0,
    logistics: 0,
    military: 0,
    resilience: 0,
  };
}

export function totalScore(breakdown: ScoreBreakdown) {
  return SCORE_CATEGORIES.reduce((sum, category) => sum + breakdown[category], 0);
}

export function calculateScoreBreakdown(input: SeasonScoreInput, stage?: SeasonStageConfig | null): ScoreBreakdown {
  const baseline = input.baseline;
  const chapterDelta = positiveDelta(input.chapterNumber, baseline?.chapterNumber ?? 0);
  const chaptersCompletedDelta = positiveDelta(input.chaptersCompleted, baseline?.chaptersCompleted ?? 0);
  const completedObjectivesDelta = positiveDelta(input.completedObjectives, baseline?.completedObjectives ?? 0);
  const controlledTilesDelta = positiveDelta(input.controlledTiles, baseline?.controlledTiles ?? 0);
  const activeTilesDelta = positiveDelta(input.activeTiles, baseline?.activeTiles ?? 0);
  const inactiveTilesDelta = positiveDelta(input.inactiveTiles, baseline?.inactiveTiles ?? 0);
  const discoveredTilesDelta = positiveDelta(input.discoveredTiles, baseline?.discoveredTiles ?? 0);
  const restoredTilesDelta = positiveDelta(input.restoredTiles, baseline?.restoredTiles ?? 0);
  const frontierDistanceDelta = positiveDelta(input.frontierDistance, baseline?.frontierDistance ?? 0);
  const watchtowersControlledDelta = positiveDelta(input.watchtowersControlled, baseline?.watchtowersControlled ?? 0);
  const shipOrdersCompletedDelta = positiveDelta(input.shipOrdersCompleted, baseline?.shipOrdersCompleted ?? 0);
  const shipOrderValueDelta = positiveDelta(input.shipOrderValue, baseline?.shipOrderValue ?? 0);
  const towerCapturesDelta = positiveDelta(input.towerCaptures, baseline?.towerCaptures ?? 0);
  const towerDefensesDelta = positiveDelta(input.towerDefenses, baseline?.towerDefenses ?? 0);
  const calamitiesSurvivedDelta = positiveDelta(input.calamitiesSurvived, baseline?.calamitiesSurvived ?? 0);
  const populationDelta = metricDelta(input, baseline, 'population');
  const bedsDelta = metricDelta(input, baseline, 'beds');
  const foodMealsDelta = metricDelta(input, baseline, 'foodMeals');
  const maintainedBuildingsDelta = metricDelta(input, baseline, 'maintainedBuildings');
  const healthyBuildingsDelta = metricDelta(input, baseline, 'healthyBuildings');
  const staffedJobSitesDelta = metricDelta(input, baseline, 'staffedJobSites');
  const productiveJobSitesDelta = metricDelta(input, baseline, 'productiveJobSites');
  const wornBuildings = input.wornBuildings ?? 0;
  const damagedBuildings = input.damagedBuildings ?? 0;
  const offlineBuildings = input.offlineBuildings ?? 0;
  const blockedJobSites = input.blockedJobSites ?? 0;
  const foodBufferCap = Math.max(12, (input.population ?? 0) * 8);
  const completedObjectiveRatio = input.totalObjectives > 0
    ? completedObjectivesDelta / input.totalObjectives
    : 0;
  const charter = (chaptersCompletedDelta * 280)
    + (chapterDelta * 35)
    + (completedObjectivesDelta * 80)
    + Math.round(completedObjectiveRatio * 100)
    + (populationDelta * 12)
    + (bedsDelta * 4);
  const frontier = (controlledTilesDelta * 5)
    + (activeTilesDelta * 10)
    + (discoveredTilesDelta * 2)
    + (frontierDistanceDelta * 18)
    + (buildingDelta(input, baseline, 'townCenter') * 150)
    - (inactiveTilesDelta * 10);
  const logistics = (shipOrdersCompletedDelta * 180)
    + shipOrderValueDelta
    + (buildingDelta(input, baseline, 'harbor') * 130)
    + (buildingDelta(input, baseline, 'supplyDepot') * 90)
    + (buildingDelta(input, baseline, 'tradeCenter') * 160)
    + (productiveJobSitesDelta * 35)
    + (staffedJobSitesDelta * 15);
  const military = (watchtowersControlledDelta * 120)
    + (towerCapturesDelta * 220)
    + (towerDefensesDelta * 120)
    + (buildingDelta(input, baseline, 'barracks') * 150);
  const resilience = (restoredTilesDelta * 45)
    + (calamitiesSurvivedDelta * 160)
    + (populationDelta * 18)
    + (Math.min(foodMealsDelta, foodBufferCap) * 4)
    + (healthyBuildingsDelta * 14)
    + (maintainedBuildingsDelta * 4)
    + (Math.max(0, activeTilesDelta - inactiveTilesDelta) * 3)
    - (wornBuildings * 4)
    - (damagedBuildings * 18)
    - (offlineBuildings * 45)
    - (blockedJobSites * 22);

  return {
    charter: applyMultiplier('charter', charter, stage),
    frontier: applyMultiplier('frontier', frontier, stage),
    logistics: applyMultiplier('logistics', logistics, stage),
    military: applyMultiplier('military', military, stage),
    resilience: applyMultiplier('resilience', resilience, stage),
  };
}

export function buildLeaderboard(
  inputs: SeasonScoreInput[],
  stage?: SeasonStageConfig | null,
): LeaderboardEntry[] {
  return inputs
    .map((input) => {
      const breakdown = calculateScoreBreakdown(input, stage);
      return {
        rank: 0,
        playerId: input.playerId,
        playerName: input.playerName,
        playerColor: input.playerColor,
        settlementId: input.settlementId,
        score: totalScore(breakdown),
        breakdown,
        controlledTiles: input.controlledTiles,
        discoveredTiles: input.discoveredTiles,
        activeTiles: input.activeTiles,
        watchtowersControlled: input.watchtowersControlled,
        shipOrdersCompleted: input.shipOrdersCompleted,
        rewardTitles: [],
        defeated: !!input.defeat,
        defeatedAt: input.defeat?.defeatedAt,
        defeatedBySettlementId: input.defeat?.defeatedBySettlementId,
        defeatedByPlayerId: input.defeat?.defeatedByPlayerId ?? null,
        defeatedByPlayerName: input.defeat?.defeatedByPlayerName ?? null,
        capturedTownCenterTileId: input.defeat?.capturedTownCenterTileId,
        transferredTileCount: input.defeat?.transferredTileCount,
      };
    })
    .sort((left, right) => right.score - left.score || left.playerName.localeCompare(right.playerName))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function bestEntry(entries: LeaderboardEntry[], value: (entry: LeaderboardEntry) => number): LeaderboardEntry | null {
  return entries
    .slice()
    .sort((left, right) => value(right) - value(left) || right.score - left.score)[0] ?? null;
}

function formatGoalNumber(value: number | undefined, fallback = 1, minimum = 0) {
  return Math.max(minimum, Math.trunc(value ?? fallback)).toLocaleString();
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function pluralize(label: string, count: number) {
  if (count === 1) {
    return label;
  }
  if (label.endsWith('y')) {
    return `${label.slice(0, -1)}ies`;
  }
  if (label.endsWith('s')) {
    return label;
  }
  return `${label}s`;
}

export function formatSeasonEndGoalLabel(goal: SeasonEndGoalConfig) {
  const target = Math.max(1, Math.trunc(goal.target ?? 1));
  const targetLabel = formatGoalNumber(goal.target, 1, 1);
  const buildingLabel = goal.buildingKey ? humanizeKey(goal.buildingKey) : 'Special Building';

  switch (goal.kind) {
    case 'controlled_tiles':
      return `Control ${targetLabel} tiles`;
    case 'controlled_tiles_and_percent':
      return `Control ${targetLabel} tiles and ${formatGoalNumber(goal.percent, 0, 0)}% of claimed land`;
    case 'discovered_tiles':
      return `Discover ${targetLabel} world tiles`;
    case 'score_reached':
      return `Reach ${targetLabel} season score`;
    case 'special_building':
      return `Build a ${buildingLabel}`;
    case 'special_building_count':
      return `Build ${targetLabel} ${pluralize(buildingLabel, target)}`;
    case 'ship_orders_completed':
      return `Complete ${targetLabel} ship orders`;
    case 'watchtowers_controlled':
      return `Control ${targetLabel} watchtowers`;
    default:
      return goal.label;
  }
}

export function evaluateEndGoal(
  goal: SeasonEndGoalConfig,
  leaderboard: LeaderboardEntry[],
  totalDiscoveredTiles: number,
  activeStageKey: ActiveSeasonStageKey | 'completed',
  inputs: SeasonScoreInput[] = [],
): SeasonEndGoalProgress {
  const active = goal.enabled && activeStageKey !== 'completed' && goal.enabledDuring.includes(activeStageKey);
  const target = Math.max(1, Math.trunc(goal.target ?? 1));
  let progress = 0;
  let percent: number | undefined;
  let leader: LeaderboardEntry | null = leaderboard[0] ?? null;

  switch (goal.kind) {
    case 'controlled_tiles':
      leader = bestEntry(leaderboard, (entry) => entry.controlledTiles);
      progress = leader?.controlledTiles ?? 0;
      break;
    case 'controlled_tiles_and_percent': {
      leader = bestEntry(leaderboard, (entry) => entry.controlledTiles);
      progress = leader?.controlledTiles ?? 0;
      const denominator = Math.max(1, totalDiscoveredTiles);
      percent = Math.round((progress / denominator) * 1000) / 10;
      break;
    }
    case 'discovered_tiles':
      leader = null;
      progress = totalDiscoveredTiles;
      break;
    case 'score_reached':
      leader = bestEntry(leaderboard, (entry) => entry.score);
      progress = leader?.score ?? 0;
      break;
    case 'special_building':
    case 'special_building_count':
      if (goal.buildingKey) {
        const best = inputs
          .slice()
          .sort((left, right) => (right.buildings[goal.buildingKey!] ?? 0) - (left.buildings[goal.buildingKey!] ?? 0))[0] ?? null;
        progress = best ? (best.buildings[goal.buildingKey] ?? 0) : 0;
        leader = best ? leaderboard.find((entry) => entry.playerId === best.playerId) ?? null : null;
      }
      break;
    case 'ship_orders_completed':
      leader = bestEntry(leaderboard, (entry) => entry.shipOrdersCompleted);
      progress = leader?.shipOrdersCompleted ?? 0;
      break;
    case 'watchtowers_controlled':
      leader = bestEntry(leaderboard, (entry) => entry.watchtowersControlled);
      progress = leader?.watchtowersControlled ?? 0;
      break;
  }

  const percentTargetMet = goal.kind !== 'controlled_tiles_and_percent'
    || percent == null
    || percent >= Math.max(0, goal.percent ?? 0);

  return {
    id: goal.id,
    label: formatSeasonEndGoalLabel(goal),
    kind: goal.kind,
    enabled: goal.enabled,
    active,
    target,
    progress,
    percent,
    leaderPlayerId: leader?.playerId ?? null,
    leaderSettlementId: leader?.settlementId ?? null,
    completed: active && progress >= target && percentTargetMet,
  };
}
