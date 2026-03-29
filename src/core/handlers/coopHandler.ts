import type { CoopPingMessage, CoopSnapshotMessage } from '../../shared/protocol';
import { clientMessageRouter } from '../messageRouter';
import { addCoopPing, replacePartyState } from '../../store/playerStore';
import { addNotification } from '../../store/notificationStore';
import { currentPlayerId } from '../socket';

class ClientCoopHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('coop:snapshot', this.handleSnapshot.bind(this));
    clientMessageRouter.on('coop:ping', this.handlePing.bind(this));
  }

  private handleSnapshot(message: CoopSnapshotMessage): void {
    replacePartyState(message.state);
  }

  private handlePing(message: CoopPingMessage): void {
    addCoopPing(message.ping);

    if (message.ping.playerId === currentPlayerId.value) {
      return;
    }

    addNotification({
      type: 'coop_ping',
      title: `${message.ping.playerName} pinged the map`,
      message: `${message.ping.label} at (${message.ping.q}, ${message.ping.r}).`,
      duration: 4500,
    });
  }
}

export const coopHandler = new ClientCoopHandler();
