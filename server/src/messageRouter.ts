import type { Socket } from 'socket.io';
import type { BaseMessage } from '../../src/shared/protocol';

export type ServerMessageHandler<T extends BaseMessage = BaseMessage> = (socket: Socket, message: T) => void;

export class ServerMessageRouter {
  private handlers = new Map<string, ServerMessageHandler[]>();

  // Register a handler for a specific message type
  on<T extends BaseMessage>(type: T['type'], handler: ServerMessageHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler as ServerMessageHandler);
  }

  // Remove a handler for a specific message type
  off<T extends BaseMessage>(type: T['type'], handler: ServerMessageHandler<T>): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      const index = typeHandlers.indexOf(handler as ServerMessageHandler);
      if (index > -1) {
        typeHandlers.splice(index, 1);
      }
    }
  }

  // Route an incoming message to appropriate handlers
  route(socket: Socket, message: BaseMessage): void {
    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(socket, message);
        } catch (error) {
          console.error(`Error handling message type ${message.type}:`, error);
        }
      });
    } else {
      console.warn(`No handlers registered for message type: ${message.type}`);
    }
  }

  // Remove all handlers for a specific message type
  removeAllHandlers(type: string): void {
    this.handlers.delete(type);
  }

  // Clear all handlers
  clear(): void {
    this.handlers.clear();
  }
}

// Utility function to send a message to a specific socket
export function sendToSocket(socket: Socket, message: any): void {
  socket.emit('message', message);
}

// Utility function to broadcast a message to all connected sockets
export function broadcast(io: any, message: any): void {
  io.emit('message', message);
}

// Create a singleton instance
export const serverMessageRouter = new ServerMessageRouter();
