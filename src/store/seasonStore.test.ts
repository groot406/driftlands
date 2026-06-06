import test from 'node:test';
import assert from 'node:assert/strict';

import type { SeasonSnapshot } from '../shared/seasons/types.ts';
import { getSeasonEntryForPlayer, isPlayerDefeatedInCurrentSeason, loadSeasonState, resetSeasonStore } from './seasonStore.ts';

function createSeason(): SeasonSnapshot {
  return {
    seasonId: 'season-test',
    seed: 42,
    status: 'active',
    startedAt: 1_000,
    currentStage: 'endgame',
    stageStartedAt: 1_000,
    stageEndsAt: 2_000,
    nextSeasonStartsAt: null,
    config: {
      stages: [
        {
          key: 'endgame',
          label: 'Endgame',
          enabled: true,
          durationMs: 1_000,
          allowSettlementStarts: true,
          allowNewHeroTasks: true,
          borderPolicy: 'locked_open',
          gameplay: {},
        },
      ],
      endGoals: [],
    },
    leaderboard: [
      {
        playerId: 'attacker-player',
        playerName: 'Attacker',
        playerColor: '#8ecae6',
        settlementId: '0,0',
        rank: 1,
        score: 100,
        breakdown: { charter: 0, frontier: 0, logistics: 0, military: 100, resilience: 0 },
        rewardTitles: [],
        controlledTiles: 10,
        activeTiles: 10,
        inactiveTiles: 0,
        restoredTiles: 0,
        watchtowersControlled: 0,
      },
      {
        playerId: 'defender-player',
        playerName: 'Defender',
        playerColor: '#fb7185',
        settlementId: '6,0',
        rank: 2,
        score: 80,
        breakdown: { charter: 0, frontier: 0, logistics: 0, military: 80, resilience: 0 },
        rewardTitles: [],
        controlledTiles: 0,
        activeTiles: 0,
        inactiveTiles: 0,
        restoredTiles: 0,
        watchtowersControlled: 0,
        defeated: true,
        defeatedAt: 5_000,
        defeatedBySettlementId: '0,0',
        defeatedByPlayerId: 'attacker-player',
        defeatedByPlayerName: 'Attacker',
        capturedTownCenterTileId: '6,0',
        transferredTileCount: 11,
      },
    ],
    endGoals: [],
    rewards: [],
    archive: [],
  };
}

test.afterEach(() => {
  resetSeasonStore();
});

test('season store exposes defeated status for player entries', () => {
  loadSeasonState(createSeason());

  assert.equal(getSeasonEntryForPlayer('defender-player')?.settlementId, '6,0');
  assert.equal(isPlayerDefeatedInCurrentSeason('defender-player'), true);
  assert.equal(isPlayerDefeatedInCurrentSeason('attacker-player'), false);
  assert.equal(isPlayerDefeatedInCurrentSeason(null), false);
});
