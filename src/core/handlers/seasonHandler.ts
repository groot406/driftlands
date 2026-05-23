import type { SeasonCompletedMessage, SeasonSnapshotMessage, SeasonUpdateMessage } from '../../shared/protocol.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { loadSeasonState } from '../../store/seasonStore.ts';

class ClientSeasonHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('season:snapshot', this.handleSeasonSnapshot.bind(this));
    clientMessageRouter.on('season:update', this.handleSeasonUpdate.bind(this));
    clientMessageRouter.on('season:completed', this.handleSeasonCompleted.bind(this));
  }

  private handleSeasonSnapshot(message: SeasonSnapshotMessage): void {
    loadSeasonState(message.season);
  }

  private handleSeasonUpdate(message: SeasonUpdateMessage): void {
    loadSeasonState(message.season);
  }

  private handleSeasonCompleted(message: SeasonCompletedMessage): void {
    loadSeasonState(message.season);
  }
}

export const seasonHandler = new ClientSeasonHandler();
