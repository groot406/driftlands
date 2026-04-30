import { computed, ref } from 'vue';
import { io } from 'socket.io-client';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { clientMessageRouter } from './messageRouter';
import { initializeClientHandlers } from './messageHandlers';
import { addPlayer, removePlayer } from '../store/playerStore';
import { sanitizePlayerNickname } from '../shared/multiplayer/player.ts';

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

// Determine URL only in browser; Node lacks import.meta.env
const isBrowser = typeof window !== 'undefined';
const env = (isBrowser ? (import.meta as any)?.env : null) || {};
// Prefer explicit VITE_SERVER_URL when provided. Otherwise use same-origin and
// let Vite proxy `/socket.io` in development.
const SOCKET_URL = isBrowser ? (env.VITE_SERVER_URL || undefined) : undefined;

export const socket = io(SOCKET_URL, {
  path: '/socket.io',
  autoConnect: false,
});
export const currentPlayer = ref<{ id: string; name: string } | null>(null);
export const currentPlayerId = computed(() => currentPlayer.value?.id ?? null);

// Generic message sending function
export function sendMessage(message: ClientMessage): void {
  if (socket.connected) {
    console.debug('Sending message:', message);
    socket.emit('message', message);
  } else {
    console.warn('Cannot send message - socket not connected:', message);
  }
}

// Initialize message handling
initializeClientHandlers();

socket.on('connect', () => {
  initializeClientHandlers();
  join();
});

function join() {
  // TODO: Player id should be logged in WALLET
  const playerId = getStoredPlayerName();
  const playerName = getStoredPlayerName();

  currentPlayer.value = {
    id: playerId,
    name: playerName,
  };

  addPlayer({ id: playerId, name: playerName });
  sendMessage({
    type: 'player:join',
    playerId,
    playerName,
    timestamp: Date.now(),
  });
}

export function connectWithNickname(nickname: string) {
  setStoredPlayerName(nickname);

  if (socket.connected) {
    join();
    return;
  }

  socket.connect();
}

export function getCurrentPlayerInfo(): { id: string; name: string } | null {
  return currentPlayer.value ? { ...currentPlayer.value } : null;
}

socket.on('disconnect', () => {
  const playerInfo = currentPlayer.value;

  if (playerInfo) {
    removePlayer(playerInfo.id);
  }

  currentPlayer.value = null;
});

// Route all incoming messages through the message router
socket.on('message', (message: ServerMessage) => {
  clientMessageRouter.route(message);
});

// Handle connection errors
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
