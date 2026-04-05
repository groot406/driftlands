import type { Server } from 'socket.io';
import { broadcast, serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { worldState } from '../worldState';
import type { Socket } from 'socket.io';
import type { CoopSnapshotMessage, PlayerJoinMessage, RunSnapshotMessage, WorldRequestMessage, WorldRestartMessage, WorldSnapshotMessage } from '../../../src/shared/protocol';
import { runState } from '../state/runState';
import { coopState } from '../state/coopState';

export class ServerGameStateHandler {
  constructor(_io: Server) {}

  init(): void {
    worldState.init();
    serverMessageRouter.on('world:request', this.handleWorldRequest.bind(this));
    serverMessageRouter.on('world:restart', this.handleWorldRestart.bind(this));
    serverMessageRouter.on('player:join', this.handlePlayerJoinSendWorld.bind(this));
  }

  private buildWorldSnapshotMessage(): WorldSnapshotMessage {
    const snapshot = worldState.getSnapshot();
    return {
      type: 'world:snapshot',
      tiles: snapshot.tiles,
      heroes: snapshot.heroes,
      tasks: snapshot.tasks,
      resources: snapshot.resources,
      storages: snapshot.storages,
      population: snapshot.population,
      jobs: snapshot.jobs,
      timestamp: Date.now(),
    };
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
    sendToSocket(socket, this.buildWorldSnapshotMessage());
    const runSnapshot = this.buildRunSnapshotMessage();
    if (runSnapshot) {
      sendToSocket(socket, runSnapshot);
    }
    sendToSocket(socket, this.buildCoopSnapshotMessage());
  }

  private handleWorldRestart(_socket: Socket, message: WorldRestartMessage): void {
    worldState.init(message.seed);
    coopState.resetHeroClaims();
    broadcast(this.buildWorldSnapshotMessage());
    broadcast(this.buildCoopSnapshotMessage());
  }

  private handlePlayerJoinSendWorld(socket: Socket, _message: PlayerJoinMessage): void {
    this.handleWorldRequest(socket, { type: 'world:request' });
  }
}
