import { computed, ref } from 'vue';
import {
  DEFAULT_MARKET_RESOURCE_CONFIGS,
  MARKET_SELL_PRICE_MULTIPLIER,
  type MarketActorType,
  type MarketOverviewSnapshot,
  type MarketResourceType,
  type MarketTransaction,
  type WalletSnapshot,
} from '../shared/game/market.ts';
import { getDriftlandsApiUrl } from '../core/driftlandsApi.ts';

export const marketplaceOpen = ref(false);
export const selectedMarketResourceType = ref<MarketResourceType>('wood');
export const marketLoading = ref(false);
export const marketTrading = ref(false);
export const marketError = ref<string | null>(null);
export const marketVersion = ref(0);

function createEmptyMarketOverview(): MarketOverviewSnapshot {
  const resources = {} as MarketOverviewSnapshot['resources'];
  for (const config of DEFAULT_MARKET_RESOURCE_CONFIGS) {
    resources[config.resourceType] = {
      price: config.basePrice,
      buyPrice: config.basePrice,
      sellPrice: Math.max(config.minPrice, Math.floor(config.basePrice * MARKET_SELL_PRICE_MULTIPLIER)),
      stock: config.targetStock,
      basePrice: config.basePrice,
      targetStock: config.targetStock,
      minPrice: config.minPrice,
      maxPrice: config.maxPrice,
    };
  }

  return {
    resources,
    wallet: null,
    transactions: [],
  };
}

export const marketOverview = ref<MarketOverviewSnapshot>(createEmptyMarketOverview());
export const marketWallet = ref<WalletSnapshot | null>(null);

export const recentMarketTransactions = computed<MarketTransaction[]>(() => marketOverview.value.transactions.slice(0, 8));

export function openMarketplace(resourceType?: MarketResourceType) {
  if (resourceType) {
    selectedMarketResourceType.value = resourceType;
  }
  marketplaceOpen.value = true;
}

export function closeMarketplace() {
  marketplaceOpen.value = false;
}

export function replaceMarketOverview(overview: MarketOverviewSnapshot) {
  marketOverview.value = {
    resources: { ...overview.resources },
    wallet: overview.wallet ? { ...overview.wallet } : null,
    transactions: (overview.transactions ?? []).map((transaction) => ({ ...transaction })),
  };
  if (overview.wallet !== undefined) {
    marketWallet.value = overview.wallet ? { ...overview.wallet } : null;
  }
  marketVersion.value++;
}

export async function fetchMarketOverview(actorId?: string | null, actorType: MarketActorType = 'PLAYER') {
  marketLoading.value = true;
  marketError.value = null;
  try {
    const params = new URLSearchParams();
    if (actorId) {
      params.set('playerId', actorId);
      params.set('actorType', actorType);
    }

    const query = params.toString();
    const response = await fetch(getDriftlandsApiUrl(`/market${query ? `?${query}` : ''}`), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Could not load the market.');
    }

    const body = await response.json() as MarketOverviewSnapshot;
    replaceMarketOverview(body);
    return body;
  } catch (error) {
    marketError.value = error instanceof Error ? error.message : 'Could not load the market.';
    throw error;
  } finally {
    marketLoading.value = false;
  }
}

export async function tradeMarketResource(input: {
  action: 'buy' | 'sell';
  actorId: string;
  actorType?: MarketActorType;
  settlementId: string;
  resourceType: MarketResourceType;
  quantity: number;
}) {
  marketTrading.value = true;
  marketError.value = null;
  try {
    const response = await fetch(getDriftlandsApiUrl(`/market/${input.action}`), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        actorId: input.actorId,
        actorType: input.actorType ?? 'PLAYER',
        settlementId: input.settlementId,
        resourceType: input.resourceType,
        quantity: input.quantity,
      }),
    });

    const body = await response.json() as MarketOverviewSnapshot & { message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? 'The market rejected that trade.');
    }

    replaceMarketOverview(body);
    return body;
  } catch (error) {
    marketError.value = error instanceof Error ? error.message : 'The market rejected that trade.';
    throw error;
  } finally {
    marketTrading.value = false;
  }
}
