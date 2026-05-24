import {
  calculateMarketBuyPrice,
  calculateMarketSellPrice,
  createInitialMarketResourceState,
  DEFAULT_MARKET_RESOURCE_CONFIGS,
  isMarketResourceType,
  type MarketActorType,
  type MarketOverviewSnapshot,
  type MarketResourceState,
  type MarketResourceType,
  type MarketTransaction,
  type WalletSnapshot,
} from '../../../src/shared/game/market.ts';
import {
  depositResourceAcrossStoragesForSettlement,
  planResourceDepositsAcrossStoragesForSettlement,
  planResourceWithdrawalsAcrossStoragesForSettlement,
  type StorageResourceTransfer,
  withdrawResourceAcrossStoragesForSettlement,
} from '../../../src/shared/game/state/resourceStore.ts';

const INITIAL_WALLET_GOLD = 0;
const MAX_TRANSACTION_HISTORY = 100;
const STOCK_CHANGE_INTERVAL_MS = 60_000;

export class MarketTradeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface MarketTradeRequest {
  actorId: string;
  actorType?: MarketActorType;
  settlementId?: string | null;
  resourceType: unknown;
  quantity: unknown;
}

export interface MarketTradeResult {
  transaction: MarketTransaction;
  wallet: WalletSnapshot;
  resourceTransfers: StorageResourceTransfer[];
  overview: MarketOverviewSnapshot;
}

export interface WalletState {
  actorId: string;
  actorType: MarketActorType;
  gold: number;
  updatedAt: number;
}

export interface MarketPersistenceSnapshot {
  resources: MarketResourceState[];
  wallets: WalletState[];
  transactions: MarketTransaction[];
  transactionSequence: number;
}

class ResourceMarketState {
  private readonly resources = new Map<MarketResourceType, MarketResourceState>();
  private readonly wallets = new Map<string, WalletState>();
  private transactions: MarketTransaction[] = [];
  private transactionSequence = 0;

  reset(now: number = Date.now()) {
    this.resources.clear();
    for (const config of DEFAULT_MARKET_RESOURCE_CONFIGS) {
      this.resources.set(config.resourceType, createInitialMarketResourceState(config, now));
    }

    this.wallets.clear();
    this.transactions = [];
    this.transactionSequence = 0;
  }

  getPersistenceSnapshot(): MarketPersistenceSnapshot {
    return {
      resources: Array.from(this.resources.values()).map((resource) => ({ ...resource })),
      wallets: Array.from(this.wallets.values()).map((wallet) => ({ ...wallet })),
      transactions: this.transactions.map((transaction) => ({ ...transaction })),
      transactionSequence: this.transactionSequence,
    };
  }

  loadPersistenceSnapshot(snapshot: MarketPersistenceSnapshot | null | undefined, now: number = Date.now()) {
    this.reset(now);
    if (!snapshot) {
      return;
    }

    this.resources.clear();
    for (const config of DEFAULT_MARKET_RESOURCE_CONFIGS) {
      const saved = snapshot.resources?.find((resource) => resource.resourceType === config.resourceType);
      this.resources.set(config.resourceType, {
        ...config,
        currentStock: Math.max(0, Math.floor(saved?.currentStock ?? config.initialStock)),
        updatedAt: saved?.updatedAt ?? now,
      });
    }

    this.wallets.clear();
    for (const wallet of snapshot.wallets ?? []) {
      if (!wallet.actorId) {
        continue;
      }
      this.wallets.set(this.getWalletKey(wallet.actorId, wallet.actorType), {
        actorId: wallet.actorId,
        actorType: wallet.actorType === 'AI' ? 'AI' : 'PLAYER',
        gold: Math.max(0, Math.floor(wallet.gold ?? 0)),
        updatedAt: wallet.updatedAt ?? now,
      });
    }

    this.transactions = (snapshot.transactions ?? []).map((transaction) => ({ ...transaction })).slice(-MAX_TRANSACTION_HISTORY);
    this.transactionSequence = Math.max(
      snapshot.transactionSequence ?? 0,
      ...this.transactions.map((transaction) => {
        const sequence = Number(transaction.id.split('-').pop());
        return Number.isFinite(sequence) ? sequence : 0;
      }),
    );
  }

  tick(now: number = Date.now()) {
    return this.advanceStock(now);
  }

