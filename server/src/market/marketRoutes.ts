import type {
  MarketUpdateMessage,
  ResourceDepositMessage,
  ResourceWithdrawMessage,
} from '../../../src/shared/protocol.ts';
import type { MarketActorType, MarketTransactionAction } from '../../../src/shared/game/market.ts';
import { hasSettlementMarketAccess } from '../../../src/shared/game/marketAccess.ts';
import { broadcast } from '../messages/messageRouter.ts';
import { marketState, MarketTradeError, type MarketTradeResult } from '../state/marketState.ts';
import { playerSettlementState } from '../state/playerSettlementState.ts';

function parseActorType(value: unknown): MarketActorType {
  return value === 'AI' ? 'AI' : 'PLAYER';
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveTradeRequest(body: any) {
  const actorId = getString(body.actorId) ?? getString(body.playerId);
  if (!actorId) {
    throw new MarketTradeError('A playerId or actorId is required.', 'MISSING_ACTOR');
  }

  const actorType = parseActorType(body.actorType);
  const settlementId = getString(body.settlementId)
    ?? (actorType === 'PLAYER' ? playerSettlementState.getPlayerSettlement(actorId) : null);

  return {
    actorId,
    actorType,
    settlementId,
    resourceType: body.resourceType,
    quantity: body.quantity,
  };
}

function assertMarketAccess(request: ReturnType<typeof resolveTradeRequest>) {
  if (request.actorType !== 'PLAYER') {
    return;
  }

  if (!hasSettlementMarketAccess(request.settlementId)) {
    throw new MarketTradeError(
      'Build a Trade Center in this settlement before trading.',
      'TRADE_CENTER_REQUIRED',
      403,
    );
  }
}

function broadcastMarketResult(action: MarketTransactionAction, result: MarketTradeResult) {
  for (const transfer of result.resourceTransfers) {
    const message = action === 'BUY'
      ? {
          type: 'resource:deposit',
          heroId: 'market',
          storageTileId: transfer.storageTileId,
          resource: {
            type: result.transaction.resourceType,
            amount: transfer.amount,
          },
          timestamp: Date.now(),
        } satisfies ResourceDepositMessage
      : {
          type: 'resource:withdraw',
          heroId: 'market',
          storageTileId: transfer.storageTileId,
          resource: {
            type: result.transaction.resourceType,
            amount: transfer.amount,
          },
          timestamp: Date.now(),
        } satisfies ResourceWithdrawMessage;

    broadcast(message);
  }

  broadcast({
    type: 'market:update',
    market: marketState.getOverview(),
    timestamp: Date.now(),
  } satisfies MarketUpdateMessage);
}

function respondWithTradeResult(res: any, result: MarketTradeResult) {
  res.json({
    ...result.overview,
    transaction: result.transaction,
  });
}

function handleMarketError(res: any, error: unknown) {
  if (error instanceof MarketTradeError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error('Market route failed:', error);
  res.status(500).json({
    code: 'MARKET_ERROR',
    message: 'The market could not process that request.',
  });
}

export function registerMarketRoutes(app: any) {
  app.get('/api/driftlands/market', (req: any, res: any) => {
    const actorId = getString(req.query?.actorId) ?? getString(req.query?.playerId);
    const actorType = parseActorType(req.query?.actorType);
    res.json(marketState.getOverview(actorId, actorType));
  });

  app.post('/api/driftlands/market/buy', (req: any, res: any) => {
    try {
      const request = resolveTradeRequest(req.body ?? {});
      assertMarketAccess(request);
      const result = marketState.buyResource(request);
      broadcastMarketResult('BUY', result);
      respondWithTradeResult(res, result);
    } catch (error) {
      handleMarketError(res, error);
    }
  });

  app.post('/api/driftlands/market/sell', (req: any, res: any) => {
    try {
      const request = resolveTradeRequest(req.body ?? {});
      assertMarketAccess(request);
      const result = marketState.sellResource(request);
      broadcastMarketResult('SELL', result);
      respondWithTradeResult(res, result);
    } catch (error) {
      handleMarketError(res, error);
    }
  });
}
