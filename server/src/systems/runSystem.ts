import type { TickContext } from '../tick';
import { runState } from '../state/runState';

export const runSystem = {
  name: 'run',
  tick: (ctx: TickContext) => {
    runState.tick(ctx.now);
  },
};
