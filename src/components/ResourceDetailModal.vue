<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen && activeResource" class="resource-detail-backdrop smooth-modal-backdrop" @click.self="close">
      <PanelModalShell
        class="resource-detail-panel"
        close-aria-label="Close resource details"
        :header-label="activeResource.kindLabel"
        :header-title="activeResource.label"
        header-icon="★"
        header-icon-variant="star"
        header-icon-color="gold"
        @close="close"
      >
        <aside class="resource-detail-left-rail">
          <PanelPortraitFrame class="resource-detail-icon-frame" aspect-ratio="1 / 1.02" glow="gold" aria-hidden="true">
            <img v-if="activeResource.iconUrl" class="resource-detail-hero-image" :src="activeResource.iconUrl" alt="" />
            <span v-else class="resource-detail-hero-icon">{{ activeResource.icon }}</span>
          </PanelPortraitFrame>
          <PanelIconBanner class="resource-detail-badge" icon="★" color="gold" size="badge" />
          <blockquote class="resource-detail-paper-note">
            {{ resourceNote }}
          </blockquote>
          <div class="resource-detail-mini-ledger">
            <span>Stored</span>
            <strong>{{ activeResource.stock }}</strong>
            <span>Net</span>
            <strong :class="activeResource.netClass">{{ formatSigned(activeResource.net) }}/min</strong>
          </div>
        </aside>

        <main class="resource-detail-main">
          <section class="resource-detail-section resource-detail-ledger">
            <div class="resource-detail-stat-grid">
              <div class="resource-detail-card">
                <p class="resource-detail-label">In Storage</p>
                <p class="resource-detail-value">{{ activeResource.stock }}</p>
              </div>
              <div class="resource-detail-card">
                <p class="resource-detail-label">Active Production</p>
                <p class="resource-detail-value">+{{ formatAmount(activeResource.produced) }}/min</p>
              </div>
              <div class="resource-detail-card">
                <p class="resource-detail-label">Demand</p>
                <p class="resource-detail-value">-{{ formatAmount(activeResource.consumed) }}/min</p>
              </div>
              <div class="resource-detail-card">
                <p class="resource-detail-label">Net Flow</p>
                <p class="resource-detail-value" :class="activeResource.netClass">{{ formatSigned(activeResource.net) }}/min</p>
              </div>
              <div v-if="activeResource.maintenanceDemand" class="resource-detail-card">
                <p class="resource-detail-label">Maintenance Need</p>
                <p
                  class="resource-detail-value"
                  :class="activeResource.maintenanceDemand.shortfall > 0 ? 'resource-detail-bad' : 'resource-detail-neutral'"
                >
                  {{ formatAmount(activeResource.maintenanceDemand.amount) }} now
                </p>
                <p
                  v-if="activeResource.maintenanceDemand.shortfall > 0"
                  class="resource-detail-card-note resource-detail-bad"
                >
                  {{ formatAmount(activeResource.maintenanceDemand.shortfall) }} short
                </p>
              </div>
              <div v-if="activeResource.hungerRelief" class="resource-detail-card">
                <p class="resource-detail-label">Hunger Relief</p>
                <p class="resource-detail-value">{{ formatHungerRelief(activeResource.hungerRelief) }}</p>
              </div>
            </div>
          </section>

          <section v-if="activeResource.breakdown.length" class="resource-detail-section">
            <div class="resource-detail-section-head">
              <h3 class="resource-detail-section-title">{{ activeResource.breakdownTitle }}</h3>
            </div>
            <div class="resource-detail-list">
              <div v-for="entry in activeResource.breakdown" :key="entry.key" class="resource-detail-list-row">
                <span class="resource-detail-row-label">
                  <img v-if="entry.iconUrl" class="resource-detail-row-icon-image" :src="entry.iconUrl" alt="" />
                  <span v-else class="resource-detail-row-icon" aria-hidden="true">{{ entry.icon }}</span>
                  <span>{{ entry.label }}</span>
                </span>
                <span>{{ entry.stock }} · {{ formatSigned(entry.net) }}/min<span v-if="entry.hungerRelief"> · {{ formatHungerRelief(entry.hungerRelief) }}</span></span>
              </div>
            </div>
          </section>

          <section class="resource-detail-section">
            <div class="resource-detail-section-head">
              <h3 class="resource-detail-section-title">Where It Comes From</h3>
            </div>
            <div v-if="activeResource.producers.length" class="resource-detail-list">
              <div v-for="entry in activeResource.producers" :key="entry.label" class="resource-detail-list-row">
                <span>{{ entry.label }}</span>
                <span>+{{ formatAmount(entry.amount) }}/min</span>
              </div>
            </div>
            <p v-else class="resource-detail-empty">No active production right now.</p>
          </section>

          <section v-if="activeResource.potentialProducers.length" class="resource-detail-section">
            <div class="resource-detail-section-head">
              <h3 class="resource-detail-section-title">Potential / Downtime</h3>
            </div>
            <div class="resource-detail-list">
              <div v-for="entry in activeResource.potentialProducers" :key="`${entry.label}:${entry.note}`" class="resource-detail-list-row resource-detail-list-row-stacked">
                <span>{{ entry.label }}</span>
                <span>+{{ formatAmount(entry.amount) }}/min potential</span>
                <small v-if="entry.note">{{ entry.note }}</small>
              </div>
            </div>
          </section>

          <section class="resource-detail-section">
            <div class="resource-detail-section-head">
              <h3 class="resource-detail-section-title">Where It Goes</h3>
            </div>
            <div v-if="activeResource.consumers.length" class="resource-detail-list">
              <div v-for="entry in activeResource.consumers" :key="entry.label" class="resource-detail-list-row">
                <span>{{ entry.label }}</span>
                <span>-{{ formatAmount(entry.amount) }}/min</span>
              </div>
            </div>
            <p v-else class="resource-detail-empty">No active per-minute consumption right now.</p>
            <div v-if="activeResource.maintenanceDemand" class="resource-detail-list resource-detail-maintenance-list">
              <div class="resource-detail-list-row resource-detail-list-row-maintenance">
                <span>Building repairs</span>
                <span>{{ formatAmount(activeResource.maintenanceDemand.amount) }} needed now</span>
              </div>
              <div
                v-if="activeResource.maintenanceDemand.shortfall > 0"
                class="resource-detail-list-row resource-detail-list-row-maintenance"
              >
                <span>Repair shortfall</span>
                <span>{{ formatAmount(activeResource.maintenanceDemand.shortfall) }} missing</span>
              </div>
            </div>
          </section>
        </main>
      </PanelModalShell>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import craftedGoodsPortraitUrl from '../assets/ui/resource-portraits/resource-group-crafted-goods.png';
