import type { Server } from 'socket.io';

export class MessageLogger {
  private static instance: MessageLogger;
  private isLoggingEnabled = false;

  private constructor() {}

  public static getInstance(): MessageLogger {
    if (!MessageLogger.instance) {
      MessageLogger.instance = new MessageLogger();
    }
    return MessageLogger.instance;
  }

  private logOutgoingMessage(_target: string, _event: string, data: any): void {
    if (!this.isLoggingEnabled) return;

    console.log(`<<<< ${data?.type}:`);
    console.log(data);
  }

  public wrapServer(io: Server): Server {
    const originalEmit = io.emit.bind(io);

    // Override io.emit
    io.emit = ((event: string, ...args: any[]): boolean => {
      this.logOutgoingMessage('server-broadcast', event, args[0]);
      return originalEmit(event, ...args);
    }) as any;

    return io;
  }
}

// Export singleton instance for easy use
export const messageLogger = MessageLogger.getInstance();
