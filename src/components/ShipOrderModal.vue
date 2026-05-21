<template>
  <Transition name="ship-modal">
    <div
      v-if="shipOrderPanelOpen"
      class="ship-modal-backdrop fixed inset-0 z-50 overflow-y-auto p-3 text-white sm:p-5"
      @click.self="closeShipOrderPanel"
    >
      <PanelModalShell
        class="ship-modal-shell mx-auto"
        close-aria-label="Close trading ship panel"
        header-icon="tools"
        header-icon-color="blue"
        header-icon-variant="build"
        header-label="Harbor Cargo"
        :header-title="activeOrder?.name ?? 'No ship at anchor'"
        @close="closeShipOrderPanel"
      >
        <template #header-extra>
          <div v-if="activeOrder" class="ship-header-stats">
            <PanelStatCard label="Departs" :value="timeRemainingLabel" />
            <PanelStatCard label="Loaded" :value="`${orderProgress}%`" />
            <PanelStatCard label="Reward" :value="rewardSummary" />
          </div>
        </template>

        <div v-if="activeOrder" class="ship-modal-body">
          <section class="ship-overview">
            <div class="ship-portrait-panel">
              <div class="ship-portrait" :style="shipPortraitStyle" aria-hidden="true"></div>
            </div>

            <div class="ship-card ship-card--origin">
              <p class="ship-card-label">Arrived From</p>
              <h3>{{ activeOrder.origin }}</h3>
              <p>{{ originDescription }}</p>
            </div>

            <div class="ship-card ship-card--cargo">
              <div class="ship-section-head">
                <p class="ship-card-label">Requested Cargo</p>
                <span class="ship-chip">{{ activeOrder.totalFulfilledValue }}/{{ activeOrder.totalRequestedValue }}</span>
              </div>
              <div class="ship-cargo-list">
                <div
                  v-for="resource in activeOrder.requested"
                  :key="resource.type"
                  class="ship-resource-row"
                >
                  <div class="ship-resource-name">
                    <p>{{ resourceLabel(resource.type) }}</p>
                    <span>Stored {{ getStoredAmount(resource.type) }}</span>
                  </div>
                  <div class="ship-resource-progress">
                    <div class="ship-progress">
                      <div class="ship-progress-fill" :style="{ width: `${resourceProgress(resource)}%` }" />
                    </div>
                    <p>{{ fulfilledAmount(resource.type) }}/{{ resource.amount }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="ship-card ship-card--rewards">
              <div class="ship-section-head">
                <p class="ship-card-label">Trade Return</p>
                <span class="ship-chip">{{ rewardGoodsLabel }}</span>
              </div>
              <div class="ship-reward-list">
                <span class="ship-reward-chip">
                  <span aria-hidden="true">⛃</span>
                  {{ activeOrder.rewardPoolGold }} Gold
                </span>
                <span
                  v-for="reward in activeOrder.rewardGoods"
                  :key="reward.type"
                  class="ship-reward-chip"
                >
                  <span aria-hidden="true">{{ resourceIcon(reward.type) }}</span>
                  {{ resourceLabel(reward.type) }} {{ reward.amount }}
                </span>
              </div>
              <p class="ship-card-note">{{ tradeReturnNote }}</p>
            </div>
          </section>

          <section class="ship-loading">
            <div class="ship-card ship-card--load">
              <div class="ship-section-head">
                <p class="ship-card-label">Load Cargo</p>
                <span class="ship-chip">{{ selectedCargoTotal }} selected</span>
              </div>
              <p v-if="!canLoad" class="ship-alert">Only the settlement that owns this Harbor can load this ship.</p>
              <div v-else class="ship-load-list">
                <article
                  v-for="resource in activeOrder.requested"
                  :key="`input:${resource.type}`"
                  class="ship-load-row"
                  :class="{ 'ship-load-row--empty': getLoadLimit(resource.type as ShipOrderResourceType) <= 0 }"
                >
                  <div class="ship-load-copy">
                    <p>{{ resourceLabel(resource.type) }}</p>
                    <span>{{ remainingAmount(resource.type as ShipOrderResourceType) }} needed / {{ getStoredAmount(resource.type) }} stored</span>
                  </div>
                  <div class="ship-stepper">
                    <strong>{{ getSelectedAmount(resource.type as ShipOrderResourceType) }}</strong>
                    <button
                      type="button"
                      :aria-label="`Add 1 ${resourceLabel(resource.type)} to cargo selection`"
                      :disabled="!canAddCargo(resource.type as ShipOrderResourceType, 1)"
                      @click="addCargo(resource.type as ShipOrderResourceType, 1)"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      :aria-label="`Add 5 ${resourceLabel(resource.type)} to cargo selection`"
                      :disabled="!canAddCargo(resource.type as ShipOrderResourceType, 5)"
                      @click="addCargo(resource.type as ShipOrderResourceType, 5)"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      :aria-label="`Add 10 ${resourceLabel(resource.type)} to cargo selection`"
                      :disabled="!canAddCargo(resource.type as ShipOrderResourceType, 10)"
                      @click="addCargo(resource.type as ShipOrderResourceType, 10)"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      :aria-label="`Select maximum ${resourceLabel(resource.type)} cargo`"
                      :disabled="getLoadLimit(resource.type as ShipOrderResourceType) <= 0"
                      @click="setCargoToMax(resource.type as ShipOrderResourceType)"
                    >
                      Max
                    </button>
                  </div>
                </article>
                <button
                  class="ship-submit"
                  type="button"
                  :disabled="!canSubmit"
                  @click="submitCargo"
                >
                  Load Cargo
                </button>
              </div>
            </div>

            <aside class="ship-card ship-card--loaded">
              <div class="ship-section-head">
                <p class="ship-card-label">Loaded Cargo</p>
                <span class="ship-chip">{{ orderProgress }}%</span>
              </div>
              <div class="ship-leader-list">
                <article
                  v-for="resource in activeOrder.requested"
                  :key="`loaded:${resource.type}`"
                  class="ship-leader-row"
                >
                  <div class="ship-leader-copy">
                    <p>{{ resourceLabel(resource.type) }}</p>
                    <span>{{ fulfilledAmount(resource.type) }} / {{ resource.amount }}</span>
                  </div>
                  <span class="ship-chip">{{ resourceProgress(resource) }}%</span>
                </article>
              </div>
            </aside>
          </section>
        </div>

        <div v-else class="ship-empty-state">
          <div class="ship-portrait-panel">
            <div class="ship-portrait" :style="shipPortraitStyle" aria-hidden="true"></div>
          </div>
          <div>
            <p class="ship-card-label">Quiet Harbor</p>
            <p>The next ship will appear here once a Harbor has brought trade to the frontier.</p>
          </div>
        </div>
      </PanelModalShell>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onUnmounted, type CSSProperties } from 'vue';
