import type { ServerMessage } from '../shared/protocol';

export type MessageHandler<T extends ServerMessage = ServerMessage> = (message: T) => void;

export class ClientMessageRouter {
  private handlers = new Map<string, MessageHandler[]>();

  // Register a handler for a specific message type
  on<T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler as MessageHandler);
  }

  // Remove a handler for a specific message type
  off<T extends ServerMessage>(type: T['type'], handler: MessageHandler<T>): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      const index = typeHandlers.indexOf(handler as MessageHandler);
      if (index > -1) {
        typeHandlers.splice(index, 1);
      }
    }
  }

  // Route an incoming message to appropriate handlers
  route(message: ServerMessage): void {
    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(message);
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

// Create a singleton instance
export const clientMessageRouter = new ClientMessageRouter();
