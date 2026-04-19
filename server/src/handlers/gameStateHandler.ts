import type { Server } from 'socket.io';
import { broadcast, serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { worldState } from '../worldState';
import type { Socket } from 'socket.io';
import type {
  CoopSnapshotMessage,
  PlayerJoinMessage,
  RunSnapshotMessage,
  WorldRequestMessage,
  WorldRestartMessage,
  WorldSnapshotChunkMessage,
  WorldSnapshotCompleteMessage,
  WorldSnapshotStartMessage,
} from '../../../src/shared/protocol';
import { runState } from '../state/runState';
import { coopState } from '../state/coopState';

const WORLD_SNAPSHOT_TILE_CHUNK_SIZE = 1000;

export class ServerGameStateHandler {
  constructor(_io: Server) {}

  init(): void {
    worldState.init();
    serverMessageRouter.on('world:request', this.handleWorldRequest.bind(this));
    serverMessageRouter.on('world:restart', this.handleWorldRestart.bind(this));
    serverMessageRouter.on('player:join', this.handlePlayerJoinSendWorld.bind(this));
  }

  private sendWorldSnapshot(send: (message: WorldSnapshotStartMessage | WorldSnapshotChunkMessage | WorldSnapshotCompleteMessage) => void): void {
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
      storages: snapshot.storages,
      population: snapshot.population,
      jobs: snapshot.jobs,
      studies: snapshot.studies,
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
    });
  }

  private broadcastWorldSnapshot(): void {
    this.sendWorldSnapshot((message) => {
      broadcast(message);
    });
  }

  private buildRunSnapshotMessage(): RunSnapshotMessage | null {
    const run = runState.getSnapshot();
    if (!run) {
      return null;
    }

    return {
      type: 'run:snapshot',
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

  private handleWorldRequest(socket: Socket, _message: WorldRequestMessage): void {
    this.sendWorldSnapshotToSocket(socket);
    const runSnapshot = this.buildRunSnapshotMessage();
    if (runSnapshot) {
      sendToSocket(socket, runSnapshot);
    }
    sendToSocket(socket, this.buildCoopSnapshotMessage());
  }

  private handleWorldRestart(_socket: Socket, message: WorldRestartMessage): void {
    worldState.init(message.seed, message.radius);
    coopState.resetHeroClaims();
    this.broadcastWorldSnapshot();
    broadcast(this.buildCoopSnapshotMessage());
  }

  private handlePlayerJoinSendWorld(socket: Socket, _message: PlayerJoinMessage): void {
    this.handleWorldRequest(socket, { type: 'world:request' });
  }
}
