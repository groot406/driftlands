import test from 'node:test';
import assert from 'node:assert/strict';

import { ServerChangelogHandler } from './changelogHandler.ts';
import { serverMessageRouter } from '../messages/messageRouter.ts';
import { playerSettlementState } from '../state/playerSettlementState.ts';

function fakeSocket(id: string) {
  const messages: unknown[] = [];
  return {
    socket: {
      id,
      emit(event: string, message: unknown) {
        if (event === 'message') {
          messages.push(message);
        }
      },
    } as any,
    messages,
  };
}

test.afterEach(() => {
  serverMessageRouter.clear();
  playerSettlementState.reset();
});

test('player join receives changelog snapshot for the current player', async () => {
  const { socket, messages } = fakeSocket('socket-1');
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  playerSettlementState.setLastSeenChangelogAt('player-a', 500);
  new ServerChangelogHandler([
    {
      id: 'backend-600',
      releasedAt: 600,
      target: 'backend',
      title: 'Server work',
      bullets: ['The colony runs more smoothly.'],
    },
  ]).init();

  await serverMessageRouter.route(socket, {
    type: 'player:join',
    playerId: 'player-a',
    playerName: 'Player A',
  } as any);

  assert.deepEqual(messages, [
    {
      type: 'changelog:snapshot',
      entries: [
        {
          id: 'backend-600',
          releasedAt: 600,
          target: 'backend',
          title: 'Server work',
          bullets: ['The colony runs more smoothly.'],
        },
      ],
      lastSeenChangelogAt: 500,
    },
  ]);
});

test('changelog ack updates only the socket player checkpoint', async () => {
  const { socket } = fakeSocket('socket-1');
  playerSettlementState.registerPlayer('socket-1', 'player-a', 'Player A');
  playerSettlementState.registerPlayer('socket-2', 'player-b', 'Player B');
  new ServerChangelogHandler([]).init();

  await serverMessageRouter.route(socket, {
    type: 'changelog:ack',
    seenAt: 900,
  } as any);

  assert.equal(playerSettlementState.getLastSeenChangelogAt('player-a'), 900);
  assert.equal(playerSettlementState.getLastSeenChangelogAt('player-b'), null);
});
