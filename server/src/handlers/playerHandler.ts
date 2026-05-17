import type { Socket, Server } from 'socket.io';
import type {
  ChatMessage,
  CoopSnapshotMessage,
  PlayerJoinMessage,
  PlayerJoinRejectedMessage,
  PlayerLeaveMessage,
  PlayerSnapshotMessage, SettlementFoundResultMessage,
  RunSnapshotMessage,
} from '../../../src/shared/protocol';
import {broadcast, sendToSocket, serverMessageRouter} from '../messages/messageRouter';
import { coopState } from '../state/coopState';
import { playerSettlementState } from '../state/playerSettlementState';
import {tileIndex} from "../../../src/core/world";
import { runState } from '../state/runState';
import { isLooperlandsAuthRequired, validateLooperlandsJoin } from '../looperlands/looperlandsAuth';
import { getStoryHeroTemplate, type StoryHeroId } from '../../../src/shared/story/heroRoster';
import { buildLooperlandsPlayerId } from '../../../src/shared/looperlands';

export class ServerPlayerHandler {
  private connectedPlayers = new Map<string, { id: string, name: string, color: string, socket: Socket }>();
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

  private buildPlayerSnapshot(currentPlayerId: string | null = null): PlayerSnapshotMessage {
    return {
      type: 'player:snapshot',
      currentPlayerId,
      players: playerSettlementState.listPlayers(),
      timestamp: Date.now(),
    };
  }

  broadcastPlayerSnapshot() {
    this.io.emit('message', this.buildPlayerSnapshot());
  }

  private rejectPlayerJoin(socket: Socket, message: string): void {
    sendToSocket(socket, {
      type: 'player:join_rejected',
      message,
      timestamp: Date.now(),
    } satisfies PlayerJoinRejectedMessage);
  }

  private validateStoryHeroIds(heroIds: StoryHeroId[] | undefined): StoryHeroId[] | null {
    if (!Array.isArray(heroIds) || heroIds.length !== 2) {
      return null;
    }

    if (new Set(heroIds).size !== 2) {
      return null;
    }

    if (!heroIds.every((heroId) => !!getStoryHeroTemplate(heroId))) {
      return null;
    }

    return heroIds.slice();
  }

  private async handlePlayerJoin(socket: Socket, message: PlayerJoinMessage): Promise<void> {
    if (message.looperlands) {
      try {
        const requestedWalletPlayerId = buildLooperlandsPlayerId(message.looperlands.walletAddress, message.looperlands.chainId);
        const hasExistingSettlement = !!playerSettlementState.getPlayerSettlement(requestedWalletPlayerId);
        const validated = await validateLooperlandsJoin(message.looperlands, {
          requireHeroSelection: !hasExistingSettlement,
        });
        message.playerId = validated.playerId;
        message.playerName = message.playerName || validated.playerName || 'Pioneer';
        message.looperlands.heroes = validated.heroes;
        if (!hasExistingSettlement) {
          playerSettlementState.setStarterHeroes(validated.playerId, validated.heroes);
        }
      } catch (error) {
        this.rejectPlayerJoin(socket, error instanceof Error ? error.message : 'Could not validate wallet ownership.');
        throw error;
      }
    } else {
      const storyHeroIds = this.validateStoryHeroIds(message.storyHeroIds);
      if (storyHeroIds) {
        if (!playerSettlementState.getPlayerSettlement(message.playerId)) {
          playerSettlementState.setStarterStoryHeroIds(message.playerId, storyHeroIds);
        }
      } else if (isLooperlandsAuthRequired()) {
        this.rejectPlayerJoin(socket, 'Connect a wallet or choose two default heroes before joining.');
        throw new Error('Missing Looperlands wallet authentication or default hero selection.');
      }
    }

    const player = playerSettlementState.registerPlayer(socket.id, message.playerId, message.playerName);
    const playerId = player.id;

    // Store player info
    this.connectedPlayers.set(socket.id, {
      id: playerId,
      name: player.nickname,
      color: player.color,
      socket
    });
    coopState.upsertPlayer(socket, player.nickname, player.id, player.color, player.settlementId);

    // Broadcast to all other players
    socket.broadcast.emit('message', {
      type: 'player:join',
      playerId,
      playerName: player.nickname,
      playerColor: player.color,
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
          playerColor: player.color,
          timestamp: Date.now()
        });
      }
    }

    socket.emit('message', {
      type: 'world:welcome',
      timestamp: Date.now(),
    });
    socket.emit('message', this.buildPlayerSnapshot(player.id));

    this.io.emit('message', {
      type: 'player:count',
      count: this.connectedPlayers.size,
      timestamp: Date.now()
    });

    this.broadcastCoopSnapshot();
    this.broadcastPlayerSnapshot();

    const existingSettlementId = playerSettlementState.getPlayerSettlement(playerId);
    if (existingSettlementId) {
      const existingTile = tileIndex[existingSettlementId];
      sendToSocket(socket, {
        type: 'settlement:found_result',
        success: true,
        playerId,
        settlementId: existingSettlementId,
        q: existingTile?.q,
        r: existingTile?.r,
        message: 'You already have a settlement in this world.',
        timestamp: Date.now(),
      } satisfies SettlementFoundResultMessage);
      const run = runState.getSnapshotForSettlement(existingSettlementId);
      if (run) {
        sendToSocket(socket, {
          type: 'run:snapshot',
          settlementId: existingSettlementId,
          run,
          timestamp: Date.now(),
        } satisfies RunSnapshotMessage);
      }
      return;
    }
  }

  private handlePlayerLeave(socket: Socket, message: PlayerLeaveMessage): void {
    const player = this.connectedPlayers.get(socket.id);

    // Remove player from our tracking
    this.connectedPlayers.delete(socket.id);
    coopState.removePlayer(socket.id);
    playerSettlementState.unregisterSocket(socket.id);

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
    this.broadcastPlayerSnapshot();
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
      playerSettlementState.unregisterSocket(socket.id);

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
      this.broadcastPlayerSnapshot();
    }
  }
}
