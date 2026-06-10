import { computed, ref } from 'vue';
import { io } from 'socket.io-client';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import type { LooperlandsJoinAuth } from '../shared/looperlands.ts';
import { buildLooperlandsPlayerId } from '../shared/looperlands.ts';
import type { StoryHeroId } from '../shared/story/heroRoster.ts';
import { clientMessageRouter } from './messageRouter';
import { initializeClientHandlers } from './messageHandlers';
import { addPlayer, removePlayer } from '../store/playerStore';
import { sanitizePlayerNickname } from '../shared/multiplayer/player.ts';
import { getDriftlandsServerUrl, setRuntimeDriftlandsServerUrl } from './driftlandsServerUrl.ts';
import { startWorldSyncLoader, updateWorldSyncLoader } from './worldSyncLoader.ts';
import { setSettlementStartSpectatorMode } from '../store/settlementStartStore.ts';
import { configureWindowAnalytics } from './windowManager.ts';

const PLAYER_ID_KEY = 'driftlands-player-id-v1';
const PLAYER_NAME_KEY = 'driftlands-player-name-v1';

function createTemporaryPlayerId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `temp:${crypto.randomUUID()}`;
  }

  return `temp:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function getStoredPlayerId() {
  if (typeof window === 'undefined') {
    return 'temp:server-preview';
  }

  try {
    const raw = window.localStorage.getItem(PLAYER_ID_KEY);
    if (raw?.trim()) {
      return raw.trim();
    }

    const created = createTemporaryPlayerId();
    window.localStorage.setItem(PLAYER_ID_KEY, created);
    return created;
  } catch {
    return createTemporaryPlayerId();
  }
}

export function clearStoredPlayerId() {
  try {
    window.localStorage.removeItem(PLAYER_ID_KEY);
  } catch {
  }
}

export function getStoredPlayerName() {
  if (typeof window === 'undefined') {
    return 'Pioneer';
  }

  const fallbackName = `Pioneer ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  try {
    const raw = window.localStorage.getItem(PLAYER_NAME_KEY);
    if (raw && raw.trim()) {
      return sanitizePlayerNickname(raw);
    }

    window.localStorage.setItem(PLAYER_NAME_KEY, fallbackName);
  } catch {
    return fallbackName;
  }

  return fallbackName;
}

export function setStoredPlayerName(name: string) {
  const sanitized = sanitizePlayerNickname(name);
  try {
    window.localStorage.setItem(PLAYER_NAME_KEY, sanitized);
  } catch {
  }

  return sanitized;
}

const isBrowser = typeof window !== 'undefined';
type SocketClientConfig = {
  url: string | undefined;
  options: {
    path: '/socket.io';
    autoConnect: false;
    transports: string[] | undefined;
  };
};

export function buildSocketClientOptions(serverUrl: string): SocketClientConfig {
  const url = serverUrl.trim().replace(/\/$/, '') || undefined;
  return {
    url,
    options: {
      path: '/socket.io',
      autoConnect: false,
      transports: url ? ['websocket'] : undefined,
    },
  };
}

function createSocket(serverUrl = isBrowser ? getDriftlandsServerUrl() : '') {
  const config = buildSocketClientOptions(serverUrl);
  if (isBrowser) {
    console.info('[driftlands] socket server', config.url || '(same-origin)');
  }

  return io(config.url, config.options);
}

export let socket = createSocket();
export const currentPlayer = ref<{ id: string; name: string; spectator?: boolean } | null>(null);
export const currentPlayerId = computed(() => currentPlayer.value?.id ?? null);
export const currentPlayerIsSpectator = computed(() => currentPlayer.value?.spectator === true);
let pendingLooperlandsAuth: LooperlandsJoinAuth | null = null;
let pendingStoryHeroIds: StoryHeroId[] | null = null;
let pendingSpectator = false;
let pendingConnectionMode: 'join' | 'competition' = 'join';

export type SocketConnectionIntent = { mode: 'competition' };

export function buildInitialMessagesForConnectionIntent(
  intent: SocketConnectionIntent,
  now: () => number = Date.now,
): ClientMessage[] {
  if (intent.mode === 'competition') {
    return [{
      type: 'competition:request_snapshot',
      timestamp: now(),
    }];
  }

  return [];
}

