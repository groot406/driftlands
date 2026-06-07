import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server, Socket } from 'socket.io';
import { ServerPlayerHandler } from './playerHandler.ts';
import type { ChatLogMessage, DiscordChatLoggerLike } from '../discord/discordChatLogger.ts';

function createSocket() {
  const ownMessages: unknown[] = [];
  const broadcastMessages: unknown[] = [];
  const socket = {
    id: 'socket-1',
    emit(event: string, message: unknown) {
      assert.equal(event, 'message');
      ownMessages.push(message);
    },
    broadcast: {
      emit(event: string, message: unknown) {
        assert.equal(event, 'message');
        broadcastMessages.push(message);
      },
    },
  } as unknown as Socket;

  return { socket, ownMessages, broadcastMessages };
}

test('chat messages are forwarded to the Discord logger with server player identity', () => {
  const loggedMessages: ChatLogMessage[] = [];
  const logger: DiscordChatLoggerLike = {
    logChatMessage(message) {
      loggedMessages.push(message);
      return Promise.resolve();
    },
  };
  const handler = new ServerPlayerHandler({ emit() { return true; } } as unknown as Server, logger);
  const { socket, ownMessages, broadcastMessages } = createSocket();

  (handler as any).connectedPlayers.set('socket-1', {
    id: 'player-1',
    name: 'Ada',
    color: '#c99a4b',
    socket,
    spectator: false,
  });

  (handler as any).handleChatMessage(socket, {
    type: 'chat:message',
    playerId: 'client-player',
    playerName: 'Client Name',
    message: 'hello settlement',
  });

  assert.deepEqual(loggedMessages, [
    {
      playerId: 'player-1',
      playerName: 'Ada',
      message: 'hello settlement',
    },
  ]);
  assert.equal(ownMessages.length, 1);
  assert.equal(broadcastMessages.length, 1);
});
