import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { BaseMessage } from '../../src/shared/protocol';
import { configureGameRuntime } from '../../src/shared/game/runtime';
import { configureGameplayEventRuntime } from '../../src/shared/gameplay/events';
import { broadcast, serverMessageRouter, setIo } from './messages/messageRouter';
import { initializeServerHandlers } from './messages/messageHandlers';
import { messageLogger } from './messages/messageLogger';
import { tickEngine } from './tick';
import { ServerMovementHandler } from './handlers/movementHandler';
import { growthSystem } from './systems/growthSystem';
import {movementSystem} from "./systems/movementSystem";
import {taskSystem} from "./systems/taskSystem";
import { runSystem } from './systems/runSystem';
import { populationSystem } from './systems/populationSystem';
import { supportSystem } from './systems/supportSystem';
import { jobSystem } from './systems/jobSystem';
import { coopSystem } from './systems/coopSystem';
import { runState } from './state/runState';

const configuredFrontendOrigins = (process.env.FRONTEND_ORIGIN ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const defaultLanOriginPatterns = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/10(?:\.\d{1,3}){3}(?::\d+)?$/i,
  /^https?:\/\/192\.168(?:\.\d{1,3}){2}(?::\d+)?$/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}(?::\d+)?$/i,
  /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local(?::\d+)?$/i,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i,
];

function isAllowedFrontendOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  if (configuredFrontendOrigins.includes('*')) {
    return true;
  }

  if (configuredFrontendOrigins.length > 0) {
    return configuredFrontendOrigins.includes(origin);
  }

  return defaultLanOriginPatterns.some((pattern) => pattern.test(origin));
}

const app = express();
// @ts-ignore
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (isAllowedFrontendOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin ?? 'unknown'} is not allowed by FRONTEND_ORIGIN`));
    },
    methods: ["GET", "POST"]
  }
});
setIo(io);
configureGameRuntime({
  broadcast,
  moveHero: (hero, target, task, taskLocation) => {
    ServerMovementHandler.getInstance().moveHero(hero, target, task, taskLocation);
  }
});
configureGameplayEventRuntime((event) => {
  runState.recordEvent(event);
});

// Apply message logging middleware
messageLogger.wrapServer(io);

// Initialize message handlers
const { playerHandler } = initializeServerHandlers(io);

// Register systems and start tick engine
tickEngine.setTPS(Number(process.env.SERVER_TPS ?? 10));

tickEngine.register(movementSystem);
tickEngine.register(taskSystem);
tickEngine.register(growthSystem);
tickEngine.register(populationSystem);
tickEngine.register(supportSystem);
tickEngine.register(jobSystem);
tickEngine.register(coopSystem);
tickEngine.register(runSystem);

tickEngine.start();

io.on('connection', (socket) => {
  // Route all incoming messages through the message router
  socket.on('message', (message: BaseMessage) => {
    //console.log(`>>>> ${message.type}`);
    //console.log(message);
    serverMessageRouter.route(socket, message);
  });

  socket.on('disconnect', () => {
    // Handle player disconnection
    playerHandler.handleDisconnection(socket);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});