import cropsPortraitUrl from '../assets/ui/resource-portraits/resource-group-crops.png';
import foodPortraitUrl from '../assets/ui/resource-portraits/resource-group-food.png';
import materialsPortraitUrl from '../assets/ui/resource-portraits/resource-group-materials.png';
import tradeGoodsPortraitUrl from '../assets/ui/resource-portraits/resource-group-trade-goods.png';
import type { ResourceAmount, ResourceType } from '../core/types/Resource.ts';
import { tileIndex } from '../core/world.ts';
import { getBuildingDefinitionByKey } from '../shared/buildings/registry.ts';
import { getJobSiteStatusDescriptor, getPerMinuteResources } from '../shared/buildings/jobSiteDetails.ts';
import { resolveBuildingJobResources } from '../shared/buildings/registry.ts';
import { getMaintenanceOverview } from '../shared/buildings/maintenanceDetails.ts';
import { getInventoryEntryDefinition, getInventoryKindLabel } from '../shared/game/inventoryPresentation.ts';
import {
  getResourceDefinition,
  getResourceGroupDefinition,
  getResourceHungerRelief,
  listResourceDefinitions,
  type ResourceGroup,
} from '../shared/game/resourceDefinitions.ts';
import { workforceState } from '../store/clientJobStore';
import { FOOD_PER_SETTLER_PER_MINUTE } from '../store/populationStore';
import { populationState } from '../store/clientPopulationStore';
import { getSettlementResourceInventory, resourceInventory, resourceVersion } from '../store/resourceStore';
import { settlers } from '../store/settlerStore.ts';
import { closeResourceDetailModal, selectedResourceDetail } from '../store/uiStore';
import { isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import type { JobSiteStatus } from '../store/jobStore.ts';
import PanelModalShell from './ui/PanelModalShell.vue';
import PanelIconBanner from './ui/PanelIconBanner.vue';
import PanelPortraitFrame from './ui/PanelPortraitFrame.vue';

type FlowEntry = { label: string; amount: number; note?: string };

const RESOURCE_GROUP_PORTRAITS: Record<ResourceGroup, string> = {
  food: foodPortraitUrl,
  crops: cropsPortraitUrl,
  materials: materialsPortraitUrl,
  crafted_goods: craftedGoodsPortraitUrl,
  trade_goods: tradeGoodsPortraitUrl,
};

function getResourceGroupPortraitUrl(group: ResourceGroup) {
  return RESOURCE_GROUP_PORTRAITS[group];
}

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.RESOURCE_MODAL));
const playerPopulation = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId
    ? populationState.settlements.find((settlement) => settlement.settlementId === settlementId) ?? populationState
    : populationState;
});
const playerInventory = computed(() => {
  resourceVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? getSettlementResourceInventory(settlementId) : resourceInventory;
});
const playerTiles = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return Object.values(tileIndex).filter((tile) => !settlementId || tile.ownerSettlementId === settlementId || tile.controlledBySettlementId === settlementId);
});
const playerSettlers = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? settlers.filter((settler) => settler.settlementId === settlementId) : settlers;
});

