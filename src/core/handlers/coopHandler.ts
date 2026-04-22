import type { CoopPingMessage, CoopSnapshotMessage } from '../../shared/protocol';
import { clientMessageRouter } from '../messageRouter';
import { addCoopPing, replacePartyState } from '../../store/playerStore';
import { addNotification } from '../../store/notificationStore';
import { currentPlayerId } from '../socket';
import { setStoryTileHint } from '../../store/storyHintStore';
import { tileIndex } from '../world';

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
    if (message.ping.kind === 'scout' && message.ping.label.startsWith('Found ')) {
      const tile = tileIndex[`${message.ping.q},${message.ping.r}`];
      if (tile?.discovered) {
        return;
      }

      setStoryTileHint({
        id: `scout:${message.ping.id}`,
        kind: 'scout',
        q: message.ping.q,
        r: message.ping.r,
        label: message.ping.label,
        createdAt: message.ping.createdAt,
      });
      return;
    }

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
