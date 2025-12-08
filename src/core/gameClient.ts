// Example usage of the ping/pong message system

import { sendMessage } from './socket';
import { clientMessageRouter } from './messageRouter';
import type { PlayerJoinMessage, PlayerActionMessage } from '../shared/protocol';

// Example: Send a player join message
export function joinGame(playerId: string, playerName: string): void {
  const joinMessage: PlayerJoinMessage = {
    type: 'player:join',
    playerId,
    playerName,
    timestamp: Date.now()
  };

  sendMessage(joinMessage);
}

// Example: Send a player action
export function sendPlayerAction(playerId: string, action: string, data: any): void {
  const actionMessage: PlayerActionMessage = {
    type: 'player:action',
    playerId,
    action,
    data,
    timestamp: Date.now()
  };

  sendMessage(actionMessage);
}

// Example: Listen for specific game events
export function setupGameEventListeners(): void {
  // Listen for player joins
  clientMessageRouter.on('player:join', (message) => {
    console.log(`${message.playerName} joined the game!`);
    // Update UI to show new player
  });

  // Listen for player leaves
  clientMessageRouter.on('player:leave', (message) => {
    console.log(`Player ${message.playerId} left the game`);
    // Update UI to remove player
  });

  // Listen for game state updates
  clientMessageRouter.on('game:state', (message) => {
    console.log('Game state updated:', message.state);
    // Update your game state
  });
}

// Additional utility functions can be added here as needed
