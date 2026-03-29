import type { TickContext } from '../tick';
import { ServerMovementHandler } from '../handlers/movementHandler';

const movement = ServerMovementHandler.getInstance();

export const movementSystem = {
  name: 'movement',
  init: () => {
    movement.init();
  },
  tick: (ctx: TickContext) => {
    movement.tick(ctx.now);
  }
};
