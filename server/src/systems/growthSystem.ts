import type { TickContext } from '../tick';
import { updateTileGrowth } from '../../../src/shared/game/growth';

export const growthSystem = {
  name: 'growth',
  init: () => {
    // Any server-side init can go here; for now, we rely on world setup elsewhere.
  },
  tick: (ctx: TickContext) => {
    updateTileGrowth(ctx.now);
  }
};
