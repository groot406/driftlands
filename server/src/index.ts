import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { BaseMessage } from '../../src/shared/protocol';
import { serverMessageRouter, setIo } from './messages/messageRouter';
import { initializeServerHandlers } from './messages/messageHandlers';
import { messageLogger } from './messages/messageLogger';
import { tickEngine } from './tick';
import { ServerMovementHandler } from './handlers/movementHandler';
import { ServerTaskHandler } from './handlers/taskHandler';
import { growthSystem } from './systems/growthSystem';
import {movementSystem} from "./systems/movementSystem";
import {taskSystem} from "./systems/taskSystem";

const app = express();
// @ts-ignore
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});
setIo(io);

// Apply message logging middleware
messageLogger.wrapServer(io);

// Initialize message handlers
const { playerHandler } = initializeServerHandlers(io);

// Register systems and start tick engine
const movement = ServerMovementHandler.getInstance();
movement.init();

const tasks = new ServerTaskHandler(io);
tasks.init();

tickEngine.setTPS(Number(process.env.SERVER_TPS ?? 10));
tickEngine.setSeed(Number(process.env.SERVER_SEED ?? 123456789));

tickEngine.register(taskSystem);
tickEngine.register(movementSystem);
tickEngine.register(growthSystem);

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
httpServer.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});
