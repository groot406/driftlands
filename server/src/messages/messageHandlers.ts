import type { Server } from 'socket.io';
import { ServerPlayerHandler } from '../handlers/playerHandler';
import { ServerGameStateHandler } from '../handlers/gameStateHandler';
import { ServerMovementHandler } from '../handlers/movementHandler';
import { ServerTaskHandler } from '../handlers/taskHandler';

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

  return { playerHandler, gameStateHandler, movementHandler, taskHandler };
}
