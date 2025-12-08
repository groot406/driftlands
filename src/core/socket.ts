import { io } from 'socket.io-client';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { clientMessageRouter } from './messageRouter';
import { initializeClientHandlers } from './messageHandlers';

// "undefined" means the URL will be computed from the `window.location` object
const URL = import.meta.env.PROD ? undefined : 'http://localhost:3000';

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

