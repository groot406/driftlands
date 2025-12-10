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
    const startDelayMs = message.startDelayMs || 0;
    const stepDurations = message.stepDurations;
    const cumulative = message.cumulative;

    // Start movement using server-provided timings
    startHeroMovement(heroId, path, target, task, {
      startDelayMs,
      stepDurations,
      cumulative,
      origin: message.origin,
    } as any);
  }
}

export const movementMessageHandler = new ClientMovementHandler();
