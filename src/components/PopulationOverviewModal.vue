<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen" class="population-modal-backdrop smooth-modal-backdrop" @click.self="close">
      <section class="population-modal-panel smooth-modal-surface" @click.stop>
        <header class="population-modal-header">
          <div>
            <p class="population-modal-kicker">Population</p>
            <h2 class="population-modal-title">Settler Overview</h2>
            <p class="population-modal-subtitle">See every settler, what they are doing, and where colony labor is going.</p>
          </div>
          <button class="population-modal-close" type="button" title="Close" @click="close">✕</button>
        </header>

        <section class="population-section">
          <div class="population-stat-grid">
            <div class="population-stat-card">
              <p class="population-stat-label">Population</p>
              <p class="population-stat-value">{{ populationState.current }}/{{ populationState.max }}</p>
            </div>
            <div class="population-stat-card">
              <p class="population-stat-label">Beds</p>
              <p class="population-stat-value">{{ populationState.beds }}</p>
            </div>
            <div class="population-stat-card">
              <p class="population-stat-label">Workers</p>
              <p class="population-stat-value">{{ workforceState.assignedWorkers }}/{{ workforceState.availableWorkers }}</p>
            </div>
            <div class="population-stat-card">
              <p class="population-stat-label">Food Use</p>
              <p class="population-stat-value">{{ foodUseLabel }}</p>
            </div>
          </div>
        </section>

        <section class="population-section">
          <div class="population-section-head">
            <h3 class="population-section-title">All Settlers</h3>
            <span class="population-chip">{{ settlers.length }} total</span>
          </div>

          <div v-if="settlers.length" class="population-settler-list">
            <button
              v-for="settler in settlers"
              :key="settler.id"
              class="population-settler-row"
              type="button"
              @click="inspectSettler(settler)"
            >
              <div>
                <p class="population-settler-name">{{ getSettlerName(settler.id) }}</p>
                <p class="population-settler-meta">{{ formatActivity(settler.activity) }} · {{ getSettlerLocation(settler) }}</p>
              </div>
              <span class="population-chip">{{ getCargoLabel(settler) }}</span>
            </button>
          </div>
          <p v-else class="population-empty">No settlers available.</p>
        </section>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import type { Settler } from '../core/types/Settler.ts';
import { tileIndex } from '../core/world.ts';
import { getSettlerDisplayName } from '../shared/game/settlerNames.ts';
import { formatSettlerBlocker } from '../shared/game/settlerBlockers.ts';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry.ts';
import { populationState } from '../store/clientPopulationStore';
import { workforceState } from '../store/clientJobStore';
import { FOOD_PER_SETTLER_PER_MINUTE } from '../store/populationStore';
import { settlers as settlerState } from '../store/settlerStore';
import { closePopulationModal, openSettlerModal } from '../store/uiStore';
import { isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.POPULATION_MODAL));
const settlers = computed(() => [...settlerState]);
const foodUseLabel = computed(() => `${populationState.current * FOOD_PER_SETTLER_PER_MINUTE}/min`);

function formatActivity(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSettlerName(id: string) {
  return getSettlerDisplayName(id);
}

function getTileLabel(tileId: string | null | undefined) {
  if (!tileId) return 'Unassigned';
  const tile = tileIndex[tileId];
  if (!tile) return 'Unknown place';
  if (tile.terrain === 'towncenter') return 'Town Center';
  const building = getBuildingDefinitionForTile(tile);
  return building?.label ?? tile.terrain.replace(/_/g, ' ');
}

function getSettlerLocation(settler: Settler) {
  const blocker = formatSettlerBlocker(settler.blockerReason);
  if (blocker) return blocker;
  if ((settler.activity === 'working' || settler.activity === 'repairing') && (settler.workTileId || settler.assignedWorkTileId)) {
    return `at ${getTileLabel(settler.workTileId ?? settler.assignedWorkTileId ?? null)}`;
  }
  if (settler.activity === 'sleeping' && settler.homeTileId) return `in ${getTileLabel(settler.homeTileId)}`;
  if (settler.activity === 'commuting_home' && settler.homeTileId) return `heading to ${getTileLabel(settler.homeTileId)}`;
  if (settler.activity === 'commuting_work' && settler.assignedWorkTileId) return `heading to ${getTileLabel(settler.assignedWorkTileId)}`;
  if (settler.activity === 'fetching_food') return 'fetching food';
  if (settler.activity === 'fetching_input') return 'fetching supplies';
  if (settler.activity === 'delivering') return 'delivering cargo';
  if (settler.activity === 'waiting') return 'waiting for work';
  return 'in the colony';
}

function getCargoLabel(settler: Settler) {
  if (!settler.carryingPayload) return 'Empty';
  return `${settler.carryingPayload.amount} ${settler.carryingPayload.type.replace(/_/g, ' ')}`;
}

function inspectSettler(settler: Settler) {
  openSettlerModal(settler);
}

function close() {
  closePopulationModal();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.POPULATION_MODAL)) {
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
.population-modal-backdrop {
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

.population-modal-panel {
  width: min(48rem, 100%);
  max-height: min(88vh, 52rem);
  overflow-y: auto;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.995), rgba(15, 23, 42, 0.99)),
    radial-gradient(circle at top, rgba(56, 189, 248, 0.1), transparent 58%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
  color: #f8fafc;
}

.population-modal-header,
.population-section {
  padding: 20px 22px;
}

.population-modal-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.population-modal-kicker,
.population-stat-label {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.76);
}

.population-modal-title,
.population-modal-subtitle,
.population-stat-value,
.population-section-title,
.population-settler-name,
.population-settler-meta,
.population-empty {
  margin: 0;
}

.population-modal-close,
.population-settler-row {
  appearance: none;
}

.population-modal-close {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.7);
  color: #f8fafc;
}

.population-stat-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.population-stat-card {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.52);
  padding: 14px;
}

.population-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.population-chip {
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.56);
  padding: 6px 10px;
  font-size: 12px;
  color: rgba(241, 245, 249, 0.9);
}

.population-settler-list {
  display: grid;
  gap: 10px;
}

.population-settler-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.48);
  text-align: left;
  color: inherit;
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.population-settler-row:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.34);
  background: rgba(30, 41, 59, 0.76);
}

@media (max-width: 720px) {
  .population-modal-panel {
    width: 100%;
    max-height: 92vh;
  }

  .population-modal-header,
  .population-section {
    padding: 16px;
  }

  .population-settler-row,
  .population-section-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
