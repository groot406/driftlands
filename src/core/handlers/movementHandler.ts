import { clientMessageRouter } from '../messageRouter';
import type { PathUpdateMessage } from '../../shared/protocol';
import { startHeroMovement } from '../../store/heroStore';

class ClientMovementHandler {
  init(): void {
    clientMessageRouter.on('hero:path_update', this.handlePathUpdate.bind(this));
  }

  private handlePathUpdate(message: PathUpdateMessage): void {
    const heroId = message.heroId;
    const path = message.path.slice();
    const target = message.target;
    const task = message.task;
    
    // Start movement immediately for prediction
    startHeroMovement(heroId, path, target, task);
  }
}

export const movementMessageHandler = new ClientMovementHandler();
