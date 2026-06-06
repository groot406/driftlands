import test from 'node:test';
import assert from 'node:assert/strict';

import type { SeasonSnapshot } from '../shared/seasons/types.ts';
import {
  activeSettlementDefeat,
  dismissSettlementDefeat,
  queueSettlementDefeatAnnouncements,
  resetSettlementDefeats,
} from './settlementDefeatStore.ts';

function seasonSnapshot(defeated = false): SeasonSnapshot {
  return {
    seasonId: 'season-1',
    seed: 1,
    status: 'active',
    startedAt: 0,
    currentStage: 'endgame',
    stageStartedAt: 0,
    stageEndsAt: 100_000,
    config: { stages: [], endGoals: [] },
    leaderboard: [{
      rank: 1,
      playerId: 'defender-player',
      playerName: 'Defender',
      playerColor: '#fff',
      settlementId: '6,0',
      score: 500,
      breakdown: { charter: 0, frontier: 0, logistics: 0, military: 500, resilience: 0 },
      controlledTiles: 0,
      discoveredTiles: 0,
      activeTiles: 0,
      watchtowersControlled: 0,
      shipOrdersCompleted: 0,
      rewardTitles: [],
      defeated,
      defeatedAt: defeated ? 5_000 : undefined,
      defeatedBySettlementId: defeated ? '0,0' : undefined,
      defeatedByPlayerId: defeated ? 'attacker-player' : undefined,
      defeatedByPlayerName: defeated ? 'Attacker' : undefined,
      capturedTownCenterTileId: defeated ? '6,0' : undefined,
      transferredTileCount: defeated ? 12 : undefined,
    }],
    endGoals: [],
    rewards: [],
    archive: [],
  };
}

test.afterEach(() => {
  resetSettlementDefeats();
});

test('season updates queue one settlement defeat announcement when a leaderboard entry becomes defeated', () => {
  queueSettlementDefeatAnnouncements(seasonSnapshot(false), seasonSnapshot(true), { emitEffects: false });

  assert.equal(activeSettlementDefeat.value?.defeatedPlayerName, 'Defender');
  assert.equal(activeSettlementDefeat.value?.defeatedByPlayerName, 'Attacker');
  assert.equal(activeSettlementDefeat.value?.transferredTileCount, 12);

  queueSettlementDefeatAnnouncements(seasonSnapshot(true), seasonSnapshot(true), { emitEffects: false });
  dismissSettlementDefeat();
  assert.equal(activeSettlementDefeat.value, null);
});
