import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearChatMessages,
  consumeOutgoingChatEcho,
  getUnreadChatCount,
  recordOutgoingChatMessage,
  addChatMessage,
  markChatMessagesRead,
} from './chatStore.ts';

test('outgoing chat echoes are consumed once for local own-message fallback', () => {
  clearChatMessages();

  recordOutgoingChatMessage({ playerId: 'player-a', message: 'hello' });

  assert.equal(consumeOutgoingChatEcho({ playerId: 'player-a', message: 'hello' }), true);
  assert.equal(consumeOutgoingChatEcho({ playerId: 'player-a', message: 'hello' }), false);
});

test('unread chat count increments only for unread messages and clears on read', () => {
  clearChatMessages();

  addChatMessage({
    playerId: 'player-b',
    playerName: 'Builder',
    message: 'incoming',
    isOwnMessage: false,
  }, { unread: true });
  addChatMessage({
    playerId: 'player-a',
    playerName: 'Me',
    message: 'own',
    isOwnMessage: true,
  });

  assert.equal(getUnreadChatCount.value, 1);

  markChatMessagesRead();
  assert.equal(getUnreadChatCount.value, 0);
});
