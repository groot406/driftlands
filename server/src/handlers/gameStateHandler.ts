import type { Server } from 'socket.io';
import { serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { worldState } from '../worldState';
import type { Socket } from 'socket.io';
import type { CoopSnapshotMessage, PlayerJoinMessage, RunSnapshotMessage, WorldRequestMessage } from '../../../src/shared/protocol';
import { runState } from '../state/runState';
import { coopState } from '../state/coopState';

export class ServerGameStateHandler {
  constructor(_io: Server) {}

  init(): void {
    worldState.init();
    serverMessageRouter.on('world:request', this.handleWorldRequest.bind(this));
    serverMessageRouter.on('player:join', this.handlePlayerJoinSendWorld.bind(this));
  }

  private handleWorldRequest(socket: Socket, _message: WorldRequestMessage): void {
    const snapshot = worldState.getSnapshot();
    sendToSocket(socket, ({
      type: 'world:snapshot',
      tiles: snapshot.tiles,
      heroes: snapshot.heroes,
      tasks: snapshot.tasks,
      resources: snapshot.resources,
      storages: snapshot.storages,
      population: snapshot.population,
      timestamp: Date.now(),
    } as any));
    const run = runState.getSnapshot();
    if (run) {
      sendToSocket(socket, ({
        type: 'run:snapshot',
        run,
        timestamp: Date.now(),
      } as RunSnapshotMessage));
    }

    sendToSocket(socket, ({
      type: 'coop:snapshot',
      state: coopState.getSnapshot(),
      timestamp: Date.now(),
    } as CoopSnapshotMessage));
  }

  private handlePlayerJoinSendWorld(socket: Socket, _message: PlayerJoinMessage): void {
    this.handleWorldRequest(socket, { type: 'world:request' });
  }
}
