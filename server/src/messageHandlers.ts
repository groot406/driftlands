import type { Server } from 'socket.io';
import { ServerPlayerHandler } from './handlers/playerHandler';
import { ServerGameStateHandler } from './handlers/gameStateHandler';

// Initialize all server handlers
export function initializeServerHandlers(io: Server): { playerHandler: ServerPlayerHandler } {
  const playerHandler = new ServerPlayerHandler(io);
  const gameStateHandler = new ServerGameStateHandler(io);

  playerHandler.init();
  gameStateHandler.init();

  return { playerHandler };
}
