import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInitialMessagesForConnectionIntent, buildSocketClientOptions } from './socket.ts';

test('public competition intent requests the leaderboard without joining a player', () => {
  const messages = buildInitialMessagesForConnectionIntent({ mode: 'competition' }, () => 1234);

  assert.deepEqual(messages, [{
    type: 'competition:request_snapshot',
    timestamp: 1234,
  }]);
  assert.equal(messages.some((message) => message.type === 'player:join'), false);
});

test('explicit socket server URLs use websocket transport', () => {
  assert.deepEqual(buildSocketClientOptions('https://driftlands.ddns.net'), {
    url: 'https://driftlands.ddns.net',
    options: {
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket'],
    },
  });
});

test('same-origin socket server keeps default transports', () => {
  assert.deepEqual(buildSocketClientOptions(''), {
    url: undefined,
    options: {
      path: '/socket.io',
      autoConnect: false,
      transports: undefined,
    },
  });
});
