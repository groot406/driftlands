import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaderboard, evaluateEndGoal, formatSeasonEndGoalLabel } from './scoring.ts';
import type { SeasonScoreInput, SeasonStageConfig } from './types.ts';

function input(overrides: Partial<SeasonScoreInput>): SeasonScoreInput {
  return {
    playerId: 'player-1',
    playerName: 'Pioneer',
    playerColor: '#fff',
    settlementId: '0,0',
    chapterNumber: 3,
    chaptersCompleted: 2,
    completedObjectives: 2,
    totalObjectives: 3,
    controlledTiles: 12,
    activeTiles: 10,
    inactiveTiles: 1,
    discoveredTiles: 18,
    restoredTiles: 0,
    frontierDistance: 4,
    buildings: {},
    watchtowersControlled: 1,
    shipOrdersCompleted: 0,
    shipOrderValue: 0,
    towerCaptures: 0,
    towerDefenses: 0,
    calamitiesSurvived: 0,
    ...overrides,
  };
}

test('stage multipliers adjust category scores without changing ordering inputs', () => {
  const base = buildLeaderboard([input({})])[0]!;
  const endgame: SeasonStageConfig = {
    key: 'endgame',
    enabled: true,
    durationMs: 1,
    borderPolicy: 'locked_open',
    allowSettlementStarts: false,
    allowNewHeroTasks: true,
    scoreMultiplier: { military: 2 },
  };
  const boosted = buildLeaderboard([input({})], endgame)[0]!;

  assert.equal(boosted.breakdown.military, base.breakdown.military * 2);
  assert.equal(boosted.breakdown.charter, base.breakdown.charter);
});

test('settlement start baseline keeps the initial season score at zero', () => {
  const startingState = input({
    chapterNumber: 1,
    chaptersCompleted: 0,
    completedObjectives: 0,
    totalObjectives: 2,
    controlledTiles: 18,
    activeTiles: 18,
    inactiveTiles: 0,
    discoveredTiles: 18,
    frontierDistance: 3,
    buildings: { townCenter: 1 },
    watchtowersControlled: 0,
  });
  const leaderboard = buildLeaderboard([{
    ...startingState,
    baseline: {
      chapterNumber: startingState.chapterNumber,
      chaptersCompleted: startingState.chaptersCompleted,
      completedObjectives: startingState.completedObjectives,
      controlledTiles: startingState.controlledTiles,
      activeTiles: startingState.activeTiles,
      inactiveTiles: startingState.inactiveTiles,
      discoveredTiles: startingState.discoveredTiles,
      restoredTiles: startingState.restoredTiles,
      frontierDistance: startingState.frontierDistance,
      buildings: { ...startingState.buildings },
      watchtowersControlled: startingState.watchtowersControlled,
      shipOrdersCompleted: startingState.shipOrdersCompleted,
      shipOrderValue: startingState.shipOrderValue,
      towerCaptures: startingState.towerCaptures,
      towerDefenses: startingState.towerDefenses,
      calamitiesSurvived: startingState.calamitiesSurvived,
    },
  }]);

  assert.equal(leaderboard[0]!.score, 0);
  assert.deepEqual(leaderboard[0]!.breakdown, {
    charter: 0,
    frontier: 0,
    logistics: 0,
    military: 0,
    resilience: 0,
  });
});

test('season score counts progress above the settlement start baseline', () => {
  const leaderboard = buildLeaderboard([input({
    chapterNumber: 2,
    completedObjectives: 1,
    controlledTiles: 22,
    activeTiles: 20,
    discoveredTiles: 24,
    frontierDistance: 4,
    buildings: { townCenter: 1, harbor: 1 },
    shipOrdersCompleted: 1,
    shipOrderValue: 75,
    baseline: {
      chapterNumber: 1,
      chaptersCompleted: 0,
      completedObjectives: 0,
      controlledTiles: 18,
      activeTiles: 18,
      inactiveTiles: 0,
      discoveredTiles: 18,
      restoredTiles: 0,
      frontierDistance: 3,
      buildings: { townCenter: 1 },
      watchtowersControlled: 0,
      shipOrdersCompleted: 0,
      shipOrderValue: 0,
      towerCaptures: 0,
      towerDefenses: 0,
      calamitiesSurvived: 0,
    },
  })]);

  assert.ok(leaderboard[0]!.score > 0);
  assert.equal(leaderboard[0]!.breakdown.frontier, 60);
  assert.equal(leaderboard[0]!.breakdown.logistics, 385);
});

