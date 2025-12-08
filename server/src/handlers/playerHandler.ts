import type { Socket, Server } from 'socket.io';
import type { PlayerJoinMessage, PlayerLeaveMessage, PlayerActionMessage, ChatMessage } from '../../../src/shared/protocol';
import { serverMessageRouter } from '../messageRouter';

export class ServerPlayerHandler {
  private connectedPlayers = new Map<string, { id: string, name: string, socket: Socket }>();

  constructor(private io: Server) {}

  init(): void {
    serverMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    serverMessageRouter.on('player:leave', this.handlePlayerLeave.bind(this));
    serverMessageRouter.on('player:action', this.handlePlayerAction.bind(this));
    serverMessageRouter.on('chat:message', this.handleChatMessage.bind(this));
  }

  private handlePlayerJoin(socket: Socket, message: PlayerJoinMessage): void {
    console.log(`Player joining: ${message.playerName} (${message.playerId})`);

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

    // Send current player count to the newly connected player
    socket.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });

    // Broadcast updated player count to all other players
    socket.broadcast.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });

    console.log(`Total connected players: ${this.connectedPlayers.size}`);
  }

  private handlePlayerLeave(socket: Socket, message: PlayerLeaveMessage): void {
    console.log(`Player leaving: ${message.playerId}`);

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

    console.log(`Total connected players: ${this.connectedPlayers.size}`);
  }

  private handlePlayerAction(socket: Socket, message: PlayerActionMessage): void {
    console.log(`Player action: ${message.action} from ${message.playerId}`);

    // Process the player action here
    // This could involve updating game state, validating actions, etc.

    // Broadcast the action to other players (if needed)
    socket.broadcast.emit('message', {
      type: 'player:action',
      playerId: message.playerId,
      action: message.action,
      data: message.data,
      timestamp: Date.now()
    });
  }

  private handleChatMessage(socket: Socket, message: ChatMessage): void {
    console.log(`Chat message from ${message.playerName}: ${message.message}`);

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
      console.log(`Player disconnected: ${player.name} (${player.id})`);

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

      console.log(`Total connected players: ${this.connectedPlayers.size}`);
    }
  }

  getConnectedPlayersCount(): number {
    return this.connectedPlayers.size;
  }

  getAllPlayers(): Array<{ id: string, name: string }> {
    return Array.from(this.connectedPlayers.values()).map(player => ({
      id: player.id,
      name: player.name
    }));
  }


}
