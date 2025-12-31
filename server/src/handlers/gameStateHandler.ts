import type { Server } from 'socket.io';
import { serverMessageRouter, sendToSocket } from '../messages/messageRouter';
import { worldState } from '../worldState';
import type { Socket } from 'socket.io';
import type { WorldRequestMessage, PlayerJoinMessage } from '../../../src/shared/protocol';

export class ServerGameStateHandler {
  constructor(private io: Server) {}

  init(): void {
    worldState.init();
    serverMessageRouter.on('world:request', this.handleWorldRequest.bind(this));
    serverMessageRouter.on('player:join', this.handlePlayerJoinSendWorld.bind(this));
  }

  private handleWorldRequest(socket: Socket, _message: WorldRequestMessage): void {
    const snapshot = worldState.getSnapshot();
    sendToSocket(socket, ({ type: 'world:snapshot', tiles: snapshot.tiles, heroes: snapshot.heroes, tasks: snapshot.tasks, timestamp: Date.now() } as any));
  }

  private handlePlayerJoinSendWorld(socket: Socket, _message: PlayerJoinMessage): void {
    this.handleWorldRequest(socket, { type: 'world:request' });
  }
}
