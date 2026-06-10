import type { Server } from 'socket.io';
import { broadcast, serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { worldState } from '../worldState';
import type { Socket } from 'socket.io';
import type {
  CoopSnapshotMessage,
  CompetitionRequestSnapshotMessage,
  CompetitionSnapshotMessage,
  PersistenceLoadSavedMessage,
  PersistenceRemoveSavedMessage,
  PersistenceRequestStatusMessage,
  PersistenceSaveAsMessage,
  PersistenceSaveNowMessage,
  PersistenceStatusMessage,
  PlayerJoinMessage,
  RunSnapshotMessage,
  SeasonSnapshotMessage,
  WorldRequestMessage,
  WorldRestartMessage,
  WorldSnapshotChunkMessage,
  WorldSnapshotCompleteMessage,
  WorldSnapshotStartMessage,
} from '../../../src/shared/protocol';
import { runState } from '../state/runState';
import { coopState } from '../state/coopState';
import { playerSettlementState } from '../state/playerSettlementState';
import { testModeState } from '../state/testModeState';
import { serverDebugModeEnabled, spawnSafetyEnabled } from '../config/serverMode';
import { seasonState } from '../state/seasonState';
import { isAdminSocket } from '../config/admin';
import { gameAnalytics } from '../analytics/gameAnalytics';
import { competitionState } from '../state/competitionState';

const WORLD_SNAPSHOT_TILE_CHUNK_SIZE = 1000;

export class ServerGameStateHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  init(): void {
    worldState.init();
    serverMessageRouter.on('world:request', this.handleWorldRequest.bind(this));
    if (serverDebugModeEnabled) {
      serverMessageRouter.on('world:restart', this.handleWorldRestart.bind(this));
    }
    serverMessageRouter.on('persistence:request_status', this.handlePersistenceStatusRequest.bind(this));
    serverMessageRouter.on('persistence:save_now', this.handlePersistenceSaveNow.bind(this));
    serverMessageRouter.on('persistence:save_as', this.handlePersistenceSaveAs.bind(this));
    serverMessageRouter.on('persistence:load_saved', this.handlePersistenceLoadSaved.bind(this));
    serverMessageRouter.on('persistence:remove_saved', this.handlePersistenceRemoveSaved.bind(this));
    serverMessageRouter.on('competition:request_snapshot', this.handleCompetitionSnapshotRequest.bind(this));
    serverMessageRouter.on('player:join', this.handlePlayerJoinSendWorld.bind(this));
  }

  private sendWorldSnapshot(send: (message: WorldSnapshotStartMessage | WorldSnapshotChunkMessage | WorldSnapshotCompleteMessage) => void, currentPlayerIsAdmin?: boolean): void {
    const snapshot = worldState.getSnapshot();
    const totalChunks = Math.max(1, Math.ceil(snapshot.tiles.length / WORLD_SNAPSHOT_TILE_CHUNK_SIZE));
    const snapshotId = `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    send({
      type: 'world:snapshot_start',
      snapshotId,
      totalTiles: snapshot.tiles.length,
      totalChunks,
      heroes: snapshot.heroes,
      settlers: snapshot.settlers,
      tasks: snapshot.tasks,
      resources: snapshot.resources,
      settlementResources: snapshot.settlementResources,
      storages: snapshot.storages,
      population: snapshot.population,
      jobs: snapshot.jobs,
      studies: snapshot.studies,
      market: snapshot.market,
      shipOrders: snapshot.shipOrders,
      debugModeEnabled: serverDebugModeEnabled,
      currentPlayerIsAdmin,
      spawnSafetyEnabled,
      timestamp: Date.now(),
    });

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * WORLD_SNAPSHOT_TILE_CHUNK_SIZE;
      const end = start + WORLD_SNAPSHOT_TILE_CHUNK_SIZE;
      send({
        type: 'world:snapshot_chunk',
        snapshotId,
        chunkIndex,
        totalChunks,
        tiles: snapshot.tiles.slice(start, end),
        timestamp: Date.now(),
      });
    }

    send({
      type: 'world:snapshot_complete',
      snapshotId,
      timestamp: Date.now(),
    });
  }

  private sendWorldSnapshotToSocket(socket: Socket): void {
    this.sendWorldSnapshot((message) => {
      sendToSocket(socket, message);
    }, isAdminSocket(socket));
  }

  private broadcastWorldSnapshot(): void {
    this.sendWorldSnapshot((message) => {
      broadcast(message);
    }, false);
  }

  private sendFullWorldStateToConnectedSockets(): void {
    this.io.sockets.sockets.forEach((socket) => {
      this.handleWorldRequest(socket, { type: 'world:request' });
    });
  }

  private buildRunSnapshotMessage(socket?: Socket): RunSnapshotMessage | null {
    const playerId = socket ? playerSettlementState.getSocketPlayerId(socket.id) : null;
    const settlementId = playerId ? playerSettlementState.getPlayerSettlement(playerId) : null;
    const run = settlementId ? runState.getSnapshotForSettlement(settlementId) : runState.getSnapshot();
    if (!run) {
      return null;
    }

    return {
      type: 'run:snapshot',
      settlementId,
      run,
      timestamp: Date.now(),
    };
  }

  private buildCoopSnapshotMessage(): CoopSnapshotMessage {
    return {
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    };
  }

  private buildSeasonSnapshotMessage(): SeasonSnapshotMessage | null {
    const season = seasonState.getSnapshot();
    if (!season) {
      return null;
    }
    return {
      type: 'season:snapshot',
      season,
      timestamp: Date.now(),
    };
  }

  private buildCompetitionSnapshotMessage(): CompetitionSnapshotMessage {
    return {
      type: 'competition:snapshot',
      competition: competitionState.getSnapshot(),
      timestamp: Date.now(),
    };
  }

  private buildPersistenceStatusMessage(): PersistenceStatusMessage {
    return {
      type: 'persistence:status',
      ...worldState.getPersistenceStatus(),
      timestamp: Date.now(),
    };
  }

  private canUsePersistenceControls(socket: Socket) {
    return serverDebugModeEnabled || isAdminSocket(socket);
  }

  private handlePersistenceStatusRequest(socket: Socket, _message: PersistenceRequestStatusMessage): void {
    if (!this.canUsePersistenceControls(socket)) {
      return;
    }

    sendToSocket(socket, this.buildPersistenceStatusMessage());
  }

  private handlePersistenceSaveNow(socket: Socket, _message: PersistenceSaveNowMessage): void {
    if (!this.canUsePersistenceControls(socket)) {
      return;
    }

    worldState.saveNow('debug-button');
    sendToSocket(socket, this.buildPersistenceStatusMessage());
  }

  private handlePersistenceSaveAs(socket: Socket, message: PersistenceSaveAsMessage): void {
    if (!this.canUsePersistenceControls(socket)) {
      return;
    }

    worldState.saveAs(message.name);
    sendToSocket(socket, this.buildPersistenceStatusMessage());
  }

  private handlePersistenceLoadSaved(socket: Socket, message: PersistenceLoadSavedMessage): void {
    if (!this.canUsePersistenceControls(socket)) {
      return;
    }

    if (worldState.loadSavedState(message.id)) {
      testModeState.reapplyWorldState();
      coopState.resetHeroClaims();
      this.sendFullWorldStateToConnectedSockets();
      return;
    }

    sendToSocket(socket, this.buildPersistenceStatusMessage());
  }

  private handlePersistenceRemoveSaved(socket: Socket, message: PersistenceRemoveSavedMessage): void {
    if (!this.canUsePersistenceControls(socket)) {
      return;
    }

    worldState.removeSavedState(message.id);
    sendToSocket(socket, this.buildPersistenceStatusMessage());
  }

  private handleCompetitionSnapshotRequest(socket: Socket, _message: CompetitionRequestSnapshotMessage): void {
    sendToSocket(socket, this.buildCompetitionSnapshotMessage());
  }

  private handleWorldRequest(socket: Socket, _message: WorldRequestMessage): void {
    this.sendWorldSnapshotToSocket(socket);
    testModeState.sendUpdate(socket);
    const runSnapshot = this.buildRunSnapshotMessage(socket);
    if (runSnapshot) {
      sendToSocket(socket, runSnapshot);
    }
    const seasonSnapshot = this.buildSeasonSnapshotMessage();
    if (seasonSnapshot) {
      sendToSocket(socket, seasonSnapshot);
    }
    sendToSocket(socket, this.buildCompetitionSnapshotMessage());
    if (this.canUsePersistenceControls(socket)) {
      sendToSocket(socket, this.buildPersistenceStatusMessage());
    }
    sendToSocket(socket, this.buildCoopSnapshotMessage());
  }

  private handleWorldRestart(_socket: Socket, message: WorldRestartMessage): void {
    worldState.init(message.seed, message.radius);
    gameAnalytics.recordWorldRestart();
    testModeState.reapplyWorldState();
    coopState.resetHeroClaims();
    this.broadcastWorldSnapshot();
    broadcast(this.buildCoopSnapshotMessage());
  }

  private handlePlayerJoinSendWorld(socket: Socket, _message: PlayerJoinMessage): void {
    this.handleWorldRequest(socket, { type: 'world:request' });
  }
}
