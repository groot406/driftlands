<template>
  <Transition name="smooth-modal" appear>
    <div v-if="marketplaceOpen" class="market-backdrop smooth-modal-backdrop" @click.self="close">
      <NineSlicePanel type="small">
        <section class="market-panel smooth-modal-surface" @click.stop>
          <header class="market-header">
            <div>
              <p class="market-kicker">Global Market</p>
              <h2 class="market-title">Resource Exchange</h2>
            </div>
            <div class="market-wallet" title="Gold">
              <span aria-hidden="true">🪙</span>
              <strong>{{ formatAmount(walletGold) }}</strong>
            </div>
            <button class="market-close" type="button" title="Close" @click="close">✕</button>
          </header>

          <div class="market-mode" role="tablist" aria-label="Market action">
            <button type="button" :class="{ active: mode === 'buy' }" @click="mode = 'buy'">Buy</button>
            <button type="button" :class="{ active: mode === 'sell' }" @click="mode = 'sell'">Sell</button>
          </div>

          <div class="market-body">
            <aside class="market-list" aria-label="Tradable resources">
              <button
                v-for="resource in marketRows"
                :key="resource.type"
                class="market-row"
                :class="{ active: resource.type === selectedMarketResourceType }"
                type="button"
                @click="selectResource(resource.type)"
              >
                <span class="market-row-icon" aria-hidden="true">{{ resource.icon }}</span>
                <span class="market-row-main">
                  <span class="market-row-name">{{ resource.label }}</span>
                  <span class="market-row-stock">{{ formatAmount(resource.stock) }} stock</span>
                </span>
                <span class="market-row-price">
                  <span class="market-price-line market-price-line--buy">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 3v10" />
                      <path d="M4 9l4 4 4-4" />
                    </svg>
                    {{ resource.buyPrice }}
                  </span>
                  <span class="market-price-line market-price-line--sell">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 13V3" />
                      <path d="M4 7l4-4 4 4" />
                    </svg>
                    {{ resource.sellPrice }}
                  </span>
                </span>
              </button>
            </aside>

            <section class="market-trade">
              <div class="market-trade-head">
                <span class="market-selected-icon" aria-hidden="true">{{ selectedResource.icon }}</span>
                <div>
                  <h3>{{ selectedResource.label }}</h3>
                  <p>{{ selectedMarket.stockLabel }} · {{ selectedMarket.priceLabel }}</p>
                </div>
              </div>

              <div class="market-stat-grid">
                <div class="market-stat">
                  <span>Stored</span>
                  <strong>{{ formatAmount(playerStock) }}</strong>
                </div>
                <div class="market-stat">
                  <span>{{ mode === 'buy' ? 'Buy Price' : 'Sell Price' }}</span>
                  <strong
                    class="market-unit-price"
                    :class="mode === 'buy' ? 'market-unit-price--buy' : 'market-unit-price--sell'"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path v-if="mode === 'buy'" d="M8 3v10" />
                      <path v-if="mode === 'buy'" d="M4 9l4 4 4-4" />
                      <path v-if="mode === 'sell'" d="M8 13V3" />
                      <path v-if="mode === 'sell'" d="M4 7l4-4 4 4" />
                    </svg>
                    {{ selectedUnitPrice }}
                  </strong>
                </div>
                <div class="market-stat">
                  <span>Total</span>
                  <strong>{{ formatAmount(totalGold) }}</strong>
                </div>
              </div>

              <label class="market-quantity">
                <span>Quantity</span>
                <input
                  v-model.number="quantity"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :max="mode === 'buy' ? selectedMarket.stock : playerStock"
                />
              </label>

              <div class="market-presets">
                <button v-for="value in quantityPresets" :key="value" type="button" @click="quantity = value">{{ value }}</button>
                <button type="button" @click="setMaxQuantity">Max</button>
              </div>

              <p v-if="marketError" class="market-error">{{ marketError }}</p>
              <p v-else-if="disabledReason" class="market-hint">{{ disabledReason }}</p>

              <button
                class="market-submit"
                type="button"
                :disabled="!canSubmit"
                @click="submitTrade"
              >
                {{ submitLabel }}
              </button>
            </section>
          </div>

          <section class="market-history">
            <h3>Recent Trades</h3>
            <div v-if="recentMarketTransactions.length" class="market-history-list">
              <div v-for="transaction in recentMarketTransactions" :key="transaction.id" class="market-history-row">
                <span>{{ transaction.action === 'BUY' ? 'Bought' : 'Sold' }} {{ formatAmount(transaction.quantity) }} {{ resourceLabel(transaction.resourceType) }}</span>
                <strong>{{ formatAmount(transaction.totalGold) }}g</strong>
              </div>
            </div>
            <p v-else class="market-empty">No trades yet.</p>
          </section>
        </section>
      </NineSlicePanel>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import NineSlicePanel from './ui/NineSlicePanel.vue';
