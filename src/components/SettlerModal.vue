<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen && settler" class="settler-modal-backdrop smooth-modal-backdrop" @click.self="close">
      <section class="settler-modal-panel smooth-modal-surface" @click.stop>
        <header class="settler-modal-header">
          <div>
            <p class="settler-modal-eyebrow">Settler</p>
            <h2 class="settler-modal-title">{{ settlerName }}</h2>
            <p class="settler-modal-subtitle">{{ locationSummary }}</p>
          </div>
          <button class="settler-modal-close" type="button" title="Close" @click="close">✕</button>
        </header>

        <div class="settler-modal-body">
          <section class="settler-card">
            <p class="settler-card-label">Activity</p>
            <div class="settler-pill-row">
              <span class="settler-pill">{{ activityLabel }}</span>
              <span class="settler-pill" :class="{ 'settler-pill-alert': isHungry }">Hunger {{ formatDuration(settler.hungerMs) }}</span>
              <span class="settler-pill" :class="{ 'settler-pill-alert': isTired }">Fatigue {{ formatDuration(settler.fatigueMs) }}</span>
            </div>
          </section>

          <section class="settler-grid">
            <div class="settler-card">
              <p class="settler-card-label">Home</p>
              <p class="settler-card-value">{{ homeLabel }}</p>
              <p class="settler-card-meta">{{ accessLabel }}</p>
            </div>

            <div class="settler-card">
              <p class="settler-card-label">Work</p>
              <p class="settler-card-value">{{ workLabel }}</p>
              <p class="settler-card-meta">{{ workProgressLabel }}</p>
            </div>

            <div class="settler-card">
              <p class="settler-card-label">Cargo</p>
              <p class="settler-card-value">{{ carryingLabel }}</p>
              <p class="settler-card-meta">{{ movementLabel }}</p>
            </div>

            <div class="settler-card">
              <p class="settler-card-label">Position</p>
              <p class="settler-card-value">{{ positionLabel }}</p>
              <p class="settler-card-meta">Facing {{ settler.facing }}</p>
            </div>
          </section>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { tileIndex } from '../core/world';
import { getSettlerDisplayName } from '../shared/game/settlerNames.ts';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry';
import { closeWindow, isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';
import { closeSettlerModal, getSelectedSettler } from '../store/uiStore';

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.SETTLER_MODAL));
const settler = computed(() => getSelectedSettler());

const HUNGRY_MS = 60_000;
const TIRED_MS = 3 * 60_000;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatTitleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTileLabel(tileId: string | null | undefined) {
  if (!tileId) {
    return 'None assigned';
  }

  const tile = tileIndex[tileId] ?? null;
  if (!tile) {
    return 'Unknown place';
  }

  if (tile.terrain === 'towncenter') {
    return 'Town Center';
  }

  const building = getBuildingDefinitionForTile(tile);
  if (building) {
    return building.label;
  }

  return formatTitleCase(tile.terrain);
}

const settlerName = computed(() => {
  const id = settler.value?.id ?? 'Settler';
  return getSettlerDisplayName(id);
});

const activityLabel = computed(() => settler.value ? formatTitleCase(settler.value.activity) : 'Unknown');
const homeLabel = computed(() => formatTileLabel(settler.value?.homeTileId));
const workLabel = computed(() => formatTileLabel(settler.value?.assignedWorkTileId));
const accessLabel = computed(() => `Access via ${formatTileLabel(settler.value?.homeAccessTileId)}`);

const isHungry = computed(() => (settler.value?.hungerMs ?? 0) >= HUNGRY_MS);
const isTired = computed(() => (settler.value?.fatigueMs ?? 0) >= TIRED_MS);

const workProgressLabel = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler?.assignedWorkTileId) {
    return 'No active work cycle';
  }

  const workTile = tileIndex[currentSettler.assignedWorkTileId] ?? null;
  const building = workTile ? getBuildingDefinitionForTile(workTile) : null;
  const cycleMs = building?.cycleMs ?? 0;
  if (cycleMs <= 0) {
    return 'Waiting for assignment data';
  }

  const clamped = Math.min(currentSettler.workProgressMs, cycleMs);
  const percent = Math.round((clamped / cycleMs) * 100);
  return `Cycle ${percent}% · ${formatDuration(clamped)} / ${formatDuration(cycleMs)}`;
});

const carryingLabel = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler?.carryingPayload || !currentSettler.carryingKind) {
    return 'Empty handed';
  }

  return `${formatTitleCase(currentSettler.carryingKind)} · ${currentSettler.carryingPayload.amount} ${formatTitleCase(currentSettler.carryingPayload.type)}`;
});

const movementLabel = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler?.movement) {
    return 'Stationary';
  }

  return `Traveling · ${currentSettler.movement.path.length} steps queued`;
});

const locationSummary = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler) {
    return 'Unavailable';
  }

  if (currentSettler.activity === 'sleeping') {
    return `Inside ${homeLabel.value}`;
  }

  if (currentSettler.assignedWorkTileId && currentSettler.activity === 'working') {
    return `Working at ${workLabel.value}`;
  }

  if (currentSettler.activity === 'commuting_home') {
    return `Heading home to ${homeLabel.value}`;
  }

  if (currentSettler.activity === 'commuting_work') {
    return `Heading to ${workLabel.value}`;
  }

  if (currentSettler.activity === 'fetching_food') {
    return 'Fetching food';
  }

  if (currentSettler.activity === 'fetching_input') {
    return 'Fetching supplies';
  }

  if (currentSettler.activity === 'delivering') {
    return 'Delivering cargo';
  }

  if (currentSettler.activity === 'waiting') {
    return 'Waiting for work';
  }

  return 'In the colony';
});

const positionLabel = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler) {
    return 'Unknown';
  }

  if (currentSettler.activity === 'sleeping') {
    return `Inside ${homeLabel.value}`;
  }

  if (currentSettler.assignedWorkTileId) {
    return `Near ${workLabel.value}`;
  }

  if (currentSettler.homeTileId) {
    return `Near ${homeLabel.value}`;
  }

  return 'In the colony';
});

function close() {
  closeSettlerModal();
  closeWindow(WINDOW_IDS.SETTLER_MODAL);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.SETTLER_MODAL)) {
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

watch(settler, (currentSettler) => {
  if (!currentSettler && isOpen.value) {
    close();
  }
});

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.settler-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(8px);
}

.settler-modal-panel {
  width: min(34rem, 100%);
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.88)),
    radial-gradient(circle at top, rgba(45, 212, 191, 0.12), transparent 60%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
  color: #f8fafc;
}

.settler-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 12px;
}

.settler-modal-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(153, 246, 228, 0.72);
}

.settler-modal-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
}

.settler-modal-subtitle {
  margin: 8px 0 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 14px;
}

.settler-modal-close {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  cursor: pointer;
}

.settler-modal-body {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settler-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.settler-card {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.55);
  padding: 14px;
}

.settler-card-label {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.72);
}

.settler-card-value {
  margin: 0;
  font-size: 16px;
  color: #f8fafc;
}

.settler-card-meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(226, 232, 240, 0.7);
}

.settler-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settler-pill {
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(30, 41, 59, 0.72);
  padding: 7px 10px;
  font-size: 13px;
  color: #e2e8f0;
}

.settler-pill-alert {
  border-color: rgba(251, 191, 36, 0.35);
  color: #fde68a;
}

@media (max-width: 640px) {
  .settler-modal-panel {
    width: 100%;
  }

  .settler-grid {
    grid-template-columns: 1fr;
  }
}
</style>