  getOverview(actorId?: string | null, actorType: MarketActorType = 'PLAYER'): MarketOverviewSnapshot {
    const resources = {} as MarketOverviewSnapshot['resources'];

    for (const config of DEFAULT_MARKET_RESOURCE_CONFIGS) {
      const resource = this.resources.get(config.resourceType) ?? createInitialMarketResourceState(config, Date.now());
      const buyPrice = calculateMarketBuyPrice(resource);
      resources[config.resourceType] = {
        price: buyPrice,
        buyPrice,
        sellPrice: calculateMarketSellPrice(resource),
        stock: resource.currentStock,
        basePrice: resource.basePrice,
        targetStock: resource.targetStock,
        minPrice: resource.minPrice,
        maxPrice: resource.maxPrice,
      };
    }

    return {
      resources,
      wallet: actorId ? this.toWalletSnapshot(this.ensureWallet(actorId, actorType)) : null,
      transactions: this.transactions.map((transaction) => ({ ...transaction })),
    };
  }

  grantGold(actorId: string, amount: number, actorType: MarketActorType = 'PLAYER'): WalletSnapshot {
    const normalizedAmount = Math.max(0, Math.floor(amount));
    const wallet = this.ensureWallet(actorId, actorType);
    if (normalizedAmount > 0) {
      wallet.gold += normalizedAmount;
      wallet.updatedAt = Date.now();
    }

    return this.toWalletSnapshot(wallet);
  }

  buyResource(request: MarketTradeRequest): MarketTradeResult {
    const normalized = this.normalizeTradeRequest(request);
    const resource = this.getResource(normalized.resourceType);
    const wallet = this.ensureWallet(normalized.actorId, normalized.actorType);
    const pricePerUnit = calculateMarketBuyPrice(resource);
    const totalGold = pricePerUnit * normalized.quantity;

    if (resource.currentStock < normalized.quantity) {
      throw new MarketTradeError('The market does not have enough stock for that purchase.', 'MARKET_STOCK_TOO_LOW');
    }

    if (wallet.gold < totalGold) {
      throw new MarketTradeError('Not enough Gold for that purchase.', 'INSUFFICIENT_GOLD');
    }

    const plannedDeposits = planResourceDepositsAcrossStoragesForSettlement(
      normalized.settlementId,
      normalized.resourceType,
      normalized.quantity,
    );
    const plannedDepositAmount = plannedDeposits.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (plannedDepositAmount < normalized.quantity) {
      throw new MarketTradeError('Not enough settlement storage for that purchase.', 'INSUFFICIENT_STORAGE');
    }

    const resourceTransfers = depositResourceAcrossStoragesForSettlement(
      normalized.settlementId,
      normalized.resourceType,
      normalized.quantity,
    );
    const depositedAmount = resourceTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (depositedAmount !== normalized.quantity) {
      throw new MarketTradeError('Could not store the purchased resources.', 'MARKET_DEPOSIT_FAILED');
    }

    wallet.gold -= totalGold;
    wallet.updatedAt = Date.now();
    resource.currentStock -= normalized.quantity;
    resource.updatedAt = wallet.updatedAt;

    const transaction = this.recordTransaction({
      actorId: normalized.actorId,
      actorType: normalized.actorType,
      action: 'BUY',
      resourceType: normalized.resourceType,
      quantity: normalized.quantity,
      pricePerUnit,
      totalGold,
    });

    return {
      transaction,
      wallet: this.toWalletSnapshot(wallet),
      resourceTransfers,
      overview: this.getOverview(normalized.actorId, normalized.actorType),
    };
  }

  sellResource(request: MarketTradeRequest): MarketTradeResult {
    const normalized = this.normalizeTradeRequest(request);
    const resource = this.getResource(normalized.resourceType);
    const wallet = this.ensureWallet(normalized.actorId, normalized.actorType);
    const pricePerUnit = calculateMarketSellPrice(resource);
    const totalGold = pricePerUnit * normalized.quantity;

    const plannedWithdrawals = planResourceWithdrawalsAcrossStoragesForSettlement(
      normalized.settlementId,
      normalized.resourceType,
      normalized.quantity,
    );
    const plannedWithdrawalAmount = plannedWithdrawals.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (plannedWithdrawalAmount < normalized.quantity) {
      throw new MarketTradeError('Not enough stored resources for that sale.', 'INSUFFICIENT_RESOURCE');
    }

    const resourceTransfers = withdrawResourceAcrossStoragesForSettlement(
      normalized.settlementId,
      normalized.resourceType,
      normalized.quantity,
    );
    const withdrawnAmount = resourceTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (withdrawnAmount !== normalized.quantity) {
      throw new MarketTradeError('Could not withdraw the sold resources.', 'MARKET_WITHDRAW_FAILED');
    }

    wallet.gold += totalGold;
    wallet.updatedAt = Date.now();
    resource.currentStock += normalized.quantity;
    resource.updatedAt = wallet.updatedAt;

    const transaction = this.recordTransaction({
      actorId: normalized.actorId,
      actorType: normalized.actorType,
      action: 'SELL',
      resourceType: normalized.resourceType,
      quantity: normalized.quantity,
      pricePerUnit,
      totalGold,
    });

    return {
      transaction,
      wallet: this.toWalletSnapshot(wallet),
      resourceTransfers,
      overview: this.getOverview(normalized.actorId, normalized.actorType),
    };
  }

