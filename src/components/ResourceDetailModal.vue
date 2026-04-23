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
                <p class="resource-detail-label">Produced</p>
                <p class="resource-detail-value">+{{ formatAmount(activeResource.produced) }}/min</p>
              </div>
              <div class="resource-detail-card">
                <p class="resource-detail-label">Consumed</p>
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
import { getPerMinuteResources } from '../shared/buildings/jobSiteDetails.ts';
import { resolveBuildingJobResources } from '../shared/buildings/registry.ts';
import { getMaintenanceOverview } from '../shared/buildings/maintenanceDetails.ts';
import { getInventoryEntryDefinition, getInventoryKindLabel } from '../shared/game/inventoryPresentation.ts';
import { workforceState } from '../store/clientJobStore';
import { FOOD_PER_SETTLER_PER_MINUTE } from '../store/populationStore';
import { populationState } from '../store/clientPopulationStore';
import { resourceInventory } from '../store/resourceStore';
import { settlers } from '../store/settlerStore.ts';
import { closeResourceDetailModal, selectedResourceDetail } from '../store/uiStore';
import { isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';
import NineSlicePanel from "./ui/NineSlicePanel.vue";

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.RESOURCE_MODAL));

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

function accumulateMatches(matches: Array<{ label: string; amount: number }>, label: string, resources: ResourceAmount[], type: ResourceType) {
  const match = resources.find((resource) => resource.type === type);
  if (!match || match.amount <= 0) return;
  matches.push({ label, amount: match.amount });
}

const activeResource = computed(() => {
  const resourceType = selectedResourceDetail.value;
  if (!resourceType) return null;

  const producers: Array<{ label: string; amount: number }> = [];
  const consumers: Array<{ label: string; amount: number }> = [];

  for (const site of workforceState.sites) {
    const building = getBuildingDefinitionByKey(site.buildingKey);
    if (!building || site.assignedWorkers <= 0) continue;

    const tile = tileIndex[site.tileId] ?? null;
    const flow = resolveBuildingJobResources(building, tile, site.assignedWorkers);
    const produced = getPerMinuteResources(flow.produces, 1, building.cycleMs);
    const consumed = getPerMinuteResources(flow.consumes, 1, building.cycleMs);
    accumulateMatches(producers, building.label, produced, resourceType);
    accumulateMatches(consumers, building.label, consumed, resourceType);
  }

  if (resourceType === 'food' && populationState.current > 0) {
    consumers.unshift({
      label: 'Settlers',
      amount: populationState.current * FOOD_PER_SETTLER_PER_MINUTE,
    });
  }

  const producedAmount = producers.reduce((sum, entry) => sum + entry.amount, 0);
  const consumedAmount = consumers.reduce((sum, entry) => sum + entry.amount, 0);
  const net = producedAmount - consumedAmount;
  const netMagnitude = Math.floor(Math.abs(net));
  const meta = getInventoryEntryDefinition(resourceType);
  const kindLabel = getInventoryKindLabel(meta.kind);
  const maintenanceOverview = getMaintenanceOverview(Object.values(tileIndex), settlers, resourceInventory);
  const maintenanceDemand = maintenanceOverview.backlogResources.find((resource) => resource.type === resourceType) ?? null;

  return {
    key: resourceType,
    label: meta.label,
    icon: meta.icon,
    kindLabel,
    subtitle: `Current storage, production, and consumption for this ${kindLabel.toLowerCase()}.`,
    stock: Math.floor(resourceInventory[resourceType] ?? 0),
    produced: producedAmount,
    consumed: consumedAmount,
    net,
    producers,
    consumers,
    maintenanceDemand,
    netClass: netMagnitude <= 0 ? 'resource-detail-neutral' : net > 0 ? 'resource-detail-good' : 'resource-detail-bad',
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