import type { ResourceAmount, ResourceType } from '../core/types/Resource.ts';
import type { ShipOrderResourceType } from '../shared/game/shipOrders.ts';
import { activeShipOrder, closeShipOrderPanel, shipOrderPanelOpen, submitShipOrderLoad } from '../store/shipOrderStore.ts';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { getSettlementResourceInventory, resourceVersion } from '../store/resourceStore.ts';
import { getInventoryEntryDefinition } from '../shared/game/inventoryPresentation.ts';
import PanelModalShell from './ui/PanelModalShell.vue';
import PanelStatCard from './ui/PanelStatCard.vue';
import shipPortraitAtlasUrl from '../assets/ui/ships/trading-ship-portraits-atlas.png';

const now = ref(Date.now());
const cargoInputs = reactive<Partial<Record<ShipOrderResourceType, number>>>({});
let timer: number | null = null;

const activeOrder = activeShipOrder;

const canLoad = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return !!settlementId && activeOrder.value?.settlementId === settlementId;
});

const playerInventory = computed(() => {
  resourceVersion.value;
  return currentPlayerSettlementId.value
    ? getSettlementResourceInventory(currentPlayerSettlementId.value)
    : {};
});

const timeRemainingLabel = computed(() => activeOrder.value
  ? formatTime(Math.max(0, activeOrder.value.departsAt - now.value))
  : '-');

const orderProgress = computed(() => {
  const order = activeOrder.value;
  if (!order || order.totalRequestedValue <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((order.totalFulfilledValue / order.totalRequestedValue) * 100));
});

const selectedCargoTotal = computed(() => (
  Object.values(cargoInputs).reduce((sum, amount) => sum + Math.max(0, Math.floor(amount ?? 0)), 0)
));

const rewardSummary = computed(() => {
  const order = activeOrder.value;
  if (!order) {
    return '-';
  }

  const primaryGood = order.rewardGoods[0];
  return primaryGood
    ? `${order.rewardPoolGold}g + ${resourceLabel(primaryGood.type)}`
    : `${order.rewardPoolGold} gold`;
});

const rewardGoodsLabel = computed(() => {
  const goods = activeOrder.value?.rewardGoods ?? [];
  if (!goods.length) {
    return 'Gold only';
  }

  return goods.map((reward) => resourceLabel(reward.type)).join(' + ');
});

