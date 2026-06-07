import type { ChangelogSnapshotMessage } from '../../shared/protocol.ts';
import { clientMessageRouter } from '../messageRouter';
import { replaceChangelogSnapshot } from '../../store/changelogStore.ts';

class ChangelogMessageHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('changelog:snapshot', this.handleChangelogSnapshot.bind(this));
  }

  private handleChangelogSnapshot(message: ChangelogSnapshotMessage): void {
    replaceChangelogSnapshot(message);
  }
}

export const changelogHandler = new ChangelogMessageHandler();
