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
});

socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
});

// Route all incoming messages through the message router
socket.on('message', (message: ServerMessage) => {
    clientMessageRouter.route(message);
});

// Handle connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