import {
  MARKET_RESOURCE_TYPES,
  type MarketResourceType,
} from '../shared/game/market.ts';
import { getResourceDefinition } from '../shared/game/resourceDefinitions.ts';
import {
  closeMarketplace,
  fetchMarketOverview,
  marketplaceOpen,
  marketError,
  marketOverview,
  marketTrading,
  marketWallet,
  recentMarketTransactions,
  selectedMarketResourceType,
  tradeMarketResource,
} from '../store/marketStore.ts';
import { getSettlementResourceInventory, resourceVersion } from '../store/resourceStore.ts';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { currentPlayerId } from '../core/socket.ts';

const mode = ref<'buy' | 'sell'>('buy');
const quantity = ref(1);
const quantityPresets = [1, 5, 10];

const playerInventory = computed(() => {
  resourceVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? getSettlementResourceInventory(settlementId) : {};
});

const walletGold = computed(() => marketWallet.value?.gold ?? 0);
const hasSellableInventory = computed(() => MARKET_RESOURCE_TYPES.some((type) => Math.floor(playerInventory.value[type] ?? 0) > 0));

const marketRows = computed(() => MARKET_RESOURCE_TYPES.map((type) => {
  const resource = getResourceDefinition(type);
  const marketResource = marketOverview.value.resources[type];
  return {
    type,
    label: resource.label,
    icon: resource.icon,
    buyPrice: marketResource.buyPrice ?? marketResource.price,
    sellPrice: marketResource.sellPrice ?? marketResource.price,
    stock: marketResource.stock,
  };
}));

const selectedResource = computed(() => getResourceDefinition(selectedMarketResourceType.value));
const selectedMarket = computed(() => {
  const marketResource = marketOverview.value.resources[selectedMarketResourceType.value];
  const buyPrice = marketResource.buyPrice ?? marketResource.price;
  const sellPrice = marketResource.sellPrice ?? marketResource.price;
  return {
    ...marketResource,
    buyPrice,
    sellPrice,
    stockLabel: `${formatAmount(marketResource.stock)} market stock`,
    priceLabel: `Buy ${formatAmount(buyPrice)} Gold · Sell ${formatAmount(sellPrice)} Gold`,
  };
});
const playerStock = computed(() => Math.floor(playerInventory.value[selectedMarketResourceType.value] ?? 0));
const normalizedQuantity = computed(() => Math.max(1, Math.floor(Number(quantity.value) || 0)));
const selectedUnitPrice = computed(() => mode.value === 'buy' ? selectedMarket.value.buyPrice : selectedMarket.value.sellPrice);
const totalGold = computed(() => selectedUnitPrice.value * normalizedQuantity.value);
const canSubmit = computed(() => {
  if (marketTrading.value || !currentPlayerId.value || !currentPlayerSettlementId.value) {
    return false;
  }

  if (mode.value === 'buy') {
    return selectedMarket.value.stock >= normalizedQuantity.value && walletGold.value >= totalGold.value;
  }

  return playerStock.value >= normalizedQuantity.value;
});
const disabledReason = computed(() => {
  if (marketTrading.value || canSubmit.value) {
    return null;
  }

  if (!currentPlayerId.value || !currentPlayerSettlementId.value) {
    return 'Start or select a settlement before trading.';
  }

  if (mode.value === 'buy') {
    if (selectedMarket.value.stock < normalizedQuantity.value) {
      return 'The market does not have enough stock.';
    }
    if (walletGold.value < totalGold.value) {
      return hasSellableInventory.value
        ? 'Sell surplus resources to earn Gold before buying.'
        : 'You need Gold before buying from the market.';
    }
  }

  if (playerStock.value < normalizedQuantity.value) {
    return `You do not have enough ${selectedResource.value.label.toLowerCase()} to sell.`;
  }

  return null;
});
const submitLabel = computed(() => {
  const action = mode.value === 'buy' ? 'Buy' : 'Sell';
  return `${action} for ${formatAmount(totalGold.value)} Gold`;
});