const originDescription = computed(() => (
  activeOrder.value?.originDescription
  ?? 'A visiting merchant crew brings imports from routes beyond the colony map.'
));

const tradeReturnNote = computed(() => {
  const goods = activeOrder.value?.rewardGoods ?? [];
  if (!goods.length) {
    return 'Gold goes straight to the colony wallet when the ship departs.';
  }

  return `This route is known for ${rewardGoodsLabel.value.toLowerCase()}; Shops can sell these imports for settler happiness.`;
});

const shipPortraitIndex = computed(() => {
  const id = activeOrder.value?.id ?? activeOrder.value?.name ?? 'quiet-harbor';
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0)) % 4;
  }
  return hash;
});

const shipPortraitStyle = computed<CSSProperties>(() => ({
  backgroundImage: `url(${shipPortraitAtlasUrl})`,
  backgroundPosition: `${shipPortraitIndex.value === 0 ? 0 : (shipPortraitIndex.value / 3) * 100}% center`,
}));

const canSubmit = computed(() => {
  if (!activeOrder.value || !currentPlayerSettlementId.value || !canLoad.value) {
    return false;
  }

  return activeOrder.value.requested.some((resource) => getSelectedAmount(resource.type as ShipOrderResourceType) > 0);
});

function resourceLabel(type: ResourceType) {
  return getInventoryEntryDefinition(type).label;
}

function resourceIcon(type: ResourceType) {
  return getInventoryEntryDefinition(type).icon;
}

function getStoredAmount(type: ResourceType) {
  return Math.floor(playerInventory.value[type] ?? 0);
}

function fulfilledAmount(type: ResourceType) {
  return Math.floor(activeOrder.value?.fulfilled[type as ShipOrderResourceType] ?? 0);
}

function remainingAmount(type: ShipOrderResourceType) {
  const requested = activeOrder.value?.requested.find((resource) => resource.type === type)?.amount ?? 0;
  return Math.max(0, requested - fulfilledAmount(type));
}

function getLoadLimit(type: ShipOrderResourceType) {
  return Math.min(getStoredAmount(type), remainingAmount(type));
}

function getSelectedAmount(type: ShipOrderResourceType) {
  return Math.max(0, Math.floor(cargoInputs[type] ?? 0));
}

function canAddCargo(type: ShipOrderResourceType, amount: number) {
  return getSelectedAmount(type) < getLoadLimit(type) && amount > 0;
}

function addCargo(type: ShipOrderResourceType, amount: number) {
  const current = getSelectedAmount(type);
  cargoInputs[type] = Math.min(getLoadLimit(type), current + amount);
}

function setCargoToMax(type: ShipOrderResourceType) {
  cargoInputs[type] = getLoadLimit(type);
}

function resourceProgress(resource: ResourceAmount) {
  if (resource.amount <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((fulfilledAmount(resource.type) / resource.amount) * 100));
}

function formatTime(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function submitCargo() {
  const settlementId = currentPlayerSettlementId.value;
  const order = activeOrder.value;
  if (!settlementId || !order || !canSubmit.value) {
    return;
  }

  const resources: Partial<Record<ShipOrderResourceType, number>> = {};
  for (const requested of order.requested) {
    const type = requested.type as ShipOrderResourceType;
    const amount = Math.min(
      getSelectedAmount(type),
      getStoredAmount(type),
      remainingAmount(type),
    );
    if (amount > 0) {
      resources[type] = amount;
      cargoInputs[type] = 0;
    }
  }

  submitShipOrderLoad(order.id, settlementId, resources);
}

watch(activeOrder, (order) => {
  for (const key of Object.keys(cargoInputs)) {
    delete cargoInputs[key as ShipOrderResourceType];
  }

  for (const resource of order?.requested ?? []) {
    cargoInputs[resource.type as ShipOrderResourceType] = 0;
  }
}, { immediate: true });

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer != null) {
    window.clearInterval(timer);
  }
});
</script>

<style scoped>
.ship-modal-backdrop {
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 46%, rgba(75, 54, 107, 0.16), transparent 32rem),
    rgba(2, 7, 10, 0.72);
  backdrop-filter: blur(5px) saturate(0.88) brightness(0.82);
  -webkit-backdrop-filter: blur(5px) saturate(0.88) brightness(0.82);
}

