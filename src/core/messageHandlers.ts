import { playerMessageHandler } from './handlers/playerHandler';
import { gameStateHandler } from './handlers/gameStateHandler';
import { chatMessageHandler } from './handlers/chatHandler';
import { worldHandler } from './handlers/worldHandler';

// Initialize all handlers
export function initializeClientHandlers(): void {
  playerMessageHandler.init();
  gameStateHandler.init();
  chatMessageHandler.init();
  worldHandler.init();
}
