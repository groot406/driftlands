import type { Server, Socket } from 'socket.io';
import { terrainPositions } from '../../../src/core/terrainRegistry';
import { resolveWorldTile } from '../../../src/core/worldGeneration';
import { tileIndex } from '../../../src/shared/game/world';
import { computeControlledTileIdsForSettlement } from '../../../src/shared/game/state/settlementSupportStore';
import {
  generateSettlementStartTerrainTiles,
  MIN_SETTLEMENT_START_CONNECTED_LAND,
  validateSettlementStartSite,
  type SettlementStartValidation,
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
  SeasonSnapshotMessage,
  WorldRestartMessage,
} from '../../../src/shared/protocol';
import { serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { playerSettlementState } from '../state/playerSettlementState';
import { coopState } from '../state/coopState';
import { worldState } from '../worldState';
import { runState } from '../state/runState';
import { serverDebugModeEnabled, settlementStartMode, spawnSafetyEnabled } from '../config/serverMode';
import { seasonState } from '../state/seasonState';
import { isAdminSocket } from '../config/admin';
import { gameAnalytics } from '../analytics/gameAnalytics';
import { competitionState } from '../state/competitionState';

export class ServerSettlementStartHandler {
  private static activeInstance: ServerSettlementStartHandler | null = null;
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
    ServerSettlementStartHandler.activeInstance = this;
  }

  static broadcastStartOptionsToConnectedPlayers(): void {
    ServerSettlementStartHandler.activeInstance?.broadcastOptionsToConnectedPlayers();
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
    const resolveTerrain = (q: number, r: number, origin?: { q: number; r: number }) => this.resolveTerrain(q, r, origin);
    const candidates: [] = [];

    const terrainTiles = generateSettlementStartTerrainTiles({
      settlements,
      candidates,
      resolveTerrain,
      freeStart: true,
    });
    const blockedTileOwners = this.getOtherPlayerReachTileOwners(playerId);
    for (const tile of terrainTiles) {
      const owner = blockedTileOwners.get(tile.id);
      if (owner) {
        tile.blocked = true;
        tile.blockedReason = 'player_reach';
      }
      tile.blockedByPlayerId = owner?.playerId ?? null;
      tile.blockedByPlayerName = owner?.playerName ?? null;
      tile.blockedByPlayerColor = owner?.playerColor ?? null;
    }

    return {
      type: 'settlement:start_options',
      playerId,
      currentSettlementId: playerSettlementState.getPlayerSettlement(playerId),
      startMode: settlementStartMode,
      settlements,
      candidates,
      terrainTiles,
      timestamp: Date.now(),
    };
  }

  private getOtherPlayerReachTileOwners(playerId: string) {
    const blockedTileOwners = new Map<string, { playerId: string; playerName: string; playerColor?: string | null }>();
    for (const player of playerSettlementState.listPlayers()) {
      if (player.id === playerId || !player.settlementId) {
        continue;
      }

      for (const tileId of computeControlledTileIdsForSettlement(player.settlementId)) {
        blockedTileOwners.set(tileId, {
          playerId: player.id,
          playerName: player.nickname,
          playerColor: player.color,
        });
      }
    }

    return blockedTileOwners;
  }

  private sendOptionsToSocket(socket: Socket) {
    sendToSocket(socket, this.buildOptionsMessage(playerSettlementState.getSocketPlayerId(socket.id) ?? socket.id));
  }

  private sendSeasonSnapshotToSocket(socket: Socket) {
    const season = seasonState.getSnapshot();
    if (!season) {
      return;
    }

    sendToSocket(socket, {
      type: 'season:snapshot',
      season,
      timestamp: Date.now(),
    } satisfies SeasonSnapshotMessage);
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
    playerSettlementState.registerPlayer(socket.id, message.playerId, message.playerName, message.spectator === true);
    this.sendSeasonSnapshotToSocket(socket);
    if (message.spectator === true) {
      return;
    }
    this.sendOptionsToSocket(socket);
  }

  private handleRequestOptions(socket: Socket, _message: SettlementStartRequestOptionsMessage): void {
    this.sendSeasonSnapshotToSocket(socket);
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

  private getStartValidationMessage(validation: SettlementStartValidation) {
    switch (validation.reason) {
      case 'water':
        return 'Settlements cannot start on water.';
      case 'vulcano':
        return 'Settlements cannot start on volcanoes.';
      case 'small_island':
        return `That island is too small. Pick a connected non-water landmass with at least ${MIN_SETTLEMENT_START_CONNECTED_LAND} tiles.`;
      default:
        return 'That settlement claim is no longer valid.';
    }
  }

  private handleFoundRequest(socket: Socket, message: SettlementFoundRequestMessage): void {
    if (playerSettlementState.isSocketSpectator(socket.id)) {
      this.rejectFoundRequest(socket, 'Spectators cannot found a settlement.');
      return;
    }

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

    const requestedSite = this.resolveFoundRequestSite(message);
    if (!requestedSite) {
      this.rejectFoundRequest(socket, 'That settlement claim is no longer valid.');
      return;
    }

    const settlementId = requestedSite.settlementId;
    if (playerSettlementState.isSettlementClaimed(settlementId)) {
      this.rejectFoundRequest(socket, 'That settlement site has already been taken.');
      return;
    }
    if (this.getOtherPlayerReachTileOwners(playerId).has(settlementId)) {
      this.rejectFoundRequest(socket, 'That site is already inside another player\'s reach.');
      return;
    }
    const validation = validateSettlementStartSite(
      requestedSite.q,
      requestedSite.r,
      (q, r) => this.resolveTerrain(q, r),
    );
    if (!validation.valid) {
      this.rejectFoundRequest(socket, this.getStartValidationMessage(validation));
      return;
    }

    const founded = worldState.foundSettlementAt(requestedSite.q, requestedSite.r, {
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

    this.finishFoundingSettlement(socket, playerId, founded);
  }

  private resolveFoundRequestSite(message: SettlementFoundRequestMessage) {
    if (typeof message.q !== 'number' || typeof message.r !== 'number') {
      return null;
    }

    if (!Number.isFinite(message.q) || !Number.isFinite(message.r)) {
      return null;
    }

    const q = Math.trunc(message.q);
    const r = Math.trunc(message.r);
    return {
      q,
      r,
      settlementId: `${q},${r}`,
    };
  }

  private finishFoundingSettlement(
    socket: Socket,
    playerId: string,
    founded: { settlementId: string; q: number; r: number; founderHeroId?: string; founderHeroIds?: string[] },
  ): void {
    const owner = playerSettlementState.getSettlementOwner(founded.settlementId);
    gameAnalytics.recordSettlementFounded();
    competitionState.recordSettlementFounded({
      playerId,
      playerName: owner?.playerName ?? playerSettlementState.getPlayerName(playerId) ?? 'Pioneer',
      playerColor: owner?.playerColor ?? playerSettlementState.getPlayerColor(playerId),
      settlementId: founded.settlementId,
    });
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

    const season = seasonState.getSnapshot();
    if (season) {
      sendToSocket(socket, {
        type: 'season:snapshot',
        season,
        timestamp: Date.now(),
      } satisfies SeasonSnapshotMessage);
    }

    sendToSocket(socket, {
      type: 'world:snapshot',
      ...worldState.getSnapshot(),
      debugModeEnabled: serverDebugModeEnabled,
      currentPlayerIsAdmin: isAdminSocket(socket),
      spawnSafetyEnabled,
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