.ship-modal-shell {
  --panel-modal-border-width: 22px;
  --panel-modal-border-image-width: 38px;
  --panel-header-height: 5.8rem;
  --panel-header-padding: 1.05rem 4.25rem 0.78rem 6.35rem;
  width: min(78rem, calc(100vw - 2.2rem));
  height: min(45rem, calc(100vh - 3rem));
  display: flex;
  flex-direction: column;
}

.ship-header-stats {
  flex: 0 0 auto;
  width: min(26rem, 42vw);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  margin-left: auto;
  padding-right: 0.5rem;
}

.ship-modal-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(18rem, 0.66fr) minmax(0, 1.34fr);
  gap: 0.82rem;
  overflow: hidden;
  padding: 0.68rem 0.74rem 0.78rem;
}

.ship-overview,
.ship-loading {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
}

.ship-overview {
  overflow-y: auto;
  padding-right: 0.28rem;
  scrollbar-color: rgba(132, 94, 44, 0.38) transparent;
}

.ship-overview > .ship-card {
  flex: 0 0 auto;
}

.ship-loading {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.ship-portrait-panel {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 0.18rem 0 0.08rem;
}

.ship-portrait {
  aspect-ratio: 1 / 1;
  width: min(100%, 13.5rem, 19vh);
  min-height: 0;
  background-repeat: no-repeat;
  background-size: 400% 100%;
  image-rendering: auto;
}

.ship-card {
  min-height: 0;
  padding: 0.82rem 0.9rem;
  border: 1px solid rgba(132, 94, 44, 0.22);
  background:
    radial-gradient(circle at 18% 5%, rgba(255, 226, 161, 0.04), transparent 11rem),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, rgba(18, 20, 20, 0.42), rgba(9, 10, 11, 0.54));
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.34),
    0 1px 0 rgba(255, 219, 146, 0.04);
}

.ship-card--load {
  overflow: hidden;
}

.ship-card--origin {
  padding: 0.72rem 0.82rem;
}

.ship-card--origin h3 {
  margin: 0.28rem 0 0.22rem;
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.08rem;
  font-weight: 700;
  line-height: 1.05;
  text-shadow: 0 1px 0 #080706;
}

.ship-card--origin p:not(.ship-card-label) {
  margin: 0;
  color: rgba(231, 214, 173, 0.8);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.8rem;
  line-height: 1.32;
}

.ship-card--load {
  display: flex;
  flex-direction: column;
}

.ship-section-head,
.ship-resource-row,
.ship-leader-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.ship-card-label {
  margin: 0;
  color: #c99a4b;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1.15;
  text-transform: uppercase;
  text-shadow: 0 1px 0 #070706;
}

.ship-chip {
  min-height: 1.55rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.12rem 0.46rem;
  border: 6px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 6px stretch;
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 0 #080706;
  white-space: nowrap;
}

.ship-cargo-list,
.ship-load-list,
.ship-leader-list {
  display: grid;
  gap: 0.44rem;
  margin-top: 0.58rem;
}

.ship-reward-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
  margin-top: 0.68rem;
}

.ship-reward-chip {
  min-height: 1.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  padding: 0.18rem 0.54rem;
  border: 1px solid rgba(151, 104, 45, 0.34);
  background:
    linear-gradient(180deg, rgba(43, 34, 23, 0.68), rgba(12, 12, 12, 0.56));
  color: #f5e3b6;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
}

.ship-card-note {
  margin: 0.58rem 0 0;
  color: rgba(231, 214, 173, 0.78);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.82rem;
  line-height: 1.3;
}

.ship-load-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.28rem;
  scrollbar-color: rgba(132, 94, 44, 0.38) transparent;
}

.ship-resource-row,
.ship-load-row,
.ship-leader-row {
  border: 1px solid rgba(132, 94, 44, 0.18);
  background:
    linear-gradient(90deg, rgba(65, 45, 26, 0.12), rgba(15, 17, 18, 0.24)),
    rgba(13, 15, 16, 0.4);
}

.ship-resource-row {
  padding: 0.46rem 0.58rem;
}

.ship-resource-name,
.ship-load-copy,
.ship-leader-copy {
  min-width: 0;
}

.ship-resource-name p,
.ship-load-copy p,
.ship-leader-copy p {
  margin: 0;
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.96rem;
  font-weight: 700;
  line-height: 1.08;
  text-shadow: 0 1px 0 #080706;
}

.ship-resource-name span,
.ship-load-copy span,
.ship-leader-copy span,
.ship-empty,
.ship-alert,
.ship-empty-state p {
  color: rgba(226, 211, 178, 0.82);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.78rem;
  line-height: 1.35;
}

.ship-resource-progress {
  width: min(9.5rem, 42%);
}

