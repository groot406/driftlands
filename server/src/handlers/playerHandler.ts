import type { Socket, Server } from 'socket.io';
import type { ChatMessage, CoopSnapshotMessage, PlayerJoinMessage, PlayerLeaveMessage } from '../../../src/shared/protocol';
import { broadcast, serverMessageRouter } from '../messages/messageRouter';
import { coopState } from '../state/coopState';

export class ServerPlayerHandler {
  private connectedPlayers = new Map<string, { id: string, name: string, socket: Socket }>();
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  init(): void {
    serverMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    serverMessageRouter.on('player:leave', this.handlePlayerLeave.bind(this));
    serverMessageRouter.on('chat:message', this.handleChatMessage.bind(this));
  }

  private broadcastCoopSnapshot() {
    const message: CoopSnapshotMessage = {
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    };

    broadcast(message);
  }

  private handlePlayerJoin(socket: Socket, message: PlayerJoinMessage): void {
    const playerId = socket.id;

    // Store player info
    this.connectedPlayers.set(socket.id, {
      id: playerId,
      name: message.playerName,
      socket
    });
    coopState.upsertPlayer(socket, message.playerName);

    // Broadcast to all other players
    socket.broadcast.emit('message', {
      type: 'player:join',
      playerId,
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

    this.io.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });

    this.broadcastCoopSnapshot();
  }

  private handlePlayerLeave(socket: Socket, message: PlayerLeaveMessage): void {
    const player = this.connectedPlayers.get(socket.id);

    // Remove player from our tracking
    this.connectedPlayers.delete(socket.id);
    coopState.removePlayer(socket.id);

    // Broadcast to all other players
    socket.broadcast.emit('message', {
      type: 'player:leave',
      playerId: player?.id ?? message.playerId,
      timestamp: Date.now()
    });

    // Broadcast updated player count to remaining players
    this.io.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });

    this.broadcastCoopSnapshot();
  }

  private handleChatMessage(socket: Socket, message: ChatMessage): void {
    const player = this.connectedPlayers.get(socket.id);

    // Broadcast chat message to all connected players (including sender)
    this.io.emit('message', {
      type: 'chat:message',
      playerId: player?.id ?? socket.id,
      playerName: player?.name ?? message.playerName,
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
      coopState.removePlayer(socket.id);

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

      this.broadcastCoopSnapshot();
    }
  }
}
