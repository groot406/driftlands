import { playerMessageHandler } from './handlers/playerHandler';
import { gameStateHandler } from './handlers/gameStateHandler';

// Initialize all handlers
export function initializeClientHandlers(): void {
  playerMessageHandler.init();
  gameStateHandler.init();
}

