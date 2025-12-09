import type { Socket, Server } from 'socket.io';

export class MessageLogger {
  private static instance: MessageLogger;
  private isLoggingEnabled = true;

  private constructor() {}

  public static getInstance(): MessageLogger {
    if (!MessageLogger.instance) {
      MessageLogger.instance = new MessageLogger();
    }
    return MessageLogger.instance;
  }

  public setLoggingEnabled(enabled: boolean): void {
    this.isLoggingEnabled = enabled;
  }

  private logOutgoingMessage(target: string, event: string, data: any): void {
    if (!this.isLoggingEnabled) return;

    console.log(`<<<< ${data?.type}:`);
    console.log(data);
  }

  public wrapSocket(socket: Socket): Socket {
    const originalEmit = socket.emit.bind(socket);
    const originalBroadcastEmit = socket.broadcast.emit.bind(socket.broadcast);

    // Override socket.emit
    socket.emit = ((event: string, ...args: any[]): boolean => {
      this.logOutgoingMessage(`socket:${socket.id}`, event, args[0]);
      return originalEmit(event, ...args);
    }) as any;

    // Override socket.broadcast.emit
    socket.broadcast.emit = ((event: string, ...args: any[]): boolean => {
      this.logOutgoingMessage('broadcast-from-socket', event, args[0]);
      return originalBroadcastEmit(event, ...args);
    }) as any;

    return socket;
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

  public wrapSocketOnConnection(io: Server): void {
    const originalOn = io.on.bind(io);

    // Override the connection handler to automatically wrap new sockets
    io.on = (event: string, listener: (...args: any[]) => void): Server => {
      if (event === 'connection') {
        const wrappedListener = (socket: Socket, ...args: any[]) => {
          // Wrap the socket before passing it to the original listener
          const wrappedSocket = this.wrapSocket(socket);
          listener(wrappedSocket, ...args);
        };
        return originalOn(event, wrappedListener);
      }
      return originalOn(event, listener);
    };
  }
}

// Export singleton instance for easy use
export const messageLogger = MessageLogger.getInstance();
