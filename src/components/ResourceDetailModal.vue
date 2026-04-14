<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen && activeResource" class="resource-detail-backdrop smooth-modal-backdrop" @click.self="close">
      <section class="resource-detail-panel smooth-modal-surface" @click.stop>
        <header class="resource-detail-header">
          <div>
            <p class="resource-detail-kicker">Resource</p>
            <h2 class="resource-detail-title">{{ activeResource.icon }} {{ activeResource.label }}</h2>
            <p class="resource-detail-subtitle">Current stock, production, and consumption for this single resource.</p>
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
          <p v-else class="resource-detail-empty">No active consumption right now.</p>
        </section>
      </section>
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
import { workforceState } from '../store/clientJobStore';
import { FOOD_PER_SETTLER_PER_MINUTE } from '../store/populationStore';
import { populationState } from '../store/clientPopulationStore';
import { resourceInventory } from '../store/resourceStore';
import { closeResourceDetailModal, selectedResourceDetail } from '../store/uiStore';
import { isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';

const RESOURCE_META: Record<ResourceType, { label: string; icon: string }> = {
  wood: { label: 'Wood', icon: '🌲' },
  food: { label: 'Food', icon: '🍖' },
  grain: { label: 'Grain', icon: '🌾' },
  ore: { label: 'Ore', icon: '⛏️' },
  stone: { label: 'Stone', icon: '🪨' },
  water_lily: { label: 'Water Lilies', icon: '🪷' },
  water: { label: 'Water', icon: '💧' },
  crystal: { label: 'Crystal', icon: '💎' },
  artifact: { label: 'Artifact', icon: '🏺' },
};

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.RESOURCE_MODAL));

function formatAmount(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
}

function formatSigned(value: number) {
  const absolute = formatAmount(Math.abs(value));
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
  const net = Number((producedAmount - consumedAmount).toFixed(1));
  const meta = RESOURCE_META[resourceType];

  return {
    key: resourceType,
    ...meta,
    stock: resourceInventory[resourceType] ?? 0,
    produced: Number(producedAmount.toFixed(1)),
    consumed: Number(consumedAmount.toFixed(1)),
    net,
    producers,
    consumers,
    netClass: net > 0 ? 'resource-detail-good' : net < 0 ? 'resource-detail-bad' : 'resource-detail-neutral',
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
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(8px);
}

.resource-detail-panel {
  width: min(44rem, 100%);
  max-height: min(88vh, 50rem);
  overflow-y: auto;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.88)),
    radial-gradient(circle at top, rgba(245, 158, 11, 0.14), transparent 58%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
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

.resource-detail-list {
  display: grid;
  gap: 10px;
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