function formatAmount(value: number) {
  return Math.floor(value).toLocaleString();
}

function resourceLabel(resourceType: MarketResourceType) {
  return getResourceDefinition(resourceType).label.toLowerCase();
}

function selectResource(resourceType: MarketResourceType) {
  selectedMarketResourceType.value = resourceType;
}

function setMaxQuantity() {
  if (mode.value === 'buy') {
    const byGold = selectedUnitPrice.value > 0 ? Math.floor(walletGold.value / selectedUnitPrice.value) : 0;
    quantity.value = Math.max(1, Math.min(selectedMarket.value.stock, byGold));
    return;
  }

  quantity.value = Math.max(1, playerStock.value);
}

async function submitTrade() {
  const actorId = currentPlayerId.value;
  const settlementId = currentPlayerSettlementId.value;
  if (!actorId || !settlementId || !canSubmit.value) {
    return;
  }

  try {
    await tradeMarketResource({
      action: mode.value,
      actorId,
      settlementId,
      resourceType: selectedMarketResourceType.value,
      quantity: normalizedQuantity.value,
    });
  } catch {
  }
}

function close() {
  closeMarketplace();
}

function refreshMarket() {
  if (!marketplaceOpen.value) {
    return;
  }

  void fetchMarketOverview(currentPlayerId.value).catch(() => {});
}

function preferSellModeWhenStartingPoor() {
  if (marketplaceOpen.value && walletGold.value <= 0 && hasSellableInventory.value) {
    mode.value = 'sell';
  }
}

onMounted(refreshMarket);
watch([marketplaceOpen, currentPlayerId], refreshMarket);
watch(marketplaceOpen, preferSellModeWhenStartingPoor);
watch(quantity, () => {
  quantity.value = normalizedQuantity.value;
});
</script>

<style scoped>
.market-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: clamp(0.75rem, 2vw, 1.25rem);
  background: rgba(5, 7, 8, 0.56);
  pointer-events: auto;
}

.market-panel {
  width: min(58rem, calc(100vw - 1.5rem));
  max-height: min(46rem, calc(100vh - 1.5rem));
  overflow: auto;
  padding: 1rem;
  color: #f7ead0;
  font-family: 'Trebuchet MS', system-ui, sans-serif;
}

.market-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.market-kicker {
  margin: 0 0 0.16rem;
  color: #d5bd7f;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.market-title {
  margin: 0;
  font-size: clamp(1.24rem, 2.2vw, 1.76rem);
  line-height: 1.08;
}

.market-wallet {
  min-width: 7rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border-radius: 0.38rem;
  padding: 0.46rem 0.7rem;
  background: rgba(38, 27, 15, 0.82);
  box-shadow: inset 0 0 0 1px rgba(226, 190, 112, 0.22);
}

.market-close {
  width: 2.15rem;
  height: 2.15rem;
  border: 0;
  border-radius: 0.36rem;
  background: rgba(23, 14, 10, 0.88);
  color: #f7ead0;
  cursor: pointer;
}

.market-mode {
  display: inline-flex;
  gap: 0.22rem;
  margin-bottom: 0.75rem;
  padding: 0.2rem;
  border-radius: 0.42rem;
  background: rgba(20, 16, 12, 0.72);
}

.market-mode button,
.market-presets button {
  border: 0;
  border-radius: 0.32rem;
  padding: 0.38rem 0.72rem;
  background: rgba(226, 190, 112, 0.13);
  color: #f6e8c7;
  font-weight: 800;
  cursor: pointer;
}

