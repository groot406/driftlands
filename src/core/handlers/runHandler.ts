import type { RunSnapshotMessage, RunUpdateMessage } from '../../shared/protocol.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { loadRunState } from '../../store/runStore.ts';

class ClientRunHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('run:snapshot', this.handleRunSnapshot.bind(this));
    clientMessageRouter.on('run:update', this.handleRunUpdate.bind(this));
  }

  private handleRunSnapshot(message: RunSnapshotMessage): void {
    loadRunState(message.run);
  }

  private handleRunUpdate(message: RunUpdateMessage): void {
    loadRunState(message.run);
  }
}

export const runHandler = new ClientRunHandler();