// Generic message sending function
export function sendMessage(message: ClientMessage): void {
  if (socket.connected) {
    console.debug('Sending message:', message);
    socket.emit('message', message);
  } else {
    console.warn('Cannot send message - socket not connected:', message);
  }
}

configureWindowAnalytics((event) => {
  sendMessage({
    type: 'analytics:client_event',
    event: event.event,
    name: event.name,
    at: event.at,
    timestamp: event.at,
  });
});

function attachSocketHandlers() {
  socket.on('connect', () => {
    initializeClientHandlers();
    if (pendingConnectionMode === 'competition') {
      requestCompetitionSnapshotAndOpen();
      return;
    }
    updateWorldSyncLoader({ status: 'Joining colony...' });
    join();
  });

  socket.on('disconnect', () => {
    const playerInfo = currentPlayer.value;

    if (playerInfo) {
      removePlayer(playerInfo.id);
    }

    currentPlayer.value = null;
    setSettlementStartSpectatorMode(false);
  });

  // Route all incoming messages through the message router
  socket.on('message', (message: ServerMessage) => {
    if (message.type === 'player:snapshot' && message.currentPlayerId && currentPlayer.value) {
      const serverPlayer = message.players.find((player) => player.id === message.currentPlayerId);
      currentPlayer.value = {
        ...currentPlayer.value,
        id: message.currentPlayerId,
        name: serverPlayer?.nickname ?? currentPlayer.value.name,
      };
    }

    clientMessageRouter.route(message);
  });

  // Handle connection errors
  socket.on('connect_error', (error) => {
    updateWorldSyncLoader({
      title: 'Connection failed',
      status: error.message || 'Could not reach the Driftlands server.',
      infinite: true,
    });
    console.error('Connection error:', error);
  });
}

// Initialize message handling
initializeClientHandlers();
attachSocketHandlers();

export function configureSocketServerUrl(serverUrl: string) {
  const normalized = setRuntimeDriftlandsServerUrl(serverUrl);
  const nextSocket = createSocket(normalized);
  if (socket.connected) {
    socket.disconnect();
  }

  socket.removeAllListeners();
  socket = nextSocket;
  attachSocketHandlers();
  return normalized;
}

function join() {
  const playerId = pendingLooperlandsAuth
    ? buildLooperlandsPlayerId(pendingLooperlandsAuth.walletAddress, pendingLooperlandsAuth.chainId)
    : getStoredPlayerId();
  const playerName = getStoredPlayerName();

  currentPlayer.value = {
    id: playerId,
    name: playerName,
    spectator: pendingSpectator,
  };
  setSettlementStartSpectatorMode(pendingSpectator);

  addPlayer({ id: playerId, name: playerName });
  sendMessage({
    type: 'player:join',
    playerId,
    playerName,
    looperlands: pendingLooperlandsAuth ?? undefined,
    storyHeroIds: pendingStoryHeroIds ?? undefined,
    spectator: pendingSpectator,
    timestamp: Date.now(),
  });
}

export function connectWithNickname(
  nickname: string,
  looperlandsAuth?: LooperlandsJoinAuth | null,
  storyHeroIds?: StoryHeroId[] | null,
  options: { spectator?: boolean } = {},
) {
  setStoredPlayerName(nickname);
  pendingLooperlandsAuth = looperlandsAuth ?? null;
  pendingStoryHeroIds = storyHeroIds ?? null;
  pendingSpectator = options.spectator === true;
  pendingConnectionMode = 'join';
  startWorldSyncLoader(socket.connected ? (pendingSpectator ? 'Joining as spectator...' : 'Joining colony...') : 'Connecting to frontier...');

  if (socket.connected) {
    join();
    return;
  }

  socket.connect();
}

function requestCompetitionSnapshotAndOpen() {
  for (const message of buildInitialMessagesForConnectionIntent({ mode: 'competition' })) {
    sendMessage(message);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('driftlands:open-global-competition'));
  }
}

export function connectForCompetitionSnapshot() {
  pendingConnectionMode = 'competition';
  pendingLooperlandsAuth = null;
  pendingStoryHeroIds = null;
  pendingSpectator = false;
  setSettlementStartSpectatorMode(false);

  if (socket.connected) {
    requestCompetitionSnapshotAndOpen();
    return;
  }

  socket.connect();
}

export function getCurrentPlayerInfo(): { id: string; name: string } | null {
  return currentPlayer.value ? { ...currentPlayer.value } : null;
}
