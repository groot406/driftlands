import type { TickContext } from '../tick';
import { updateTileGrowth } from '../../../src/shared/game/growth';

export const growthSystem = {
  name: 'growth',
  intervalMs: 1_000,
  init: () => {
    // Any server-side init can go here; for now, we rely on world setup elsewhere.
  },
  tick: (ctx: TickContext) => {
    updateTileGrowth(ctx.now);
  }
};
