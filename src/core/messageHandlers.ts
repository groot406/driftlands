import { playerMessageHandler } from './handlers/playerHandler';
import { chatMessageHandler } from './handlers/chatHandler';
import { worldHandler } from './handlers/worldHandler';
import { movementMessageHandler } from './handlers/movementHandler';
import { taskMessageHandler } from './handlers/taskHandler';
import { resourceMessageHandler } from './handlers/resourceMessageHandler';
import { heroMessageHandler } from './handlers/heroMessageHandler';
import { runHandler } from './handlers/runHandler';
import { coopHandler } from './handlers/coopHandler';

// Initialize all handlers
export function initializeClientHandlers(): void {
  playerMessageHandler.init();
  chatMessageHandler.init();
  worldHandler.init();
  movementMessageHandler.init();
  taskMessageHandler.init();
  resourceMessageHandler.init();
  heroMessageHandler.init();
  runHandler.init();
  coopHandler.init();
}
