import type { Server } from 'socket.io';
import { broadcast } from '../messageRouter';

export class ServerGameStateHandler {
  constructor(private io: Server) {}

  init(): void {
    // Game state is typically managed server-side and broadcast to clients
    // You can add handlers here for game state requests or updates
  }

  // Broadcast current game state to all connected clients
  broadcastGameState(gameState: any): void {
    broadcast(this.io, {
      type: 'game:state',
      state: gameState,
      timestamp: Date.now()
    });
  }
}
