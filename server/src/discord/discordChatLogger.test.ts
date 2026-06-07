import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscordChatLogger, formatDiscordChatMessage } from './discordChatLogger.ts';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function jsonBody(init?: RequestInit): Record<string, unknown> {
  const body = init?.body;
  assert.equal(typeof body, 'string');
  return JSON.parse(body as string);
}

test('formats chat messages for Discord without mentions or slash commands', () => {
  assert.equal(
    formatDiscordChatMessage({
      playerName: 'A@lice/Admin',
      message: 'hello @everyone /dance',
    }),
    ':speech_balloon: **AliceAdmin:** hello everyone dance',
  );
});

test('sends chat messages to a configured Discord channel', async () => {
  const calls: FetchCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: 'message-1' }), { status: 200 });
  };
  const logger = new DiscordChatLogger({
    apiBaseUrl: 'https://discord.test/api/v10',
    botToken: 'bot-token',
    channelId: 'channel-123',
    fetchImpl,
  });

  await logger.logChatMessage({
    playerName: 'Ada',
    message: 'hi @here /wave',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://discord.test/api/v10/channels/channel-123/messages');
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.equal((calls[0]!.init?.headers as Record<string, string>).Authorization, 'Bot bot-token');
  assert.deepEqual(jsonBody(calls[0]!.init), {
    content: ':speech_balloon: **Ada:** hi here wave',
    allowed_mentions: { parse: [] },
  });
});

test('creates a Discord text channel when only guild id and channel name are configured', async () => {
  const calls: FetchCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith('/guilds/guild-123/channels') && init?.method !== 'POST') {
      return new Response(JSON.stringify([
        { id: 'general-1', name: 'general', type: 0 },
      ]), { status: 200 });
    }

    if (url.endsWith('/guilds/guild-123/channels') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'created-channel' }), { status: 200 });
    }

    return new Response(JSON.stringify({ id: 'message-1' }), { status: 200 });
  };
  const logger = new DiscordChatLogger({
    apiBaseUrl: 'https://discord.test/api/v10',
    botToken: 'bot-token',
    guildId: 'guild-123',
    channelName: 'driftlands-chat',
    fetchImpl,
  });

  await logger.logChatMessage({
    playerName: 'Grace',
    message: 'first post',
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0]!.url, 'https://discord.test/api/v10/guilds/guild-123/channels');
  assert.equal(calls[1]!.url, 'https://discord.test/api/v10/guilds/guild-123/channels');
  assert.deepEqual(jsonBody(calls[1]!.init), {
    name: 'driftlands-chat',
    type: 0,
    topic: 'Driftlands in-game chat log.',
  });
  assert.equal(calls[2]!.url, 'https://discord.test/api/v10/channels/created-channel/messages');
});

test('skips Discord when no send target is configured', async () => {
  const calls: FetchCall[] = [];
  const logger = new DiscordChatLogger({
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    },
  });

  await logger.logChatMessage({
    playerName: 'Ada',
    message: 'quiet',
  });

  assert.equal(calls.length, 0);
});
