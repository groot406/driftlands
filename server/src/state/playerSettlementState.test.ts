import test from 'node:test';
import assert from 'node:assert/strict';

import { playerSettlementState } from './playerSettlementState.ts';

test.afterEach(() => {
  playerSettlementState.reset();
});

test('same-socket rejoin removes the stale unassigned player identity', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  playerSettlementState.registerPlayer('socket-1', 'player-b', 'Player B');

  assert.equal(playerSettlementState.getSocketPlayerId('socket-1'), 'player-b');
  assert.deepEqual(
    playerSettlementState.listPlayers().map((player) => ({
      id: player.id,
      connected: player.connected,
      settlementId: player.settlementId,
    })),
    [
      {
        id: 'player-b',
        connected: true,
        settlementId: null,
      },
    ],
  );
});

test('same-socket rejoin keeps prior settlement owners offline', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  assert.equal(playerSettlementState.assignPlayerSettlement('player-a', '0,0'), true);

  playerSettlementState.registerPlayer('socket-1', 'player-b', 'Player B');

  assert.equal(playerSettlementState.getSocketPlayerId('socket-1'), 'player-b');
  assert.deepEqual(
    playerSettlementState.listPlayers().map((player) => ({
      id: player.id,
      connected: player.connected,
      settlementId: player.settlementId,
    })),
    [
      {
        id: 'player-a',
        connected: false,
        settlementId: '0,0',
      },
      {
        id: 'player-b',
        connected: true,
        settlementId: null,
      },
    ],
  );
  assert.deepEqual(playerSettlementState.getSettlementOwner('0,0'), {
    playerId: 'player-a',
    playerName: 'Player A',
    playerColor: playerSettlementState.getPlayerColor('player-a'),
  });
});

test('unregistering a socket removes unassigned offline players', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');

  playerSettlementState.unregisterSocket('socket-1');

  assert.equal(playerSettlementState.getSocketPlayerId('socket-1'), null);
  assert.deepEqual(playerSettlementState.listPlayers(), []);
  assert.deepEqual(playerSettlementState.getPersistenceSnapshot().players, []);
});

test('persistence keeps settlement owners and skips unassigned live players', () => {
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  playerSettlementState.registerPlayer('socket-2', 'player-b', 'Player B');
  assert.equal(playerSettlementState.assignPlayerSettlement('player-b', '0,0'), true);

  const snapshot = playerSettlementState.getPersistenceSnapshot();

  assert.deepEqual(snapshot.players.map((player) => ({
    id: player.id,
    settlementId: player.settlementId,
  })), [
    {
      id: 'player-b',
      settlementId: '0,0',
    },
  ]);
  assert.deepEqual(snapshot.settlements, [
    {
      playerId: 'player-b',
      settlementId: '0,0',
    },
  ]);
});

test('loading persistence drops legacy unassigned offline players', () => {
  playerSettlementState.loadPersistenceSnapshot({
    players: [
      {
        id: 'stale-player',
        nickname: 'Stale Player',
        color: '#7dd3fc',
        settlementId: null,
      },
      {
        id: 'settled-player',
        nickname: 'Settled Player',
        color: '#a7f3d0',
        settlementId: '0,0',
      },
    ],
    settlements: [
      {
        playerId: 'settled-player',
        settlementId: '0,0',
      },
    ],
  });

  assert.deepEqual(playerSettlementState.listPlayers().map((player) => ({
    id: player.id,
    connected: player.connected,
    settlementId: player.settlementId,
  })), [
    {
      id: 'settled-player',
      connected: false,
      settlementId: '0,0',
    },
  ]);
  assert.equal(playerSettlementState.getSettlementOwner('0,0')?.playerId, 'settled-player');
});

test('clearing assignments removes offline owners but keeps connected players', () => {
  playerSettlementState.registerPlayer('socket-1', 'online-player', 'Online Player');
  assert.equal(playerSettlementState.assignPlayerSettlement('online-player', '0,0'), true);

  playerSettlementState.registerPlayer('socket-2', 'offline-player', 'Offline Player');
  assert.equal(playerSettlementState.assignPlayerSettlement('offline-player', '10,0'), true);
  playerSettlementState.unregisterSocket('socket-2');

  playerSettlementState.clearAssignments();

  assert.deepEqual(playerSettlementState.listPlayers().map((player) => ({
    id: player.id,
    connected: player.connected,
    settlementId: player.settlementId,
  })), [
    {
      id: 'online-player',
      connected: true,
      settlementId: null,
    },
  ]);
  assert.equal(playerSettlementState.getSettlementOwner('0,0'), null);
  assert.equal(playerSettlementState.getSettlementOwner('10,0'), null);
});
