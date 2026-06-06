import type { Socket } from 'socket.io';
import type {
  MarketOverviewRequestMessage,
  MarketResponseMessage,
  MarketTradeRequestMessage,
} from '../../../src/shared/protocol.ts';
import { serverMessageRouter, sendToSocket } from '../messages/messageRouter.ts';
import { getMarketOverviewForActor, executeMarketTrade } from '../market/marketRoutes.ts';
import { MarketTradeError } from '../state/marketState.ts';

export class ServerMarketHandler {
  init() {
    serverMessageRouter.on<MarketOverviewRequestMessage>('market:request_overview', this.handleOverviewRequest.bind(this));
    serverMessageRouter.on<MarketTradeRequestMessage>('market:trade', this.handleTradeRequest.bind(this));
  }

  private sendResponse(socket: Socket, message: Omit<MarketResponseMessage, 'type' | 'timestamp'>) {
    sendToSocket(socket, {
      type: 'market:response',
      timestamp: Date.now(),
      ...message,
    } satisfies MarketResponseMessage);
  }

  private handleOverviewRequest(socket: Socket, message: MarketOverviewRequestMessage) {
    this.sendResponse(socket, {
      requestId: message.requestId,
      ok: true,
      market: getMarketOverviewForActor(message.actorId, message.actorType),
    });
  }

  private handleTradeRequest(socket: Socket, message: MarketTradeRequestMessage) {
    try {
      const result = executeMarketTrade(message.action, {
        actorId: message.actorId,
        actorType: message.actorType,
        settlementId: message.settlementId,
        resourceType: message.resourceType,
        quantity: message.quantity,
      });

      this.sendResponse(socket, {
        requestId: message.requestId,
        ok: true,
        market: result.overview,
      });
    } catch (error) {
      this.sendResponse(socket, {
        requestId: message.requestId,
        ok: false,
        code: error instanceof MarketTradeError ? error.code : 'MARKET_ERROR',
        message: error instanceof Error ? error.message : 'The market could not process that request.',
      });
    }
  }
}