.market-mode button.active {
  background: #d6a64e;
  color: #1d130b;
}

.market-body {
  display: grid;
  grid-template-columns: minmax(15rem, 0.9fr) minmax(0, 1.2fr);
  gap: 0.9rem;
}

.market-list {
  display: grid;
  gap: 0.42rem;
  align-content: start;
}

.market-row {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-height: 3.2rem;
  border: 1px solid rgba(231, 199, 132, 0.18);
  border-radius: 0.44rem;
  padding: 0.42rem 0.58rem;
  background: rgba(22, 17, 13, 0.66);
  color: #f9ecd0;
  text-align: left;
  cursor: pointer;
}

.market-row.active {
  border-color: rgba(239, 196, 103, 0.72);
  background: rgba(74, 50, 24, 0.72);
}

.market-row-icon,
.market-selected-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.38rem;
  background: rgba(0, 0, 0, 0.28);
}

.market-row-main {
  display: grid;
  min-width: 0;
}

.market-row-name,
.market-row-price {
  font-weight: 900;
}

.market-row-price {
  display: grid;
  justify-items: end;
  gap: 0.08rem;
  font-size: 0.78rem;
  line-height: 1.08;
}

.market-price-line,
.market-unit-price {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.2rem;
}

.market-price-line svg,
.market-unit-price svg {
  width: 0.84rem;
  height: 0.84rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.market-price-line--buy,
.market-unit-price--buy {
  color: #ff9b8f;
}

.market-price-line--sell,
.market-unit-price--sell {
  color: #86efac;
}

.market-row-stock {
  color: rgba(232, 214, 178, 0.72);
  font-size: 0.78rem;
}

.market-trade,
.market-history {
  border: 1px solid rgba(231, 199, 132, 0.18);
  border-radius: 0.5rem;
  background: rgba(18, 13, 10, 0.64);
  padding: 0.8rem;
}

.market-trade-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.market-trade-head h3,
.market-history h3 {
  margin: 0;
  font-size: 1rem;
}

.market-trade-head p {
  margin: 0.12rem 0 0;
  color: rgba(232, 214, 178, 0.72);
  font-size: 0.84rem;
}

.market-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.market-stat {
  display: grid;
  gap: 0.18rem;
  border-radius: 0.42rem;
  padding: 0.52rem;
  background: rgba(0, 0, 0, 0.22);
}

.market-stat span,
.market-quantity span {
  color: rgba(232, 214, 178, 0.68);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.market-stat strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.market-quantity {
  display: grid;
  gap: 0.32rem;
}

.market-quantity input {
  width: 100%;
  border: 1px solid rgba(231, 199, 132, 0.28);
  border-radius: 0.38rem;
  padding: 0.56rem 0.62rem;
  background: rgba(0, 0, 0, 0.34);
  color: #fff5dc;
  font: inherit;
  font-weight: 900;
}

.market-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.38rem;
  margin: 0.62rem 0 0.75rem;
}

.market-submit {
  width: 100%;
  min-height: 2.8rem;
  border: 0;
  border-radius: 0.44rem;
  background: linear-gradient(180deg, #e8b958, #b87b2a);
  color: #1f1309;
  font-weight: 950;
  cursor: pointer;
}

.market-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.market-error {
  margin: 0 0 0.62rem;
  color: #ffb1a3;
  font-weight: 800;
}

.market-hint {
  margin: 0 0 0.62rem;
  color: rgba(232, 214, 178, 0.78);
  font-weight: 800;
}

.market-history {
  margin-top: 0.9rem;
}

.market-history-list {
  display: grid;
  gap: 0.32rem;
  margin-top: 0.5rem;
}

.market-history-row {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  border-radius: 0.34rem;
  padding: 0.42rem 0.5rem;
  background: rgba(0, 0, 0, 0.18);
}

.market-empty {
  margin: 0.45rem 0 0;
  color: rgba(232, 214, 178, 0.72);
}

@media (max-width: 720px) {
  .market-body {
    grid-template-columns: 1fr;
  }

  .market-panel {
    max-height: calc(100vh - 1rem);
    padding: 0.75rem;
  }

  .market-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .market-wallet {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  .market-close {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
