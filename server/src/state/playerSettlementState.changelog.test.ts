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

  const snapshot = playerSettlementState.getPersistenceSnapshot();
  assert.equal(snapshot.players[0]?.lastSeenChangelogAt, 12345);

  playerSettlementState.reset();
  playerSettlementState.loadPersistenceSnapshot(snapshot);

  assert.equal(playerSettlementState.getLastSeenChangelogAt('player-a'), 12345);
});

test('legacy player snapshots default to no changelog seen', () => {
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
});