test('resilience favors sustainable settlements over brittle sprawl', () => {
  const healthy = buildLeaderboard([input({
    playerId: 'healthy',
    playerName: 'Healthy',
    population: 10,
    beds: 12,
    foodMeals: 60,
    maintainedBuildings: 8,
    healthyBuildings: 8,
    productiveJobSites: 5,
    staffedJobSites: 5,
    baseline: {
      chapterNumber: 3,
      chaptersCompleted: 2,
      completedObjectives: 2,
      controlledTiles: 12,
      activeTiles: 10,
      inactiveTiles: 1,
      discoveredTiles: 18,
      restoredTiles: 0,
      frontierDistance: 4,
      buildings: {},
      watchtowersControlled: 1,
      shipOrdersCompleted: 0,
      shipOrderValue: 0,
      towerCaptures: 0,
      towerDefenses: 0,
      calamitiesSurvived: 0,
    },
  }), input({
    playerId: 'brittle',
    playerName: 'Brittle',
    restoredTiles: 5,
    inactiveTiles: 6,
    damagedBuildings: 3,
    offlineBuildings: 2,
    blockedJobSites: 4,
    baseline: {
      chapterNumber: 3,
      chaptersCompleted: 2,
      completedObjectives: 2,
      controlledTiles: 12,
      activeTiles: 10,
      inactiveTiles: 1,
      discoveredTiles: 18,
      restoredTiles: 0,
      frontierDistance: 4,
      buildings: {},
      watchtowersControlled: 1,
      shipOrdersCompleted: 0,
      shipOrderValue: 0,
      towerCaptures: 0,
      towerDefenses: 0,
      calamitiesSurvived: 0,
    },
  })]);

  assert.equal(healthy[0]!.playerId, 'healthy');
  assert.ok(healthy[0]!.breakdown.resilience > healthy[1]!.breakdown.resilience);
});

test('score end goals use the current leaderboard leader', () => {
  const leaderboard = buildLeaderboard([
    input({ playerId: 'low', playerName: 'Low', settlementId: '1,0', controlledTiles: 2 }),
    input({ playerId: 'high', playerName: 'High', settlementId: '2,0', controlledTiles: 80 }),
  ]);
  const goal = evaluateEndGoal({
    id: 'score',
    label: 'Score',
    kind: 'score_reached',
    enabled: true,
    enabledDuring: ['endgame'],
    target: leaderboard[0]!.score,
  }, leaderboard, 100, 'endgame');

  assert.equal(goal.completed, true);
  assert.equal(goal.leaderPlayerId, leaderboard[0]!.playerId);
});

test('end goal labels reflect configured parameters', () => {
  assert.equal(formatSeasonEndGoalLabel({
    id: 'control',
    label: 'Old control label',
    kind: 'controlled_tiles_and_percent',
    enabled: true,
    enabledDuring: ['endgame'],
    target: 125,
    percent: 42,
  }), 'Control 125 tiles and 42% of claimed land');

  assert.equal(formatSeasonEndGoalLabel({
    id: 'orders',
    label: 'Old order label',
    kind: 'ship_orders_completed',
    enabled: true,
    enabledDuring: ['endgame'],
    target: 9,
  }), 'Complete 9 ship orders');

  assert.equal(formatSeasonEndGoalLabel({
    id: 'buildings',
    label: 'Old building label',
    kind: 'special_building_count',
    enabled: true,
    enabledDuring: ['endgame'],
    target: 3,
    buildingKey: 'tradeCenter',
  }), 'Build 3 Trade Centers');
});

test('controlled tile percentage goals require both tile count and share', () => {
  const leaderboard = buildLeaderboard([
    input({ playerId: 'wide', playerName: 'Wide', settlementId: '3,0', controlledTiles: 40 }),
  ]);

  const incomplete = evaluateEndGoal({
    id: 'control',
    label: 'Control',
    kind: 'controlled_tiles_and_percent',
    enabled: true,
    enabledDuring: ['endgame'],
    target: 40,
    percent: 50,
  }, leaderboard, 100, 'endgame');
  const complete = evaluateEndGoal({
    id: 'control',
    label: 'Control',
    kind: 'controlled_tiles_and_percent',
    enabled: true,
    enabledDuring: ['endgame'],
    target: 40,
    percent: 40,
  }, leaderboard, 100, 'endgame');

  assert.equal(incomplete.completed, false);
  assert.equal(complete.completed, true);
});
