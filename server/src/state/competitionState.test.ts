import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { SeasonSnapshot } from '../../../src/shared/seasons/types.ts';
import { CompetitionState } from './competitionState.ts';

function tempCompetitionPath() {
  const dir = mkdtempSync(join(tmpdir(), 'driftlands-competition-'));
  return {
    dir,
    path: join(dir, 'competition-state.json'),
  };
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

function seasonSnapshot(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    seasonId: 'season-1',
    seed: 42,
    status: 'completed',
    startedAt: 1_000,
    currentStage: 'completed',
    stageStartedAt: 11_000,
    stageEndsAt: null,
    completedAt: 11_000,
    completedReason: {
      kind: 'timer',
      completedAt: 11_000,
      message: 'Season ended.',
    },
    config: { stages: [], endGoals: [] },
    leaderboard: [
      {
        rank: 1,
        playerId: 'player-one',
        playerName: 'Ada',
        playerColor: '#facc15',
        settlementId: '0,0',
        score: 3_200,
        breakdown: {
          charter: 1_000,
          frontier: 900,
          logistics: 700,
          military: 400,
          resilience: 200,
        },
        controlledTiles: 20,
        discoveredTiles: 32,
        activeTiles: 18,
        watchtowersControlled: 3,
        shipOrdersCompleted: 4,
        rewardTitles: [],
      },
      {
        rank: 2,
        playerId: 'player-two',
        playerName: 'Bea',
        playerColor: '#7dd3fc',
        settlementId: '8,0',
        score: 2_100,
        breakdown: {
          charter: 400,
          frontier: 300,
          logistics: 900,
          military: 100,
          resilience: 300,
        },
        controlledTiles: 12,
        discoveredTiles: 18,
        activeTiles: 11,
        watchtowersControlled: 1,
        shipOrdersCompleted: 7,
        rewardTitles: [],
      },
    ],
    endGoals: [],
    rewards: [
      {
        id: 'season-1:overall:player-one',
        kind: 'title',
        playerId: 'player-one',
        label: 'Season Champion',
        description: 'Finished first.',
        seasonId: 'season-1',
        category: 'overall',
      },
      {
        id: 'season-1:logistics:player-two',
        kind: 'badge',
        playerId: 'player-two',
        label: 'Harbor Master',
        description: 'Led logistics.',
        seasonId: 'season-1',
        category: 'logistics',
      },
    ],
    archive: [],
    ...overrides,
  };
}

test('competition playtime counts one active session per non-spectator player', () => {
  const { dir, path } = tempCompetitionPath();
  try {
    const competition = new CompetitionState({ persistencePath: path, now: () => 1_000 });

    competition.recordPlayerConnected('socket-a', {
      playerId: 'player-one',
      playerName: 'Ada',
      playerColor: '#facc15',
      spectator: false,
      connectedAt: 1_000,
    });
    competition.recordPlayerConnected('socket-b', {
      playerId: 'player-one',
      playerName: 'Ada',
      playerColor: '#facc15',
      spectator: false,
      connectedAt: 5_000,
    });
    competition.recordPlayerConnected('socket-c', {
      playerId: 'spectator',
      playerName: 'Watcher',
      spectator: true,
      connectedAt: 5_000,
    });

    competition.flushActiveSessions(11_000);
    competition.recordPlayerDisconnected('socket-a', 12_000);
    competition.flushActiveSessions(21_000);
    competition.recordPlayerDisconnected('socket-b', 25_000);

    const profile = competition.getSnapshot().profiles.find((entry) => entry.playerId === 'player-one');
    assert.equal(profile?.totalPlayMs, 24_000);
    assert.equal(competition.getSnapshot().profiles.some((entry) => entry.playerId === 'spectator'), false);
  } finally {
    cleanup(dir);
  }
});

test('competition state persists profiles, badges, and processed seasons', () => {
  const { dir, path } = tempCompetitionPath();
  try {
    const competition = new CompetitionState({ persistencePath: path, now: () => 12_000 });
    competition.recordPlayerConnected('socket-a', {
      playerId: 'player-one',
      playerName: 'Ada',
      playerColor: '#facc15',
      spectator: false,
      connectedAt: 1_000,
    });
    competition.recordPlayerDisconnected('socket-a', 11_000);
    competition.processCompletedSeason(seasonSnapshot());
    competition.saveNow('test');

    assert.equal(existsSync(path), true);

    const restored = new CompetitionState({ persistencePath: path, now: () => 12_000 });
    restored.loadFromDisk();
    const snapshot = restored.getSnapshot();
    const ada = snapshot.profiles.find((entry) => entry.playerId === 'player-one');

    assert.equal(ada?.totalPlayMs, 10_000);
    assert.equal(ada?.seasonWins, 1);
    assert.equal(ada?.badges.some((badge) => badge.label === 'Season Champion'), true);
    assert.equal(snapshot.processedSeasonIds.includes('season-1'), true);
  } finally {
    cleanup(dir);
  }
});

test('completed seasons are processed idempotently and keep best settlement records', () => {
  const { dir, path } = tempCompetitionPath();
  try {
    const competition = new CompetitionState({ persistencePath: path, now: () => 12_000 });
    const first = seasonSnapshot();
    competition.processCompletedSeason(first);
    competition.processCompletedSeason(first);
    competition.processCompletedSeason(seasonSnapshot({
      seasonId: 'season-2',
      completedAt: 21_000,
      leaderboard: first.leaderboard.map((entry) => (
        entry.playerId === 'player-one'
          ? { ...entry, score: 2_500 }
          : { ...entry, score: 4_200, rank: 1 }
      )),
      rewards: [],
    }));

    const snapshot = competition.getSnapshot();
    const ada = snapshot.profiles.find((entry) => entry.playerId === 'player-one');
    const bestSettlement = snapshot.settlements.find((entry) => entry.playerId === 'player-two');

    assert.equal(ada?.seasonsPlayed, 2);
    assert.equal(ada?.totalSeasonScore, 5_700);
    assert.equal(snapshot.processedSeasonIds.length, 2);
    assert.equal(bestSettlement?.score, 4_200);
    assert.equal(snapshot.settlements[0]?.playerId, 'player-two');
  } finally {
    cleanup(dir);
  }
});
