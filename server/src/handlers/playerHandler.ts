import type { Socket, Server } from 'socket.io';
import type { PlayerJoinMessage, PlayerLeaveMessage, ChatMessage } from '../../../src/shared/protocol';
import { serverMessageRouter } from '../messageRouter';

export class ServerPlayerHandler {
  private connectedPlayers = new Map<string, { id: string, name: string, socket: Socket }>();

  constructor(private io: Server) {}

  init(): void {
    serverMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    serverMessageRouter.on('player:leave', this.handlePlayerLeave.bind(this));
    serverMessageRouter.on('chat:message', this.handleChatMessage.bind(this));
  }

  private handlePlayerJoin(socket: Socket, message: PlayerJoinMessage): void {
    // Store player info
    this.connectedPlayers.set(socket.id, {
      id: message.playerId,
      name: message.playerName,
      socket
    });

    // Broadcast to all other players
    socket.broadcast.emit('message', {
      type: 'player:join',
      playerId: message.playerId,
      playerName: message.playerName,
      timestamp: Date.now()
    });

    // Send existing players to the newly connected player (excluding themselves)
    // @ts-ignore
    for (const [socketId, player] of this.connectedPlayers) {
      if (socketId !== socket.id) {
        socket.emit('message', {
          type: 'player:join',
          playerId: player.id,
          playerName: player.name,
          timestamp: Date.now()
        });
      }
    }

    socket.emit('message', {
      type: 'world:welcome',
      timestamp: Date.now(),
    });

    // Broadcast updated player count to all other players
    socket.broadcast.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });
  }

  private handlePlayerLeave(socket: Socket, message: PlayerLeaveMessage): void {
    // Remove player from our tracking
    this.connectedPlayers.delete(socket.id);

    // Broadcast to all other players
    socket.broadcast.emit('message', {
      type: 'player:leave',
      playerId: message.playerId,
      timestamp: Date.now()
    });

    // Broadcast updated player count to remaining players
    this.io.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });
  }

  private handleChatMessage(socket: Socket, message: ChatMessage): void {
    // Broadcast chat message to all connected players (including sender)
    this.io.emit('message', {
      type: 'chat:message',
      playerId: message.playerId,
      playerName: message.playerName,
      message: message.message,
      timestamp: Date.now()
    });
  }

  // Handle socket disconnection
  handleDisconnection(socket: Socket): void {
    const player = this.connectedPlayers.get(socket.id);
    if (player) {
      // Remove from our tracking
      this.connectedPlayers.delete(socket.id);

      // Broadcast to all other players
      socket.broadcast.emit('message', {
        type: 'player:leave',
        playerId: player.id,
        timestamp: Date.now()
      });

      // Broadcast updated player count to remaining players
      this.io.emit('message', {
        type: 'player:count',
        count: this.connectedPlayers.size,
        timestamp: Date.now()
      });
    }
  }
}