function formatAmount(value: number) {
  return `${Math.floor(value)}`;
}

function formatSigned(value: number) {
  const absolute = Math.floor(Math.abs(value));
  if (absolute <= 0) return '0';
  if (value > 0) return `+${absolute}`;
  if (value < 0) return `-${absolute}`;
  return '0';
}

function formatHungerRelief(value: number) {
  return `${Number(value.toFixed(2)).toString()} meals`;
}

function accumulateMatches(matches: FlowEntry[], label: string, resources: ResourceAmount[], type: ResourceType, note?: string) {
  const match = resources.find((resource) => resource.type === type);
  if (!match || match.amount <= 0) return;
  matches.push({ label, amount: match.amount, note });
}

function getSettlerWorkRateMultiplier(happiness: number | null | undefined) {
  const value = happiness ?? 100;
  if (value >= 80) return 1.1;
  if (value >= 50) return 1;
  if (value >= 20) return 0.8;
  return 0.6;
}

function getActiveWorkerStatsForSite(tileId: string) {
  return playerSettlers.value
    .filter((settler) => (
      settler.assignedWorkTileId === tileId
      && settler.activity === 'working'
    ))
    .reduce((stats, settler) => ({
      count: stats.count + 1,
      rate: stats.rate + getSettlerWorkRateMultiplier(settler.happiness),
    }), { count: 0, rate: 0 });
}

function getPotentialReason(status: JobSiteStatus, assignedWorkers: number, activeWorkers: { count: number; rate: number }) {
  if (status !== 'staffed') {
    return getJobSiteStatusDescriptor(status).text;
  }

  if (activeWorkers.count < assignedWorkers) {
    return 'Crew downtime: commuting, eating, sleeping, or delivering.';
  }

  if (activeWorkers.rate < activeWorkers.count) {
    return 'Low happiness is slowing work.';
  }

  return 'Crew downtime: commuting, eating, sleeping, or delivering.';
}

