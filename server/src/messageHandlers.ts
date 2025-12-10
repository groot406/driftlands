import type { Server } from 'socket.io';
import { ServerPlayerHandler } from './handlers/playerHandler';
import { ServerGameStateHandler } from './handlers/gameStateHandler';
import { ServerMovementHandler } from './handlers/movementHandler';

// Initialize all server handlers
export function initializeServerHandlers(io: Server) {
  const playerHandler = new ServerPlayerHandler(io);
  playerHandler.init();

  const gameStateHandler = new ServerGameStateHandler(io);
  gameStateHandler.init();

  const movementHandler = new ServerMovementHandler(io);
  movementHandler.init();

  return { playerHandler, gameStateHandler, movementHandler };
}
