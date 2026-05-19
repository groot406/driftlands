<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen && activeResource" class="resource-detail-backdrop smooth-modal-backdrop text-opacity-75" @click.self="close">
      <NineSlicePanel type="small">
        <section class="resource-detail-panel " @click.stop>
          <header class="resource-detail-header">
            <div>
              <p class="resource-detail-kicker">{{ activeResource.kindLabel }}</p>
              <h2 class="resource-detail-title">{{ activeResource.icon }} {{ activeResource.label }}</h2>
              <p class="resource-detail-subtitle">{{ activeResource.subtitle }}</p>
            </div>
            <button class="resource-detail-close" type="button" title="Close" @click="close">✕</button>
          </header>

          <section class="resource-detail-section">
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
                <span>{{ entry.icon }} {{ entry.label }}</span>
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
        </section>
      </NineSlicePanel>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
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
import NineSlicePanel from "./ui/NineSlicePanel.vue";
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import type { JobSiteStatus } from '../store/jobStore.ts';

type FlowEntry = { label: string; amount: number; note?: string };

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
  return ['food', 'crops', 'materials', 'crafted_goods'].includes(value);
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
  padding: 20px;
  background: rgba(2, 6, 23, 0.76);
  backdrop-filter: blur(4px);
}

.resource-detail-panel {
  width: min(44rem, 100%);
  max-height: min(88vh, 50rem);
  overflow-y: auto;
  border-radius: 28px;

  color: #f8fafc;
}

.resource-detail-header,
.resource-detail-section {
  padding: 20px 22px;
}

.resource-detail-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.resource-detail-kicker,
.resource-detail-label {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(253, 224, 71, 0.76);
}

.resource-detail-close {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.7);
  color: #f8fafc;
  appearance: none;
}

.resource-detail-stat-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.resource-detail-card {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.52);
  padding: 14px;
}

.resource-detail-card-note {
  margin-top: 4px;
  font-size: 12px;
}

.resource-detail-list {
  display: grid;
  gap: 10px;
}

.resource-detail-maintenance-list {
  margin-top: 10px;
}

.resource-detail-list-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.48);
}

.resource-detail-list-row-stacked {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.resource-detail-list-row-stacked small {
  grid-column: 1 / -1;
  color: rgba(226, 232, 240, 0.68);
  font-size: 12px;
}

.resource-detail-list-row-maintenance {
  border-color: rgba(251, 191, 36, 0.22);
  background:
    linear-gradient(180deg, rgba(120, 53, 15, 0.2), rgba(15, 23, 42, 0.52)),
    rgba(15, 23, 42, 0.48);
}

.resource-detail-good {
  color: #86efac;
}

.resource-detail-bad {
  color: #fca5a5;
}

.resource-detail-neutral {
  color: #cbd5f5;
}

@media (max-width: 720px) {
  .resource-detail-panel {
    width: 100%;
    max-height: 92vh;
  }

  .resource-detail-header,
  .resource-detail-section {
    padding: 16px;
  }

  .resource-detail-header,
  .resource-detail-list-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