function buildResourceInsight(resourceType: ResourceType) {
  const producers: FlowEntry[] = [];
  const consumers: FlowEntry[] = [];
  const potentialProducers: FlowEntry[] = [];

  for (const site of workforceState.sites) {
    const building = getBuildingDefinitionByKey(site.buildingKey);
    if (!building || site.assignedWorkers <= 0) continue;

    const tile = tileIndex[site.tileId] ?? null;
    const settlementId = currentPlayerSettlementId.value;
    if (settlementId && tile?.ownerSettlementId !== settlementId && tile?.controlledBySettlementId !== settlementId) {
      continue;
    }

    const activeWorkerStats = site.status === 'staffed'
      ? getActiveWorkerStatsForSite(site.tileId)
      : { count: 0, rate: 0 };
    const activeWorkerRate = activeWorkerStats.rate;
    const activeFlow = activeWorkerRate > 0
      ? resolveBuildingJobResources(building, tile, activeWorkerRate)
      : { produces: [], consumes: [] };
    const assignedFlow = resolveBuildingJobResources(building, tile, site.assignedWorkers);
    const produced = getPerMinuteResources(activeFlow.produces, 1, building.cycleMs);
    const consumed = getPerMinuteResources(activeFlow.consumes, 1, building.cycleMs);
    const potentialProduced = getPerMinuteResources(assignedFlow.produces, 1, building.cycleMs);
    accumulateMatches(producers, building.label, produced, resourceType);
    accumulateMatches(consumers, building.label, consumed, resourceType);

    const activeProducedAmount = produced.find((resource) => resource.type === resourceType)?.amount ?? 0;
    const potentialProducedAmount = potentialProduced.find((resource) => resource.type === resourceType)?.amount ?? 0;
    const downtimeAmount = Math.max(0, potentialProducedAmount - activeProducedAmount);
    if (downtimeAmount > 0) {
      potentialProducers.push({
        label: building.label,
        amount: downtimeAmount,
        note: getPotentialReason(site.status, site.assignedWorkers, activeWorkerStats),
      });
    }
  }

  if (resourceType === 'food' && playerPopulation.value.current > 0) {
    consumers.unshift({
      label: 'Settlers',
      amount: playerPopulation.value.current * FOOD_PER_SETTLER_PER_MINUTE,
    });
  }

  const produced = producers.reduce((sum, entry) => sum + entry.amount, 0);
  const consumed = consumers.reduce((sum, entry) => sum + entry.amount, 0);
  const net = produced - consumed;
  const maintenanceOverview = getMaintenanceOverview(playerTiles.value, playerSettlers.value, playerInventory.value);
  const maintenanceDemand = maintenanceOverview.backlogResources.find((resource) => resource.type === resourceType) ?? null;
  const hungerRelief = getResourceHungerRelief(resourceType);

  return {
    key: resourceType,
    label: getResourceDefinition(resourceType).label,
    icon: getResourceDefinition(resourceType).icon,
    iconUrl: null,
    stock: Math.floor(playerInventory.value[resourceType] ?? 0),
    produced,
    consumed,
    net,
    producers,
    consumers,
    potentialProducers,
    maintenanceDemand,
    hungerRelief,
  };
}

function isResourceGroupKey(value: string): value is ResourceGroup {
  return ['food', 'crops', 'materials', 'crafted_goods', 'trade_goods'].includes(value);
}

const activeResource = computed(() => {
  const selection = selectedResourceDetail.value;
  if (!selection) return null;

  if (isResourceGroupKey(selection)) {
    const group = getResourceGroupDefinition(selection);
    const breakdown = listResourceDefinitions()
      .filter((resource) => resource.group === selection)
      .map((resource) => buildResourceInsight(resource.type))
      .filter((resource) => resource.stock > 0 || resource.produced > 0 || resource.consumed > 0 || resource.potentialProducers.length > 0);
    const produced = breakdown.reduce((sum, entry) => sum + entry.produced, 0);
    const consumed = breakdown.reduce((sum, entry) => sum + entry.consumed, 0);
    const net = produced - consumed;
    const producers = new Map<string, number>();
    const consumers = new Map<string, number>();
    const potentialProducers = new Map<string, FlowEntry>();
    for (const entry of breakdown) {
      for (const producer of entry.producers) {
        producers.set(producer.label, (producers.get(producer.label) ?? 0) + producer.amount);
      }
      for (const consumer of entry.consumers) {
        consumers.set(consumer.label, (consumers.get(consumer.label) ?? 0) + consumer.amount);
      }
      for (const producer of entry.potentialProducers) {
        const key = `${producer.label}:${producer.note ?? ''}`;
        const previous = potentialProducers.get(key);
        potentialProducers.set(key, {
          label: producer.label,
          note: producer.note,
          amount: (previous?.amount ?? 0) + producer.amount,
        });
      }
    }

    return {
      key: selection,
      label: group.label,
      icon: group.icon,
      iconUrl: getResourceGroupPortraitUrl(selection),
      kindLabel: 'Group',
      subtitle: `Combined storage and resource flow for the ${group.label.toLowerCase()} group.`,
      stock: breakdown.reduce((sum, entry) => sum + entry.stock, 0),
      produced,
      consumed,
      net,
      maintenanceDemand: null,
      hungerRelief: null,
      breakdownTitle: `${group.label} Breakdown`,
      breakdown: breakdown.sort((a, b) => b.stock - a.stock || a.label.localeCompare(b.label)),
      producers: Array.from(producers.entries()).map(([label, amount]) => ({ label, amount })),
      consumers: Array.from(consumers.entries()).map(([label, amount]) => ({ label, amount })),
      potentialProducers: Array.from(potentialProducers.values()),
      netClass: Math.floor(Math.abs(net)) <= 0 ? 'resource-detail-neutral' : net > 0 ? 'resource-detail-good' : 'resource-detail-bad',
    };
  }

  const meta = getInventoryEntryDefinition(selection);
  const detail = buildResourceInsight(selection);
  return {
    key: selection,
    label: meta.label,
    icon: meta.icon,
    iconUrl: getResourceGroupPortraitUrl(meta.topBarGroup),
    kindLabel: getInventoryKindLabel(meta.kind),
    subtitle: `Current storage, production, and consumption for this ${getInventoryKindLabel(meta.kind).toLowerCase()}.`,
    stock: detail.stock,
    produced: detail.produced,
    consumed: detail.consumed,
    net: detail.net,
    producers: detail.producers,
    consumers: detail.consumers,
    potentialProducers: detail.potentialProducers,
    maintenanceDemand: detail.maintenanceDemand,
    hungerRelief: detail.hungerRelief,
    breakdownTitle: 'Breakdown',
    breakdown: [],
    netClass: Math.floor(Math.abs(detail.net)) <= 0 ? 'resource-detail-neutral' : detail.net > 0 ? 'resource-detail-good' : 'resource-detail-bad',
  };
});

