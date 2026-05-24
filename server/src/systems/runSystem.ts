import type { TickContext } from '../tick';
import { runState } from '../state/runState';

export const runSystem = {
  name: 'run',
  intervalMs: 1_000,
  tick: (ctx: TickContext) => {
    runState.tick(ctx.now);
  },
};
