import type { Server, Socket } from 'socket.io';
import { terrainPositions } from '../../../src/core/terrainRegistry';
import { resolveWorldTile } from '../../../src/core/worldGeneration';
import { tileIndex } from '../../../src/shared/game/world';
import {
  generateSettlementStartCandidates,
  generateSettlementStartTerrainTiles,
  getSettlementIdFromStartCandidateId,
  type SettlementStartMarker,
} from '../../../src/shared/multiplayer/settlementStart';
import type {
  CoopSnapshotMessage,
  PlayerJoinMessage,
  SettlementFoundRequestMessage,
  SettlementFoundResultMessage,
  SettlementPlayerFoundMessage,
  SettlementStartOptionsMessage,
  SettlementStartRequestOptionsMessage,
  WorldSnapshotMessage,
  RunSnapshotMessage,
  WorldRestartMessage,
} from '../../../src/shared/protocol';
import { serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { playerSettlementState } from '../state/playerSettlementState';
import { coopState } from '../state/coopState';
import { worldState } from '../worldState';
import { runState } from '../state/runState';

export class ServerSettlementStartHandler {
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  init(): void {
    serverMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    serverMessageRouter.on('settlement:request_start_options', this.handleRequestOptions.bind(this));
    serverMessageRouter.on('settlement:found_request', this.handleFoundRequest.bind(this));
    serverMessageRouter.on('world:restart', this.handleWorldRestart.bind(this));
  }

  private listSettlementMarkers(): SettlementStartMarker[] {
    const markers: SettlementStartMarker[] = [];

    for (const settlementId of terrainPositions.towncenter) {
      const tile = tileIndex[settlementId];
      if (!tile?.discovered || tile.terrain !== 'towncenter') {
        continue;
      }

      const owner = playerSettlementState.getSettlementOwner(settlementId);
      markers.push({
        settlementId,
        q: tile.q,
        r: tile.r,
        playerId: owner?.playerId ?? null,
        playerName: owner?.playerName ?? null,
        playerColor: owner?.playerColor ?? null,
      });
    }

    return markers.sort((left, right) => left.settlementId.localeCompare(right.settlementId));
  }

  private resolveTerrain(q: number, r: number, origin?: { q: number; r: number }) {
    const existing = tileIndex[`${q},${r}`];
    if (!origin && existing?.terrain) {
      return existing.terrain;
    }

    return resolveWorldTile(q, r, origin).terrain;
  }

  private buildOptionsMessage(playerId: string): SettlementStartOptionsMessage {
    const settlements = this.listSettlementMarkers();
    const startOptions = {
      settlements,
      resolveTerrain: (q: number, r: number, origin?: { q: number; r: number }) => this.resolveTerrain(q, r, origin),
      isSettlementClaimed: (settlementId: string) => playerSettlementState.isSettlementClaimed(settlementId),
      getSettlementOwner: (settlementId: string) => playerSettlementState.getSettlementOwner(settlementId),
    };
    const candidates = generateSettlementStartCandidates(startOptions);

    return {
      type: 'settlement:start_options',
      playerId,
      currentSettlementId: playerSettlementState.getPlayerSettlement(playerId),
      settlements,
      candidates,
      terrainTiles: generateSettlementStartTerrainTiles({
        settlements,
        candidates,
        resolveTerrain: startOptions.resolveTerrain,
      }),
      timestamp: Date.now(),
    };
  }

  private sendOptionsToSocket(socket: Socket) {
    sendToSocket(socket, this.buildOptionsMessage(playerSettlementState.getSocketPlayerId(socket.id) ?? socket.id));
  }

  private broadcastCoopSnapshot() {
    this.io.emit('message', {
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    } satisfies CoopSnapshotMessage);
  }

  private broadcastPlayerSnapshot() {
    this.io.emit('message', {
      type: 'player:snapshot',
      currentPlayerId: null,
      players: playerSettlementState.listPlayers(),
      timestamp: Date.now(),
    });
  }

  private broadcastOptionsToConnectedPlayers() {
    for (const socket of this.io.sockets.sockets.values()) {
      this.sendOptionsToSocket(socket);
    }
  }

  private handlePlayerJoin(socket: Socket, message: PlayerJoinMessage): void {
    playerSettlementState.registerPlayer(socket.id, message.playerId, message.playerName);
    this.sendOptionsToSocket(socket);
  }

  private handleRequestOptions(socket: Socket, _message: SettlementStartRequestOptionsMessage): void {
    this.sendOptionsToSocket(socket);
  }

  private handleWorldRestart(_socket: Socket, _message: WorldRestartMessage): void {
    playerSettlementState.clearAssignments();
    this.broadcastOptionsToConnectedPlayers();
  }

  private rejectFoundRequest(socket: Socket, message: string) {
    const playerId = playerSettlementState.getSocketPlayerId(socket.id) ?? socket.id;
    sendToSocket(socket, {
      type: 'settlement:found_result',
      success: false,
      playerId,
      settlementId: playerSettlementState.getPlayerSettlement(playerId),
      message,
      timestamp: Date.now(),
    } satisfies SettlementFoundResultMessage);
    this.sendOptionsToSocket(socket);
  }

  private handleFoundRequest(socket: Socket, message: SettlementFoundRequestMessage): void {
    const playerId = playerSettlementState.getSocketPlayerId(socket.id) ?? socket.id;
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
      return;
    }

    const settlementId = getSettlementIdFromStartCandidateId(message.candidateId);
    if (!settlementId) {
      this.rejectFoundRequest(socket, 'That settlement claim is no longer valid.');
      return;
    }

    const candidate = this.buildOptionsMessage(playerId).candidates.find((entry) => entry.id === message.candidateId);
    if (!candidate?.available) {
      this.rejectFoundRequest(socket, 'That settlement site has already been taken.');
      return;
    }

    const founded = worldState.foundSettlementAt(candidate.q, candidate.r, {
      playerId,
      playerName: playerSettlementState.getPlayerName(playerId) ?? 'Pioneer',
    });
    if (!founded || founded.settlementId !== settlementId) {
      this.rejectFoundRequest(socket, 'The settlement could not be founded at that site.');
      return;
    }

    const assigned = playerSettlementState.assignPlayerSettlement(playerId, founded.settlementId);
    if (!assigned) {
      this.rejectFoundRequest(socket, 'That settlement site has already been taken.');
      return;
    }

    const owner = playerSettlementState.getSettlementOwner(founded.settlementId);
    coopState.updatePlayerSettlement(playerId, founded.settlementId);
    const starterHeroIds = founded.founderHeroIds ?? (founded.founderHeroId ? [founded.founderHeroId] : []);
    let claimedStarterHero = false;
    for (const heroId of starterHeroIds) {
      claimedStarterHero = coopState.claimHero(socket.id, heroId) || claimedStarterHero;
    }
    if (claimedStarterHero) {
      this.broadcastCoopSnapshot();
    }

    sendToSocket(socket, {
      type: 'settlement:found_result',
      success: true,
      playerId,
      settlementId: founded.settlementId,
      q: founded.q,
      r: founded.r,
      message: 'Settlement founded.',
      timestamp: Date.now(),
    } satisfies SettlementFoundResultMessage);

    const run = runState.getSnapshotForSettlement(founded.settlementId);
    if (run) {
      sendToSocket(socket, {
        type: 'run:snapshot',
        settlementId: founded.settlementId,
        run,
        timestamp: Date.now(),
      } satisfies RunSnapshotMessage);
    }

    sendToSocket(socket, {
      type: 'world:snapshot',
      ...worldState.getSnapshot(),
      timestamp: Date.now(),
    } satisfies WorldSnapshotMessage);

    this.io.emit('message', {
      type: 'settlement:player_found',
      playerId,
      playerName: owner?.playerName ?? 'Pioneer',
      playerColor: owner?.playerColor ?? null,
      settlementId: founded.settlementId,
      q: founded.q,
      r: founded.r,
      timestamp: Date.now(),
    } satisfies SettlementPlayerFoundMessage);

    this.broadcastOptionsToConnectedPlayers();
    this.broadcastPlayerSnapshot();
  }
}