const resourceNote = computed(() => {
  const resource = activeResource.value;
  if (!resource) {
    return 'The settlement ledger is catching up.';
  }

  if (resource.net < 0) {
    return `${resource.label} is running down. Check demand, downtime, or missing workers before storage empties.`;
  }

  if (resource.net > 0) {
    return `${resource.label} is trending upward. Keep storage open and watch for idle production.`;
  }

  return `${resource.label} is balanced for now. A small change in workers or upkeep can tip the flow.`;
});

function close() {
  closeResourceDetailModal();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.RESOURCE_MODAL)) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

let listenerActive = false;

watch(isOpen, (nextOpen) => {
  if (nextOpen && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!nextOpen && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.resource-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 58;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 22% 45%, rgb(50 66 47 / 0.22), transparent 23rem),
    radial-gradient(circle at 50% 120%, rgba(57, 80, 57, 0.14), transparent 28rem),
    rgba(1, 5, 12, 0.82);
  backdrop-filter: blur(4px) saturate(0.82) brightness(0.78);
}

.resource-detail-panel {
  position: relative;
  box-sizing: border-box;
  width: min(55.5rem, calc(100vw - 32px));
  height: min(40.5rem, calc(100vh - 48px));
  display: grid;
  grid-template-columns: minmax(11.5rem, 13.9rem) minmax(0, 1fr);
  gap: 0.95rem;
  overflow: hidden;
  padding: 1.55rem 1.65rem 1.35rem;
  --panel-header-margin: -1.55rem calc(-1 * var(--panel-modal-border-width, 20px)) 0 calc(-1 * var(--panel-modal-border-width, 20px));
  border: 20px solid transparent;
  border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 36px stretch;
  background:
    radial-gradient(circle at 66% 0%, rgba(83, 57, 32, 0.2), transparent 24rem),
    radial-gradient(circle at 15% 100%, rgba(47, 31, 20, 0.22), transparent 18rem),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, #121619 0%, #0a0d10 100%);
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.66),
    0 0 0 1px rgba(209, 145, 58, 0.34),
    inset 0 0 70px rgba(0, 0, 0, 0.86);
  color: #f3e4c9;
}

.resource-detail-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.16;
  background-image:
    radial-gradient(circle at 12% 24%, rgba(255, 228, 169, 0.12) 0 1px, transparent 1px),
    radial-gradient(circle at 74% 68%, rgba(255, 228, 169, 0.1) 0 1px, transparent 1px),
    radial-gradient(circle at 46% 44%, rgba(0, 0, 0, 0.42) 0 1px, transparent 1px);
  background-size: 13px 17px, 19px 23px, 11px 13px;
}

.resource-detail-left-rail,
.resource-detail-main {
  position: relative;
  z-index: 1;
}

.resource-detail-left-rail {
  display: grid;
  align-content: start;
  gap: 0.46rem;
  padding-top: 0.75rem;
}

.resource-detail-icon-frame {
  margin: 0 auto;
}

