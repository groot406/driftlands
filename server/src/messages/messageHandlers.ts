import type { Server } from 'socket.io';
import { ServerPlayerHandler } from '../handlers/playerHandler';
import { ServerGameStateHandler } from '../handlers/gameStateHandler';
import { ServerMovementHandler } from '../handlers/movementHandler';
import { ServerTaskHandler } from '../handlers/taskHandler';
import { ServerCoopHandler } from '../handlers/coopHandler';

// Initialize all server handlers
export function initializeServerHandlers(io: Server) {
  const playerHandler = new ServerPlayerHandler(io);
  playerHandler.init();

  const gameStateHandler = new ServerGameStateHandler(io);
  gameStateHandler.init();

  const movementHandler = ServerMovementHandler.getInstance();
  movementHandler.init();

  const taskHandler = new ServerTaskHandler(io);
  taskHandler.init();

  const coopHandler = new ServerCoopHandler(io);
  coopHandler.init();

  return { playerHandler, gameStateHandler, movementHandler, taskHandler, coopHandler };
}
