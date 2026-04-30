import type { RunSnapshotMessage, RunUpdateMessage } from '../../shared/protocol.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { loadRunState } from '../../store/runStore.ts';
import { currentPlayerSettlementId } from '../../store/settlementStartStore.ts';

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
    if (message.settlementId && message.settlementId !== currentPlayerSettlementId.value) {
      return;
    }

    loadRunState(message.run);
  }

  private handleRunUpdate(message: RunUpdateMessage): void {
    if (message.settlementId && message.settlementId !== currentPlayerSettlementId.value) {
      return;
    }

    loadRunState(message.run);
  }
}

export const runHandler = new ClientRunHandler();