.resource-detail-hero-icon {
  position: relative;
  z-index: 1;
  width: 74%;
  height: 74%;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background:
    radial-gradient(circle at 50% 30%, rgba(255, 226, 161, 0.12), transparent 60%),
    rgba(7, 9, 11, 0.24);
  font-size: clamp(4rem, 7vw, 5.35rem);
  line-height: 1;
  filter:
    drop-shadow(0 4px 0 rgba(0, 0, 0, 0.7))
    drop-shadow(0 0 12px rgba(235, 169, 64, 0.24));
}

.resource-detail-hero-image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  filter:
    saturate(1.04)
    contrast(1.04);
}

.resource-detail-badge {
  z-index: 2;
  margin: -1.55rem auto 0;
}

.resource-detail-paper-note {
  box-sizing: border-box;
  width: min(100%, 11.95rem);
  min-height: 6.35rem;
  margin: 0 auto;
  padding: 1rem 1.08rem 0.75rem;
  color: #2a180a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.84rem;
  line-height: 1.3;
  background: url('../assets/ui/settler-modal/paper-note.png') center / 100% 100% no-repeat;
  border: 0;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
}

.resource-detail-mini-ledger {
  width: min(100%, 11.95rem);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem 0.7rem;
  border: 1px solid rgba(130, 88, 43, 0.52);
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.58);
  padding: 0.65rem 0.75rem;
  font-family: Georgia, 'Times New Roman', serif;
}

.resource-detail-mini-ledger span {
  color: #c69549;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.resource-detail-mini-ledger strong {
  color: #fff0d2;
  text-align: right;
}

.resource-detail-main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 0.45rem;
  scrollbar-color: rgba(198, 149, 73, 0.78) rgba(7, 10, 12, 0.48);
  scrollbar-width: thin;
}

.resource-detail-main::-webkit-scrollbar {
  width: 0.55rem;
}

.resource-detail-main::-webkit-scrollbar-track {
  background:
    repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 5px),
    rgba(7, 10, 12, 0.58);
  border-left: 1px solid rgba(130, 88, 43, 0.2);
}

.resource-detail-main::-webkit-scrollbar-thumb {
  border: 1px solid rgba(29, 18, 10, 0.9);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(223, 165, 70, 0.92), rgba(102, 65, 31, 0.9));
}

.resource-detail-header,
.resource-detail-section {
  position: relative;
  z-index: 1;
  padding: 1rem 1.15rem;
}

.resource-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.05rem 3.15rem 0.75rem 0;
  border-bottom: 0;
}

.resource-detail-title-block {
  min-width: 0;
}

.resource-detail-kicker,
.resource-detail-label {
  margin: 0 0 0.28rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c69549;
}

.resource-detail-title {
  display: flex;
  align-items: center;
  gap: 0.58rem;
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.55rem, 3vw, 2rem);
  line-height: 1.1;
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807, 0 0 10px rgba(216, 170, 83, 0.18);
}

.resource-detail-title-icon {
  width: 2.35rem;
  height: 2.35rem;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: rgba(246, 199, 108, 0.08);
  font-size: 1.45rem;
  line-height: 1;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.72));
}

.resource-detail-subtitle {
  margin: 0.38rem 0 0;
  max-width: 35rem;
  font-family: Georgia, 'Times New Roman', serif;
  color: #d7c8a7;
  font-size: 0.95rem;
  line-height: 1.3;
}

.resource-detail-section {
  border-bottom: 0;
}

.resource-detail-section + .resource-detail-section {
  border-top: 1px solid rgba(130, 88, 43, 0.24);
  box-shadow: inset 0 1px 0 rgba(255, 226, 161, 0.035);
}

.resource-detail-section:last-child {
  border-bottom: 0;
}

.resource-detail-ledger {
  border: 1px solid rgba(130, 88, 43, 0.28);
  border-radius: 6px;
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 226, 161, 0.055), transparent 11rem),
    radial-gradient(circle at 80% 110%, rgba(157, 95, 43, 0.12), transparent 16rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.024) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 9px),
    linear-gradient(180deg, rgba(22, 25, 27, 0.96), rgba(10, 12, 14, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.82),
    inset 0 0 42px rgba(0, 0, 0, 0.78);
}

.resource-detail-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.75rem, 1fr));
  gap: 0.42rem;
  border: 0;
}

.resource-detail-card {
  min-height: 5.2rem;
  border: 1px solid rgba(130, 88, 43, 0.3);
  border-radius: 6px;
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 226, 161, 0.052), transparent 7rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, rgba(23, 25, 26, 0.62), rgba(9, 11, 13, 0.46));
  padding: 0.72rem 0.82rem;
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.28),
    0 1px 0 rgba(255, 226, 161, 0.035);
}

