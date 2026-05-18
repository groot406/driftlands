import type { ResourceType } from '../../core/types/Resource.ts';

export const MARKET_RESOURCE_TYPES = [
  'wood',
  'stone',
  'food',
  'iron',
  'coal',
  'diamonds',
] as const satisfies readonly ResourceType[];

export type MarketResourceType = typeof MARKET_RESOURCE_TYPES[number];
export type MarketActorType = 'PLAYER' | 'AI';
export type MarketTransactionAction = 'BUY' | 'SELL';

export interface MarketResourceConfig {
  resourceType: MarketResourceType;
  basePrice: number;
  targetStock: number;
  minPrice: number;
  maxPrice: number;
}

export interface MarketResourceState extends MarketResourceConfig {
  currentStock: number;
  updatedAt: number;
}

export interface MarketResourceSnapshot extends MarketResourceState {
  price: number;
  buyPrice: number;
  sellPrice: number;
}

export interface MarketTransaction {
  id: string;
  actorId: string;
  actorType: MarketActorType;
  action: MarketTransactionAction;
  resourceType: MarketResourceType;
  quantity: number;
  pricePerUnit: number;
  totalGold: number;
  createdAt: number;
}

export interface WalletSnapshot {
  actorId: string;
  actorType: MarketActorType;
  gold: number;
  updatedAt: number;
}

export interface MarketOverviewResource {
  /**
   * Buy price alias kept for older consumers. New UI should use buyPrice/sellPrice.
   */
  price: number;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  basePrice: number;
  targetStock: number;
  minPrice: number;
  maxPrice: number;
}

export interface MarketOverviewSnapshot {
  resources: Record<MarketResourceType, MarketOverviewResource>;
  wallet?: WalletSnapshot | null;
  transactions: MarketTransaction[];
}

export const DEFAULT_MARKET_RESOURCE_CONFIGS: readonly MarketResourceConfig[] = [
  { resourceType: 'wood', basePrice: 2, targetStock: 10_000, minPrice: 1, maxPrice: 5 },
  { resourceType: 'stone', basePrice: 3, targetStock: 8_000, minPrice: 1, maxPrice: 8 },
  { resourceType: 'food', basePrice: 4, targetStock: 12_000, minPrice: 1, maxPrice: 10 },
  { resourceType: 'coal', basePrice: 6, targetStock: 5_000, minPrice: 2, maxPrice: 18 },
  { resourceType: 'iron', basePrice: 10, targetStock: 4_000, minPrice: 4, maxPrice: 30 },
  { resourceType: 'diamonds', basePrice: 100, targetStock: 500, minPrice: 40, maxPrice: 300 },
] as const;

export const MARKET_SELL_PRICE_MULTIPLIER = 0.85;

export function isMarketResourceType(value: unknown): value is MarketResourceType {
  return typeof value === 'string' && (MARKET_RESOURCE_TYPES as readonly string[]).includes(value);
}

export function calculateMarketPrice(resource: Pick<MarketResourceState, 'basePrice' | 'currentStock' | 'targetStock' | 'minPrice' | 'maxPrice'>): number {
  if (resource.currentStock <= 0) {
    return resource.maxPrice;
  }

  const scarcityPrice = resource.basePrice * (resource.targetStock / resource.currentStock);
  return Math.max(resource.minPrice, Math.min(Math.round(scarcityPrice), resource.maxPrice));
}

export function calculateMarketBuyPrice(resource: Pick<MarketResourceState, 'basePrice' | 'currentStock' | 'targetStock' | 'minPrice' | 'maxPrice'>): number {
  return calculateMarketPrice(resource);
}

export function calculateMarketSellPrice(resource: Pick<MarketResourceState, 'basePrice' | 'currentStock' | 'targetStock' | 'minPrice' | 'maxPrice'>): number {
  const buyPrice = calculateMarketBuyPrice(resource);
  const spreadPrice = Math.floor(buyPrice * MARKET_SELL_PRICE_MULTIPLIER);
  return Math.max(resource.minPrice, Math.min(spreadPrice, resource.maxPrice));
}

export function createInitialMarketResourceState(config: MarketResourceConfig, now: number): MarketResourceState {
  return {
    ...config,
    currentStock: config.targetStock,
    updatedAt: now,
  };
}

export function toMarketResourceSnapshot(resource: MarketResourceState): MarketResourceSnapshot {
  const buyPrice = calculateMarketBuyPrice(resource);
  return {
    ...resource,
    price: buyPrice,
    buyPrice,
    sellPrice: calculateMarketSellPrice(resource),
  };
}
