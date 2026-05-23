import './config/envFile';
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
import { settlerSystem } from './systems/settlerSystem';
import { supportSystem } from './systems/supportSystem';
import { jobSystem } from './systems/jobSystem';
import { coopSystem } from './systems/coopSystem';
import { runState } from './state/runState';
import { maintenanceSystem } from './systems/maintenanceSystem';
import { militarySystem } from './systems/militarySystem';
import { calamitySystem } from './systems/calamitySystem';
import { shipOrderSystem } from './systems/shipOrderSystem';
import { marketSystem } from './systems/marketSystem';
import { serverDebugModeEnabled, settlementStartMode, spawnSafetyEnabled } from './config/serverMode';
import { setWorldGenerationSpawnSafetyEnabled } from '../../src/core/worldGeneration';
import { registerLooperlandsProxy } from './looperlands/looperlandsProxy';
import { playerSettlementState } from './state/playerSettlementState';
import { registerMarketRoutes } from './market/marketRoutes';

setWorldGenerationSpawnSafetyEnabled(spawnSafetyEnabled);

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
app.use((req: any, _res: any, next: any) => {
  console.log(`[http] ${req.method} ${req.originalUrl ?? req.url} origin=${req.headers.origin ?? '-'} ip=${req.ip ?? req.socket?.remoteAddress ?? '-'}`);
  next();
});
app.get('/', (_req: any, res: any) => {
  res.json({
    name: 'driftlands-server',
    status: 'ok',
    health: '/health',
  });
});
app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok' });
});
app.use(['/api/looperlands', '/api/driftlands'], (req: any, res: any, next: any) => {
  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : undefined;
  if (origin && isAllowedFrontendOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-AUTH-WEB3TOKEN');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  next();
});
app.use(express.json({ limit: '1mb' }));
registerLooperlandsProxy(app);
registerMarketRoutes(app);
app.get('/api/driftlands/player/:playerId/settlement', (req: any, res: any) => {
  const playerId = String(req.params.playerId ?? '');
  const settlementId = playerSettlementState.getPlayerSettlement(playerId);
  console.log(`[driftlands:player] settlement lookup playerId=${playerId} settlementId=${settlementId ?? '-'}`);
  res.json({
    playerId,
    settlementId,
  });
});
// @ts-ignore
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (isAllowedFrontendOrigin(origin)) {
        console.log(`[socket.io:cors] allow origin=${origin ?? '-'}`);
        callback(null, true);
        return;
      }

      console.warn(`[socket.io:cors] reject origin=${origin ?? '-'} allowed=${configuredFrontendOrigins.join(',') || '(default local/LAN only)'}`);
      callback(new Error(`Origin ${origin ?? 'unknown'} is not allowed by FRONTEND_ORIGIN`));
    },
    methods: ["GET", "POST"]
  }
});
io.engine.on('connection_error', (error) => {
  console.warn(`[socket.io:error] code=${error.code} message=${error.message} origin=${error.req?.headers.origin ?? '-'} ip=${error.req?.socket.remoteAddress ?? '-'}`);
});
setIo(io);
configureGameRuntime({
  broadcast,
  moveHero: (hero, target, task, taskLocation, options) => {
    ServerMovementHandler.getInstance().moveHero(hero, target, task, taskLocation, options);
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
tickEngine.register(maintenanceSystem);
tickEngine.register(militarySystem);
tickEngine.register(calamitySystem);
tickEngine.register(marketSystem);
tickEngine.register(shipOrderSystem);
tickEngine.register(settlerSystem);
tickEngine.register(supportSystem);
tickEngine.register(jobSystem);
tickEngine.register(coopSystem);
tickEngine.register(runSystem);

tickEngine.start();

io.on('connection', (socket) => {
  console.log(`[socket.io] connected id=${socket.id} origin=${socket.handshake.headers.origin ?? '-'} ip=${socket.handshake.address} transport=${socket.conn.transport.name}`);
  socket.conn.on('upgrade', (transport) => {
    console.log(`[socket.io] upgraded id=${socket.id} transport=${transport.name}`);
  });

  // Route all incoming messages through the message router
  socket.on('message', (message: BaseMessage) => {
    // If logging is enabled:
    if (messageLogger.isLoggingEnabled) {
      console.log(`>>>> ${message.type}`);
      console.log(message);
    }
    void serverMessageRouter.route(socket, message);
  });

  socket.on('disconnect', () => {
    console.log(`[socket.io] disconnected id=${socket.id}`);
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
  console.log(`Allowed frontend origins: ${configuredFrontendOrigins.join(', ') || '(default local/LAN only)'}`);
  console.log(`Debug mode: ${serverDebugModeEnabled ? 'on' : 'off'}; settlement start mode: ${settlementStartMode}; spawn safety: ${spawnSafetyEnabled ? 'on' : 'off'}`);
});
