import type { PlayerJoinMessage, PlayerLeaveMessage } from '../shared/protocol';
import { clientMessageRouter } from '../messageRouter';

class PlayerMessageHandler {
  init(): void {
    clientMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    clientMessageRouter.on('player:leave', this.handlePlayerLeave.bind(this));
  }

  private handlePlayerJoin(message: PlayerJoinMessage): void {
    console.log(`Player joined: ${message.playerName} (${message.playerId})`);

    window.dispatchEvent(new CustomEvent('player-join', {
      detail: { playerId: message.playerId, playerName: message.playerName }
    }));
  }

  private handlePlayerLeave(message: PlayerLeaveMessage): void {
    console.log(`Player left: ${message.playerId}`);

    window.dispatchEvent(new CustomEvent('player-leave', {
      detail: { playerId: message.playerId }
    }));
  }
}

export const playerMessageHandler = new PlayerMessageHandler();
