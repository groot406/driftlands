import type { MarketUpdateMessage } from '../../shared/protocol.ts';
import { replaceMarketOverview } from '../../store/marketStore.ts';
import { clientMessageRouter } from '../messageRouter.ts';

class ClientMarketHandler {
  private initialized = false;

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    clientMessageRouter.on('market:update', this.handleMarketUpdate.bind(this));
  }

  private handleMarketUpdate(message: MarketUpdateMessage): void {
    replaceMarketOverview(message.market);
  }
}

export const marketHandler = new ClientMarketHandler();
