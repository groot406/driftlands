const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const DEFAULT_CHANNEL_NAME = 'driftlands-chat';
const DEFAULT_CHANNEL_TOPIC = 'Driftlands in-game chat log.';
const DISCORD_TEXT_CHANNEL_TYPE = 0;
const DISCORD_MESSAGE_LIMIT = 2000;

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ChatLogMessage = {
  playerId?: string;
  playerName: string;
  message: string;
};

export interface DiscordChatLoggerLike {
  logChatMessage(message: ChatLogMessage): Promise<void>;
}

export type DiscordChatLoggerOptions = {
  apiBaseUrl?: string;
  botToken?: string;
  categoryId?: string;
  channelId?: string;
  channelName?: string;
  fetchImpl?: FetchImpl;
  guildId?: string;
  webhookUrl?: string;
  warn?: (message: string, error?: unknown) => void;
};

type DiscordChannel = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
};

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeChannelName(name: string | undefined): string {
  const normalized = (name ?? DEFAULT_CHANNEL_NAME)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');

  return normalized || DEFAULT_CHANNEL_NAME;
}

function sanitizeDiscordText(value: string): string {
  return value
    .replace(/[@/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateDiscordMessage(value: string): string {
  if (value.length <= DISCORD_MESSAGE_LIMIT) {
    return value;
  }

  return `${value.slice(0, DISCORD_MESSAGE_LIMIT - 3)}...`;
}

export function formatDiscordChatMessage(message: Pick<ChatLogMessage, 'playerName' | 'message'>): string {
  const playerName = sanitizeDiscordText(message.playerName).slice(0, 80) || 'Unknown player';
  const chatMessage = sanitizeDiscordText(message.message);

  if (!chatMessage) {
    return '';
  }

  return truncateDiscordMessage(`:speech_balloon: **${playerName}:** ${chatMessage}`);
}

export function getDiscordChatLoggerOptionsFromEnv(): DiscordChatLoggerOptions {
  return {
    botToken: optionalEnv('DRIFTLANDS_DISCORD_BOT_TOKEN') ?? optionalEnv('DISCORD_TOKEN'),
    categoryId: optionalEnv('DRIFTLANDS_DISCORD_CATEGORY_ID'),
    channelId: optionalEnv('DRIFTLANDS_DISCORD_CHANNEL_ID'),
    channelName: optionalEnv('DRIFTLANDS_DISCORD_CHANNEL_NAME'),
    guildId: optionalEnv('DRIFTLANDS_DISCORD_GUILD_ID'),
    webhookUrl: optionalEnv('DRIFTLANDS_DISCORD_WEBHOOK_URL'),
  };
}

export class DiscordChatLogger implements DiscordChatLoggerLike {
  private readonly apiBaseUrl: string;
  private readonly botToken?: string;
  private readonly categoryId?: string;
  private readonly channelName: string;
  private readonly fetchImpl: FetchImpl;
  private readonly guildId?: string;
  private readonly webhookUrl?: string;
  private readonly warn: (message: string, error?: unknown) => void;
  private resolvedChannelId?: string;
  private warnedAfterFailure = false;

  constructor(options: DiscordChatLoggerOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? DISCORD_API_BASE_URL;
    this.botToken = options.botToken;
    this.categoryId = options.categoryId;
    this.channelName = normalizeChannelName(options.channelName);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.guildId = options.guildId;
    this.resolvedChannelId = options.channelId;
    this.webhookUrl = options.webhookUrl;
    this.warn = options.warn ?? console.warn;
  }

  async logChatMessage(message: ChatLogMessage): Promise<void> {
    const content = formatDiscordChatMessage(message);
    if (!content || !this.hasSendTarget()) {
      return;
    }

    try {
      if (this.webhookUrl) {
        await this.postWebhookMessage(content);
        return;
      }

      const channelId = await this.resolveChannelId();
      if (!channelId) {
        return;
      }

      await this.postChannelMessage(channelId, content);
    } catch (error) {
      this.warnOnce('Failed to log Driftlands chat message to Discord.', error);
    }
  }

  private hasSendTarget(): boolean {
    return Boolean(this.webhookUrl || (this.botToken && (this.resolvedChannelId || this.guildId)));
  }

  private async resolveChannelId(): Promise<string | undefined> {
    if (this.resolvedChannelId) {
      return this.resolvedChannelId;
    }

    if (!this.botToken || !this.guildId) {
      return undefined;
    }

    const existingChannels = await this.getGuildChannels();
    const existingChannel = existingChannels.find((channel) => (
      channel.type === DISCORD_TEXT_CHANNEL_TYPE
      && channel.name === this.channelName
      && typeof channel.id === 'string'
    ));

    if (typeof existingChannel?.id === 'string') {
      this.resolvedChannelId = existingChannel.id;
      return this.resolvedChannelId;
    }

    const createdChannel = await this.createGuildTextChannel();
    if (typeof createdChannel.id === 'string') {
      this.resolvedChannelId = createdChannel.id;
    }

    return this.resolvedChannelId;
  }

  private async getGuildChannels(): Promise<DiscordChannel[]> {
    const response = await this.fetchJson<unknown>(`${this.apiBaseUrl}/guilds/${this.guildId}/channels`, {
      method: 'GET',
      headers: this.botHeaders(),
    });

    return Array.isArray(response) ? response as DiscordChannel[] : [];
  }

  private async createGuildTextChannel(): Promise<DiscordChannel> {
    const body: Record<string, unknown> = {
      name: this.channelName,
      type: DISCORD_TEXT_CHANNEL_TYPE,
      topic: DEFAULT_CHANNEL_TOPIC,
    };

    if (this.categoryId) {
      body.parent_id = this.categoryId;
    }

    return this.fetchJson<DiscordChannel>(`${this.apiBaseUrl}/guilds/${this.guildId}/channels`, {
      method: 'POST',
      headers: this.botHeaders(),
      body: JSON.stringify(body),
    });
  }

  private async postChannelMessage(channelId: string, content: string): Promise<void> {
    await this.fetchJson<unknown>(`${this.apiBaseUrl}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.botHeaders(),
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
      }),
    });
  }

  private async postWebhookMessage(content: string): Promise<void> {
    await this.fetchJson<unknown>(this.webhookUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Driftlands Chat',
        content,
        allowed_mentions: { parse: [] },
      }),
    });
  }

  private botHeaders(): Record<string, string> {
    return {
      Authorization: `Bot ${this.botToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Discord request failed with ${response.status}: ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private warnOnce(message: string, error: unknown): void {
    if (this.warnedAfterFailure) {
      return;
    }

    this.warnedAfterFailure = true;
    this.warn(message, error);
  }
}

export const discordChatLogger = new DiscordChatLogger(getDiscordChatLoggerOptionsFromEnv());
