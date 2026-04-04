import { clientMessageRouter } from '../messageRouter';
import type { PathUpdateMessage } from '../../shared/protocol';
import { startHeroMovement } from '../heroService';

class ClientMovementHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('hero:path_update', this.handlePathUpdate.bind(this));
  }

  private handlePathUpdate(message: PathUpdateMessage): void {
    const heroId = message.heroId;
    const path = message.path.slice();
    const target = message.target;
    const task = message.task;
    const startDelayMs = Math.max(0, message.startDelayMs || 0);
    // Use the server-provided relative delay instead of trusting absolute wall-clock
    // timestamps, which can drift between client and server and create fake stalls.
    const startAt = Date.now() + startDelayMs;
    const stepDurations = message.stepDurations;
    const cumulative = message.cumulative;

    // Start movement using server-provided timings
    startHeroMovement(heroId, path, target, task, {
      startDelayMs,
      startAt,
      stepDurations,
      cumulative,
      origin: message.origin,
      requestId: message.id,
      authoritative: true,
      taskLocation: message.taskLocation,
    });
  }
}

export const movementMessageHandler = new ClientMovementHandler();
