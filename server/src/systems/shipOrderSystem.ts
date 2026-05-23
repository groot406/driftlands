import type { TickContext } from '../tick';
import { shipOrderState } from '../state/shipOrderState';
import { seasonState } from '../state/seasonState';

export const shipOrderSystem = {
  name: 'ship-orders',
  tick: (ctx: TickContext) => {
    if (seasonState.isCompleted()) {
      return;
    }
    shipOrderState.tick(ctx.now);
  },
};
