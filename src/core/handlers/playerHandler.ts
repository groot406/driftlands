import type { PlayerJoinMessage, PlayerLeaveMessage, PlayerCountMessage } from '../../shared/protocol';
import { clientMessageRouter } from '../messageRouter';
import { addPlayer, removePlayer, updateOnlinePlayersCount } from '../../store/playerStore';
import { addNotification } from '../../store/notificationStore';

class PlayerMessageHandler {
  init(): void {
    clientMessageRouter.on('player:join', this.handlePlayerJoin.bind(this));
    clientMessageRouter.on('player:leave', this.handlePlayerLeave.bind(this));
    clientMessageRouter.on('player:count', this.handlePlayerCount.bind(this));
  }

  private handlePlayerJoin(message: PlayerJoinMessage): void {
    console.log(`Player joined: ${message.playerName} (${message.playerId})`);

    addPlayer({ id: message.playerId, name: message.playerName });

    // Show notification for new player
    addNotification({
      type: 'player_join',
      title: 'Player joined',
      message: `${message.playerName} joined the game`,
      duration: 3000
    });

    window.dispatchEvent(new CustomEvent('player-join', {
      detail: { playerId: message.playerId, playerName: message.playerName }
    }));
  }

  private handlePlayerLeave(message: PlayerLeaveMessage): void {
    console.log(`Player left: ${message.playerId}`);

    removePlayer(message.playerId);

    // Show notification for player leaving
    addNotification({
      type: 'player_leave',
      title: 'Player left',
      message: `A player left the game`,
      duration: 3000
    });

    window.dispatchEvent(new CustomEvent('player-leave', {
      detail: { playerId: message.playerId }
    }));
  }

  private handlePlayerCount(message: PlayerCountMessage): void {
    console.log(`Updated player count: ${message.count}`);

    updateOnlinePlayersCount(message.count);
  }
}

export const playerMessageHandler = new PlayerMessageHandler();
