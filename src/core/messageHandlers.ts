import { playerMessageHandler } from './handlers/playerHandler';
import { chatMessageHandler } from './handlers/chatHandler';
import { worldHandler } from './handlers/worldHandler';
import { movementMessageHandler } from './handlers/movementHandler';
import { taskMessageHandler } from './handlers/taskHandler';
import { resourceMessageHandler } from './handlers/resourceMessageHandler';

// Initialize all handlers
export function initializeClientHandlers(): void {
  playerMessageHandler.init();
  chatMessageHandler.init();
  worldHandler.init();
  movementMessageHandler.init();
  taskMessageHandler.init();
  resourceMessageHandler.init();
}
