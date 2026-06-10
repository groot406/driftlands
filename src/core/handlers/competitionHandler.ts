import type { CompetitionSnapshotMessage, CompetitionUpdateMessage } from '../../shared/protocol.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { loadCompetitionState } from '../../store/competitionStore.ts';

class ClientCompetitionHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('competition:snapshot', this.handleCompetitionSnapshot.bind(this));
    clientMessageRouter.on('competition:update', this.handleCompetitionUpdate.bind(this));
  }

  private handleCompetitionSnapshot(message: CompetitionSnapshotMessage): void {
    loadCompetitionState(message.competition);
  }

  private handleCompetitionUpdate(message: CompetitionUpdateMessage): void {
    loadCompetitionState(message.competition);
  }
}

export const competitionHandler = new ClientCompetitionHandler();
