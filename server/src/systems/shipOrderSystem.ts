import type { TickContext } from '../tick';
import { shipOrderState } from '../state/shipOrderState';
import { seasonState } from '../state/seasonState';

export const shipOrderSystem = {
  name: 'ship-orders',
  intervalMs: 1_000,
  tick: (ctx: TickContext) => {
    if (seasonState.isCompleted()) {
      return;
    }
    shipOrderState.tick(ctx.now);
  },
};