  private normalizeTradeRequest(request: MarketTradeRequest): {
    actorId: string;
    actorType: MarketActorType;
    settlementId: string;
    resourceType: MarketResourceType;
    quantity: number;
  } {
    const actorId = request.actorId?.trim();
    if (!actorId) {
      throw new MarketTradeError('A market actor is required.', 'MISSING_ACTOR');
    }

    const actorType = request.actorType === 'AI' ? 'AI' : 'PLAYER';
    const settlementId = request.settlementId?.trim();
    if (!settlementId) {
      throw new MarketTradeError('A settlement is required for market trades.', 'MISSING_SETTLEMENT');
    }

    if (!isMarketResourceType(request.resourceType)) {
      throw new MarketTradeError('That resource is not tradable on the market.', 'INVALID_RESOURCE');
    }

    const quantity = Number(request.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.floor(quantity) !== quantity) {
      throw new MarketTradeError('Quantity must be a positive whole number.', 'INVALID_QUANTITY');
    }

    return {
      actorId,
      actorType,
      settlementId,
      resourceType: request.resourceType,
      quantity,
    };
  }

  private getResource(resourceType: MarketResourceType): MarketResourceState {
    const resource = this.resources.get(resourceType);
    if (!resource) {
      throw new MarketTradeError('That resource is not configured for this market.', 'INVALID_RESOURCE');
    }

    return resource;
  }

  private advanceStock(now: number): boolean {
    let changed = false;

    for (let index = 0; index < DEFAULT_MARKET_RESOURCE_CONFIGS.length; index += 1) {
      const config = DEFAULT_MARKET_RESOURCE_CONFIGS[index]!;
      const resource = this.resources.get(config.resourceType);
      if (!resource) {
        continue;
      }

      const elapsed = now - resource.updatedAt;
      if (elapsed < STOCK_CHANGE_INTERVAL_MS) {
        continue;
      }

      const cycles = Math.min(12, Math.max(1, Math.floor(elapsed / STOCK_CHANGE_INTERVAL_MS)));
      let nextStock = resource.currentStock;
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        const target = Math.max(1, resource.targetStock);
        const marketPressure = (target - nextStock) / target;
        const baseFlow = Math.max(1, Math.round(target * 0.025));
        const tide = Math.round(Math.sin(((now / STOCK_CHANGE_INTERVAL_MS) + cycle) * 0.73 + index * 1.91) * baseFlow);
        const drift = Math.round(baseFlow * marketPressure);
        nextStock = Math.max(0, Math.min(target * 2, nextStock + drift + tide));
      }

      if (nextStock !== resource.currentStock) {
        resource.currentStock = nextStock;
        changed = true;
      }
      resource.updatedAt = now;
    }

    return changed;
  }

  private ensureWallet(actorId: string, actorType: MarketActorType): WalletState {
    const walletKey = this.getWalletKey(actorId, actorType);
    let wallet = this.wallets.get(walletKey);
    if (!wallet) {
      wallet = {
        actorId,
        actorType,
        gold: INITIAL_WALLET_GOLD,
        updatedAt: Date.now(),
      };
      this.wallets.set(walletKey, wallet);
    }

    return wallet;
  }

  private getWalletKey(actorId: string, actorType: MarketActorType) {
    return `${actorType}:${actorId}`;
  }

  private toWalletSnapshot(wallet: WalletState): WalletSnapshot {
    return { ...wallet };
  }

  private recordTransaction(input: Omit<MarketTransaction, 'id' | 'createdAt'>): MarketTransaction {
    const transaction: MarketTransaction = {
      ...input,
      id: `market:${Date.now().toString(36)}:${(++this.transactionSequence).toString(36)}`,
      createdAt: Date.now(),
    };

    this.transactions = [transaction, ...this.transactions].slice(0, MAX_TRANSACTION_HISTORY);
    return { ...transaction };
  }
}

export const marketState = new ResourceMarketState();
marketState.reset();
