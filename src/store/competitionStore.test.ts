import test from 'node:test';
import assert from 'node:assert/strict';

import type { CompetitionSnapshot } from '../shared/competition/types.ts';
import {
  competitionSnapshot,
  getCompetitionProfileForPlayer,
  loadCompetitionState,
  resetCompetitionStore,
} from './competitionStore.ts';

function snapshot(): CompetitionSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: 10_000,
    currentSeasonId: 'season-1',
    processedSeasonIds: ['season-0'],
    leaderboards: {
      overall: [{
        rank: 1,
        playerId: 'player-one',
        playerName: 'Ada',
        playerColor: '#facc15',
        value: 8_500,
        secondaryValue: 2_000,
        badgeCount: 1,
        seasonWins: 1,
        podiums: 1,
        currentSettlementId: '0,0',
        bestSettlementScore: 3_200,
      }],
      hours: [],
      settlements: [],
      badges: [],
    },
    profiles: [{
      playerId: 'player-one',
      playerName: 'Ada',
      playerColor: '#facc15',
      firstSeenAt: 1_000,
      lastSeenAt: 10_000,
      totalPlayMs: 3_600_000,
      totalSeasonScore: 3_200,
      currentSeasonScore: 2_000,
      lifetimePoints: 6_500,
      liveOverallScore: 8_500,
      seasonsPlayed: 1,
      seasonWins: 1,
      podiums: 1,
      hallOfFameFinishes: 1,
      currentSettlementId: '0,0',
      bestSettlement: null,
      recentResults: [],
      badges: [{
        id: 'badge-one',
        kind: 'title',
        playerId: 'player-one',
        label: 'Season Champion',
        description: 'Finished first.',
        awardedAt: 10_000,
        seasonId: 'season-0',
        category: 'overall',
      }],
    }],
    settlements: [],
    badges: [],
  };
}

test.afterEach(() => {
  resetCompetitionStore();
});

test('competition store clones snapshots before storing them', () => {
  const input = snapshot();
  loadCompetitionState(input);

  input.profiles[0]!.playerName = 'Mutated';
  input.leaderboards.overall[0]!.value = 1;
  input.profiles[0]!.badges[0]!.label = 'Mutated Badge';

  assert.equal(competitionSnapshot.value?.profiles[0]?.playerName, 'Ada');
  assert.equal(competitionSnapshot.value?.leaderboards.overall[0]?.value, 8_500);
  assert.equal(competitionSnapshot.value?.profiles[0]?.badges[0]?.label, 'Season Champion');
});

test('competition store resolves a profile for the current player id', () => {
  loadCompetitionState(snapshot());

  assert.equal(getCompetitionProfileForPlayer('player-one')?.playerName, 'Ada');
  assert.equal(getCompetitionProfileForPlayer('missing'), null);
  assert.equal(getCompetitionProfileForPlayer(null), null);
});
