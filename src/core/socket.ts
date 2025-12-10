import { io } from 'socket.io-client';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { clientMessageRouter } from './messageRouter';
import { initializeClientHandlers } from './messageHandlers';
import { addPlayer, removePlayer } from '../store/playerStore';

// Determine URL only in browser; Node lacks import.meta.env
const isBrowser = typeof window !== 'undefined';
const URL = isBrowser && (import.meta as any)?.env?.PROD ? undefined : 'http://localhost:3000';

export const socket = io(URL);


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
    console.log('Connected to socket server');

    // Automatically join the game when connected
    // Generate a simple player ID and name for now
    currentPlayerId = `player-${Date.now()}`;
    currentPlayerName = `Player ${currentPlayerId.slice(-4)}`;

    // Add current player to their own connected players list
    addPlayer({ id: currentPlayerId, name: currentPlayerName });

    const joinMessage: ClientMessage = {
        type: 'player:join',
        playerId: currentPlayerId,
        playerName: currentPlayerName,
        timestamp: Date.now()
    };

    sendMessage(joinMessage);
});

// Store current player info for disconnection
let currentPlayerId: string | null = null;
let currentPlayerName: string | null = null;

export function getCurrentPlayerInfo(): { id: string; name: string } | null {
    if (currentPlayerId && currentPlayerName) {
        return { id: currentPlayerId, name: currentPlayerName };
    }
    return null;
}

socket.on('disconnect', () => {
    console.log('Disconnected from socket server');

    // Remove current player from connected players list
    if (currentPlayerId) {
        removePlayer(currentPlayerId);
    }

    // Send leave message if we were connected as a player
    if (currentPlayerId && socket.connected) {
        const leaveMessage: ClientMessage = {
            type: 'player:leave',
            playerId: currentPlayerId,
            timestamp: Date.now()
        };

        sendMessage(leaveMessage);
    }
});

// Route all incoming messages through the message router
socket.on('message', (message: ServerMessage) => {
    clientMessageRouter.route(message);
});

// Handle connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});
