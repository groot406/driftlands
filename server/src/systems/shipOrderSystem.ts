import type { TickContext } from '../tick';
import { shipOrderState } from '../state/shipOrderState';

export const shipOrderSystem = {
  name: 'ship-orders',
  tick: (ctx: TickContext) => {
    shipOrderState.tick(ctx.now);
  },
};
