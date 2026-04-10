import { computed, ref } from 'vue';
import { io } from 'socket.io-client';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { clientMessageRouter } from './messageRouter';
import { initializeClientHandlers } from './messageHandlers';
import { addPlayer, removePlayer } from '../store/playerStore';

const PLAYER_NAME_KEY = 'driftlands-player-name-v1';

function getStoredPlayerName() {
  if (typeof window === 'undefined') {
    return 'Pioneer';
  }

  const fallbackName = `Pioneer ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  try {
    const raw = window.localStorage.getItem(PLAYER_NAME_KEY);
    if (raw && raw.trim()) {
      return raw.trim();
    }

    window.localStorage.setItem(PLAYER_NAME_KEY, fallbackName);
  } catch {
    return fallbackName;
  }

  return fallbackName;
}

// Determine URL only in browser; Node lacks import.meta.env
const isBrowser = typeof window !== 'undefined';
const env = (isBrowser ? (import.meta as any)?.env : {}) || {};
// Prefer explicit VITE_SERVER_URL when provided. Otherwise use same-origin and
// let Vite proxy `/socket.io` in development.
const SOCKET_URL = isBrowser ? (env.VITE_SERVER_URL || undefined) : undefined;

export const socket = io(SOCKET_URL, {
  path: '/socket.io',
});
export const currentPlayer = ref<{ id: string; name: string } | null>(null);
export const currentPlayerId = computed(() => currentPlayer.value?.id ?? null);

// Generic message sending function
export function sendMessage(message: ClientMessage): void {
  if (socket.connected) {
    socket.emit('message', message);
  } else {
    console.warn('Cannot send message - socket not connected:', message);
  }
}

// Initialize message handling
initializeClientHandlers();

socket.on('connect', () => {
  initializeClientHandlers();

  const playerId = socket.id ?? `player-${Date.now()}`;
  const playerName = getStoredPlayerName();

  currentPlayer.value = {
    id: playerId,
    name: playerName,
  };

  addPlayer({ id: playerId, name: playerName });

  const joinMessage: ClientMessage = {
    type: 'player:join',
    playerId,
    playerName,
    timestamp: Date.now(),
  };

  sendMessage(joinMessage);
});

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
