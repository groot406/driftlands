import type { TickContext } from '../tick';
import { ServerMovementHandler } from '../handlers/movementHandler';
import { seasonState } from '../state/seasonState';

const movement = ServerMovementHandler.getInstance();

export const movementSystem = {
  name: 'movement',
  init: () => {
    movement.init();
  },
  tick: (ctx: TickContext) => {
    if (seasonState.isCompleted()) {
      return;
    }
    movement.tick(ctx.now);
  }
};
