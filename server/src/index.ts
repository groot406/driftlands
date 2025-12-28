import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { BaseMessage } from '../../src/shared/protocol';
import { serverMessageRouter } from './messageRouter';
import { initializeServerHandlers } from './messageHandlers';
import { messageLogger } from './messageLogger';

const app = express();
// @ts-ignore
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Apply message logging middleware
messageLogger.wrapServer(io);

// Initialize message handlers
const { playerHandler } = initializeServerHandlers(io);

io.on('connection', (socket) => {
  // Route all incoming messages through the message router
  socket.on('message', (message: BaseMessage) => {
    console.log(`>>>> ${message.type}`);
    console.log(message);
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

httpServer.listen(3000, () => {
  console.log('Server listening on *:3000');
});
