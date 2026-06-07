import test from 'node:test';
import assert from 'node:assert/strict';

import { playerSettlementState } from './playerSettlementState.ts';

test.afterEach(() => {
  playerSettlementState.reset();
});

test('changelog acknowledgement is saved and restored for settled players', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  assert.equal(playerSettlementState.assignPlayerSettlement('player-a', '0,0'), true);

  playerSettlementState.setLastSeenChangelogAt('player-a', 12345);
  playerSettlementState.recordLoginForChangelog('player-a', 23456);

  const snapshot = playerSettlementState.getPersistenceSnapshot();
  assert.equal(snapshot.players[0]?.lastSeenChangelogAt, 12345);
  assert.equal(snapshot.players[0]?.lastLoginAt, 23456);

  playerSettlementState.reset();
  playerSettlementState.loadPersistenceSnapshot(snapshot);

  assert.equal(playerSettlementState.getLastSeenChangelogAt('player-a'), 12345);
  assert.equal(playerSettlementState.getLastLoginAt('player-a'), 23456);
});

test('legacy player snapshots default to no changelog seen and no previous login', () => {
  playerSettlementState.loadPersistenceSnapshot({
    players: [
      {
        id: 'player-a',
        nickname: 'Player A',
        color: '#7dd3fc',
        settlementId: '0,0',
      },
    ],
    settlements: [
      {
        playerId: 'player-a',
        settlementId: '0,0',
      },
    ],
  });

  assert.equal(playerSettlementState.getLastSeenChangelogAt('player-a'), null);
  assert.equal(playerSettlementState.getLastLoginAt('player-a'), null);
});

test('first login uses the current login time as the changelog checkpoint', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');

  const login = playerSettlementState.recordLoginForChangelog('player-a', 2000);

  assert.deepEqual(login, {
    previousLoginAt: null,
    lastSeenChangelogAt: null,
    checkpointAt: 2000,
  });
  assert.equal(playerSettlementState.getLastLoginAt('player-a'), 2000);
});

test('returning login uses the previous login unless acknowledgement is newer', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  playerSettlementState.recordLoginForChangelog('player-a', 1000);

  let login = playerSettlementState.recordLoginForChangelog('player-a', 2000);

  assert.equal(login.previousLoginAt, 1000);
  assert.equal(login.checkpointAt, 1000);

  playerSettlementState.setLastSeenChangelogAt('player-a', 1500);

  login = playerSettlementState.recordLoginForChangelog('player-a', 2500);

  assert.equal(login.previousLoginAt, 2000);
  assert.equal(login.lastSeenChangelogAt, 1500);
  assert.equal(login.checkpointAt, 2000);

  playerSettlementState.setLastSeenChangelogAt('player-a', 3000);

  login = playerSettlementState.recordLoginForChangelog('player-a', 4000);

  assert.equal(login.previousLoginAt, 2500);
  assert.equal(login.lastSeenChangelogAt, 3000);
  assert.equal(login.checkpointAt, 3000);
});