.ship-resource-progress p {
  margin: 0.28rem 0 0;
  color: #d7c8a7;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.72rem;
  text-align: right;
}

.ship-progress {
  height: 0.42rem;
  overflow: hidden;
  border: 1px solid rgba(132, 94, 44, 0.36);
  background: rgba(3, 4, 5, 0.64);
}

.ship-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a97125, #e2ad3d);
  box-shadow: 0 0 10px rgba(226, 173, 61, 0.28);
}

.ship-load-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.82rem;
  align-items: center;
  padding: 0.62rem 0.68rem;
}

.ship-load-row--empty {
  opacity: 0.62;
}

.ship-stepper {
  display: grid;
  grid-template-columns: 2.6rem repeat(4, 2.55rem);
  gap: 0.28rem;
  align-items: center;
}

.ship-stepper strong {
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.05rem;
  line-height: 1;
  text-align: center;
}

.ship-stepper button,
.ship-submit {
  min-height: 2rem;
  border: 6px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 6px stretch;
  background: transparent;
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 0 #080706;
}

.ship-stepper button:not(:disabled):hover,
.ship-submit:not(:disabled):hover {
  filter: brightness(1.13);
  transform: translateY(-1px);
}

.ship-stepper button:disabled,
.ship-submit:disabled {
  color: #a99a80;
  cursor: not-allowed;
  filter: saturate(0.55);
  opacity: 0.58;
}

.ship-submit {
  flex: 0 0 auto;
  width: 100%;
  min-height: 3.15rem;
  margin-top: 0.78rem;
  font-size: 1.04rem;
}

.ship-alert {
  margin: 0.7rem 0 0;
  color: #f3c970;
  font-weight: 700;
}

.ship-card--loaded {
  max-height: 11.5rem;
  overflow: hidden;
}

.ship-leader-list {
  max-height: 7.5rem;
  overflow-y: auto;
  padding-right: 0.28rem;
  scrollbar-color: rgba(132, 94, 44, 0.38) transparent;
}

.ship-leader-row {
  padding: 0.52rem 0.58rem;
}

.ship-leader-row--own {
  border-color: rgba(143, 216, 121, 0.34);
  background:
    linear-gradient(90deg, rgba(56, 94, 39, 0.2), rgba(15, 17, 18, 0.24)),
    rgba(13, 15, 16, 0.48);
}

.ship-leader-copy p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ship-empty {
  margin: 0.7rem 0 0;
}

.ship-empty-state {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  padding: 1rem;
}

.ship-empty-state p {
  max-width: 30rem;
  margin: 0.45rem 0 0;
  color: #e2d3b2;
  font-size: 1rem;
}

.ship-modal-enter-active,
.ship-modal-leave-active {
  transition: opacity 0.18s ease;
}

.ship-modal-enter-from,
.ship-modal-leave-to {
  opacity: 0;
}

@media (max-width: 980px) {
  .ship-modal-shell {
    height: min(48rem, calc(100vh - 2rem));
  }

  .ship-header-stats {
    display: none;
  }

  .ship-modal-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .ship-overview {
    display: grid;
    grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 0.58fr);
    overflow: visible;
    padding-right: 0;
  }

  .ship-card--loaded {
    max-height: none;
  }
}

@media (min-width: 981px) and (max-height: 820px) {
  .ship-modal-shell {
    --panel-header-height: 5.3rem;
    --panel-header-padding: 0.9rem 4.25rem 0.62rem 6.35rem;
    height: min(45rem, calc(100vh - 2rem));
  }

  .ship-modal-body {
    gap: 0.7rem;
    padding: 0.52rem 0.64rem 0.54rem;
  }

  .ship-portrait {
    width: min(100%, 12rem, 17vh);
  }

  .ship-card {
    padding: 0.68rem 0.78rem;
  }

  .ship-card-note {
    margin-top: 0.4rem;
    font-size: 0.72rem;
    line-height: 1.2;
  }
}

@media (max-width: 640px) {
  .ship-modal-backdrop {
    padding: 0;
  }

  .ship-modal-shell {
    width: 100vw;
    height: 100dvh;
  }

  .ship-modal-body,
  .ship-overview {
    grid-template-columns: 1fr;
  }

  .ship-portrait {
    width: min(100%, 13rem);
  }

  .ship-load-row {
    grid-template-columns: 1fr;
  }

  .ship-stepper {
    grid-template-columns: 2.5rem repeat(4, minmax(2.45rem, 1fr));
  }

  .ship-empty-state {
    grid-template-columns: 1fr;
  }
}
</style>
