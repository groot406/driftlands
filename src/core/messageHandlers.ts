import { playerMessageHandler } from './handlers/playerHandler';
import { chatMessageHandler } from './handlers/chatHandler';
import { worldHandler } from './handlers/worldHandler';
import { movementMessageHandler } from './handlers/movementHandler';
import { taskMessageHandler } from './handlers/taskHandler';
import { resourceMessageHandler } from './handlers/resourceMessageHandler';
import { heroMessageHandler } from './handlers/heroMessageHandler';
import { runHandler } from './handlers/runHandler';
import { coopHandler } from './handlers/coopHandler';
import { settlementStartHandler } from './handlers/settlementStartHandler';
import { marketHandler } from './handlers/marketHandler';
import { shipOrderHandler } from './handlers/shipOrderHandler';
import { seasonHandler } from './handlers/seasonHandler';
import { changelogHandler } from './handlers/changelogHandler';

// Initialize all handlers
export function initializeClientHandlers(): void {
  //clientMessageRouter.on('*', (message) => console.debug('Received message:', message));

  playerMessageHandler.init();
  chatMessageHandler.init();
  worldHandler.init();
  movementMessageHandler.init();
  taskMessageHandler.init();
  resourceMessageHandler.init();
  heroMessageHandler.init();
  runHandler.init();
  coopHandler.init();
  settlementStartHandler.init();
  marketHandler.init();
  shipOrderHandler.init();
  seasonHandler.init();
  changelogHandler.init();
}
