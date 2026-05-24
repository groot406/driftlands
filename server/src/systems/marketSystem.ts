import type { MarketUpdateMessage } from '../../../src/shared/protocol.ts';
import type { TickContext } from '../tick';
import { broadcast } from '../messages/messageRouter';
import { marketState } from '../state/marketState';

export const marketSystem = {
  name: 'market',
  intervalMs: 1_000,
  tick: (ctx: TickContext) => {
    if (!marketState.tick(ctx.now)) {
      return;
    }

    const overview = marketState.getOverview();
    broadcast({
      type: 'market:update',
      market: {
        resources: overview.resources,
        transactions: overview.transactions,
      },
      timestamp: ctx.now,
    } satisfies MarketUpdateMessage);
  },
};
