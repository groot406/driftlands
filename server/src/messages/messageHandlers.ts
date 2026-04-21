import type { Server } from 'socket.io';
import { ServerPlayerHandler } from '../handlers/playerHandler';
import { ServerGameStateHandler } from '../handlers/gameStateHandler';
import { ServerMovementHandler } from '../handlers/movementHandler';
import { ServerJobHandler } from '../handlers/jobHandler';
import { ServerTaskHandler } from '../handlers/taskHandler';
import { ServerCoopHandler } from '../handlers/coopHandler';
import { ServerScoutHandler } from '../handlers/scoutHandler';
import { ServerStudyHandler } from '../handlers/studyHandler';
import { ServerHeroAbilityHandler } from '../handlers/heroAbilityHandler';

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

  const jobHandler = new ServerJobHandler(io);
  jobHandler.init();

  const studyHandler = new ServerStudyHandler(io);
  studyHandler.init();

  const heroAbilityHandler = new ServerHeroAbilityHandler(io);
  heroAbilityHandler.init();

  const coopHandler = new ServerCoopHandler(io);
  coopHandler.init();

  const scoutHandler = new ServerScoutHandler(io);
  scoutHandler.init();

  return { playerHandler, gameStateHandler, movementHandler, taskHandler, jobHandler, studyHandler, heroAbilityHandler, coopHandler, scoutHandler };
}