.resource-detail-card:nth-child(4n) {
  border-right: 1px solid rgba(130, 88, 43, 0.3);
}

.resource-detail-value {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.35rem;
  line-height: 1.1;
  color: #fff0d2;
  text-shadow: 0 1px 0 #070707;
}

.resource-detail-card-note {
  margin: 0.3rem 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.78rem;
}

.resource-detail-section-head {
  margin-bottom: 0.65rem;
}

.resource-detail-section-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #d0a050;
  text-shadow: 0 1px 0 #070707;
}

.resource-detail-list {
  display: grid;
  gap: 0.42rem;
  border: 0;
  background: transparent;
}

.resource-detail-maintenance-list {
  margin-top: 0.7rem;
}

.resource-detail-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.66rem 0.82rem;
  border: 1px solid rgba(130, 88, 43, 0.3);
  border-radius: 6px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255, 226, 161, 0.045), transparent 8rem),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  font-family: Georgia, 'Times New Roman', serif;
  color: #d7c8a7;
  line-height: 1.2;
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.22);
}

.resource-detail-list-row:last-child {
  border-bottom: 1px solid rgba(130, 88, 43, 0.3);
}

.resource-detail-list-row > span:first-child,
.resource-detail-row-label {
  min-width: 0;
  color: #fff0d2;
  overflow-wrap: anywhere;
}

.resource-detail-row-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.resource-detail-row-icon,
.resource-detail-row-icon-image {
  width: 1.95rem;
  height: 1.95rem;
  flex: 0 0 1.95rem;
}

.resource-detail-row-icon {
  display: inline-grid;
  place-items: center;
  border-radius: 5px;
  background:
    radial-gradient(circle at 45% 28%, rgba(255, 226, 161, 0.14), transparent 62%),
    rgba(16, 17, 17, 0.54);
  font-size: 1.25rem;
  line-height: 1;
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.46);
}

.resource-detail-row-icon-image {
  display: block;
  object-fit: contain;
  object-position: center;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.48));
}

.resource-detail-list-row > span:last-child {
  flex: 0 0 auto;
  color: #cdbb98;
}

.resource-detail-list-row-stacked {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.resource-detail-list-row-stacked small {
  grid-column: 1 / -1;
  color: #a99b82;
  font-size: 0.78rem;
}

.resource-detail-list-row-maintenance {
  border-color: rgba(196, 137, 63, 0.38);
  background:
    linear-gradient(180deg, rgba(120, 53, 15, 0.22), rgba(10, 12, 14, 0.18)),
    rgba(28, 22, 17, 0.42);
}

.resource-detail-empty {
  margin: 0;
  padding: 0.85rem;
  border: 1px solid rgba(130, 88, 43, 0.3);
  border-radius: 6px;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    rgba(10, 12, 14, 0.34);
  color: #a99b82;
  font-family: Georgia, 'Times New Roman', serif;
}

.resource-detail-good {
  color: #9ee6a8;
}

.resource-detail-bad {
  color: #f0a681;
}

.resource-detail-neutral {
  color: #d7c8a7;
}

@media (max-width: 720px) {
  .resource-detail-backdrop {
    align-items: stretch;
    padding: 0;
  }

  .resource-detail-panel {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.85rem;
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    min-height: 0;
    overflow: hidden;
    padding: 1.55rem 1rem 1rem;
  }

  .resource-detail-left-rail {
    grid-template-columns: minmax(7.8rem, 10rem) minmax(0, 1fr);
    align-items: center;
    padding-top: 0.35rem;
  }

  .resource-detail-icon-frame {
    width: 100%;
  }

  .resource-detail-badge {
    display: none;
  }

  .resource-detail-paper-note,
  .resource-detail-mini-ledger {
    width: 100%;
  }

  .resource-detail-main {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .resource-detail-header,
  .resource-detail-section {
    padding: 0.9rem;
  }

  .resource-detail-header,
  .resource-detail-list-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .resource-detail-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resource-detail-card:nth-child(4n) {
    border-right: 1px solid rgba(130, 88, 43, 0.3);
  }

  .resource-detail-card:nth-child(even) {
    border-right: 1px solid rgba(130, 88, 43, 0.3);
  }

  .resource-detail-list-row > span:last-child {
    flex: 0 1 auto;
  }
}
</style>
