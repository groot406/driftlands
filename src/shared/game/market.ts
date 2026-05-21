import type { ResourceType } from '../../core/types/Resource.ts';

export const MARKET_RESOURCE_TYPES = [
  'wood',
  'ore',
  'stone',
  'tools',
  'weapons',
  'fish',
  'meat',
  'bread',
  'beer',
  'wine',
  'water',
  'grain',
  'hops',
  'grapes',
  'water_lily',
  'sand',
  'glass',
  'tea',
  'pottery',
  'spices',
  'silk',
] as const satisfies readonly ResourceType[];

export type MarketResourceType = typeof MARKET_RESOURCE_TYPES[number];
export type MarketActorType = 'PLAYER' | 'AI';
export type MarketTransactionAction = 'BUY' | 'SELL';

export interface MarketResourceConfig {
  resourceType: MarketResourceType;
  basePrice: number;
  targetStock: number;
  initialStock: number;
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
  { resourceType: 'wood', basePrice: 2, targetStock: 120, initialStock: 18, minPrice: 1, maxPrice: 6 },
  { resourceType: 'stone', basePrice: 3, targetStock: 90, initialStock: 10, minPrice: 1, maxPrice: 9 },
  { resourceType: 'fish', basePrice: 3, targetStock: 80, initialStock: 8, minPrice: 1, maxPrice: 9 },
  { resourceType: 'meat', basePrice: 4, targetStock: 70, initialStock: 6, minPrice: 1, maxPrice: 12 },
  { resourceType: 'bread', basePrice: 5, targetStock: 60, initialStock: 5, minPrice: 1, maxPrice: 14 },
  { resourceType: 'grain', basePrice: 2, targetStock: 100, initialStock: 14, minPrice: 1, maxPrice: 6 },
  { resourceType: 'water', basePrice: 1, targetStock: 140, initialStock: 20, minPrice: 1, maxPrice: 4 },
  { resourceType: 'hops', basePrice: 3, targetStock: 55, initialStock: 4, minPrice: 1, maxPrice: 10 },
  { resourceType: 'grapes', basePrice: 4, targetStock: 55, initialStock: 4, minPrice: 1, maxPrice: 12 },
  { resourceType: 'water_lily', basePrice: 4, targetStock: 45, initialStock: 3, minPrice: 1, maxPrice: 12 },
  { resourceType: 'ore', basePrice: 6, targetStock: 50, initialStock: 4, minPrice: 2, maxPrice: 18 },
  { resourceType: 'sand', basePrice: 2, targetStock: 70, initialStock: 6, minPrice: 1, maxPrice: 7 },
  { resourceType: 'glass', basePrice: 8, targetStock: 35, initialStock: 2, minPrice: 3, maxPrice: 24 },
  { resourceType: 'tools', basePrice: 10, targetStock: 30, initialStock: 2, minPrice: 4, maxPrice: 30 },
  { resourceType: 'weapons', basePrice: 14, targetStock: 24, initialStock: 1, minPrice: 6, maxPrice: 42 },
  { resourceType: 'beer', basePrice: 7, targetStock: 40, initialStock: 3, minPrice: 2, maxPrice: 22 },
  { resourceType: 'wine', basePrice: 9, targetStock: 34, initialStock: 2, minPrice: 3, maxPrice: 28 },
  { resourceType: 'tea', basePrice: 11, targetStock: 28, initialStock: 2, minPrice: 4, maxPrice: 34 },
  { resourceType: 'pottery', basePrice: 9, targetStock: 32, initialStock: 2, minPrice: 3, maxPrice: 28 },
  { resourceType: 'spices', basePrice: 13, targetStock: 24, initialStock: 1, minPrice: 5, maxPrice: 40 },
  { resourceType: 'silk', basePrice: 16, targetStock: 20, initialStock: 1, minPrice: 6, maxPrice: 48 },
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
    currentStock: config.initialStock,
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
