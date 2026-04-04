<template>
  <transition name="tc-slide">
    <div v-if="visible" class="tc-overlay" @pointerdown.stop.prevent @pointerup.stop>
      <div class="tc-panel">
        <div class="tc-header">
          <div class="tc-header-copy">
            <p class="tc-kicker pixel-font">Settlement</p>
            <h3 class="tc-title">Town Center</h3>
          </div>
          <button class="tc-close" @click.stop.prevent="close" title="Close">
            &#x2715;
          </button>
        </div>

        <div class="tc-section">
          <div class="tc-section-row">
            <div class="tc-section-title">Colony Progress</div>
          </div>
          <div class="tc-stat-grid">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.current }}</span>
              <span class="tc-stat-label">Population</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ exploredTiles }}</span>
              <span class="tc-stat-label">Explored Tiles</span>
            </div>
          </div>
        </div>

        <!-- Population Section -->
        <div class="tc-section">
          <div class="tc-section-row">
            <div class="tc-section-title">Housing</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.current }}</span>
              <span class="tc-stat-label">Settlers</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.beds }}</span>
              <span class="tc-stat-label">Beds</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.max }}</span>
              <span class="tc-stat-label">Capacity</span>
            </div>
          </div>
          <div class="tc-status-row" :class="populationStatusClass">
            <span class="tc-status-dot" :class="populationStatusClass" />
            <span class="tc-status-text">{{ populationStatusText }}</span>
          </div>
        </div>

        <div class="tc-section">
          <div class="tc-section-row">
            <div class="tc-section-title">Frontier Support</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.activeTileCount }}/{{ ownedTiles }}</span>
              <span class="tc-stat-label">Active / Owned</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.supportCapacity }}</span>
              <span class="tc-stat-label">Support Capacity</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ populationState.inactiveTileCount }}</span>
              <span class="tc-stat-label">Inactive Tiles</span>
            </div>
          </div>
          <div class="tc-status-row" :class="supportStatusClass">
            <span class="tc-status-dot" :class="supportStatusClass" />
            <span class="tc-status-text">{{ supportStatusText }}</span>
          </div>
        </div>

        <!-- Food Section -->
        <div class="tc-section">
          <div class="tc-section-row">
            <div class="tc-section-title">Food Supply</div>
          </div>
          <div class="tc-stat-grid">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ foodStock }}</span>
              <span class="tc-stat-label">Rations</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ foodPerMinute }}</span>
              <span class="tc-stat-label">Per minute</span>
            </div>
          </div>
          <div class="tc-food-bar-track">
            <div class="tc-food-bar-fill" :style="{ width: foodBarPercent + '%' }" :class="foodBarClass" />
          </div>
          <div class="tc-status-row" :class="foodStatusClass">
            <span class="tc-status-dot" :class="foodStatusClass" />
            <span class="tc-status-text">{{ foodStatusText }}</span>
          </div>
        </div>

        <!-- Job Sites Section (placeholder) -->
        <div class="tc-section">
          <div class="tc-section-row">
            <div class="tc-section-title">Job Sites</div>
            <div class="tc-section-caption">{{ workforceState.assignedWorkers }}/{{ workforceState.availableWorkers }} staffed</div>
          </div>
          <div class="tc-stat-grid tc-stat-grid-3">
            <div class="tc-stat">
              <span class="tc-stat-value">{{ workforceState.availableWorkers }}</span>
              <span class="tc-stat-label">Available</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ workforceState.assignedWorkers }}</span>
              <span class="tc-stat-label">Assigned</span>
            </div>
            <div class="tc-stat">
              <span class="tc-stat-value">{{ workforceState.idleWorkers }}</span>
              <span class="tc-stat-label">Idle</span>
            </div>
          </div>
          <div class="tc-status-row" :class="jobsStatusClass">
            <span class="tc-status-dot" :class="jobsStatusClass" />
            <span class="tc-status-text">{{ jobsStatusText }}</span>
          </div>
          <div v-if="jobSites.length" class="tc-job-list">
            <div
              v-for="site in jobSites"
              :key="site.tileId"
              class="tc-job-site"
            >
              <div class="tc-job-site-top">
                <div>
                  <div class="tc-job-site-name">{{ site.label }}</div>
                  <div class="tc-job-site-meta">{{ site.tileId }}</div>
                </div>
                <div class="tc-job-site-staff">{{ site.assignedWorkers }}/{{ site.slots }}</div>
              </div>
              <div class="tc-job-site-status" :class="site.statusClass">{{ site.statusText }}</div>
            </div>
          </div>
          <p v-else class="tc-placeholder-text">Build a granary, bakery, or lumber camp to create settler jobs.</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue';
import { getBuildingDefinitionByKey } from '../shared/buildings/registry';
import { populationState } from '../store/clientPopulationStore';
import { workforceState } from '../store/clientJobStore';
import { resourceInventory, resourceVersion } from '../store/resourceStore';
import { runSnapshot } from '../store/runStore';
import { isWindowActive, WINDOW_IDS } from '../core/windowManager';
import {
  FOOD_PER_SETTLER_PER_MINUTE,
  HUNGER_GRACE_MINUTES,
} from '../store/populationStore';

interface Props {
  visible: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

function close() {
  emit('close');
}

// --- Colony Progress ---

const exploredTiles = computed(() => {
  return runSnapshot.value?.discoveredTiles ?? 0;
});

const ownedTiles = computed(() => populationState.activeTileCount + populationState.inactiveTileCount);

// --- Population ---

const populationStatusClass = computed(() => {
  if (populationState.hungerMs > 0) return 'tc-status-danger';
  if (populationState.beds <= 0) return 'tc-status-warn';
  if (populationState.current >= populationState.max) return 'tc-status-warn';
  if (populationState.current >= populationState.beds) return 'tc-status-warn';
  return 'tc-status-ok';
});

const populationStatusText = computed(() => {
  if (populationState.hungerMs > 0) {
    const graceMs = HUNGER_GRACE_MINUTES * 60_000;
    const remaining = Math.max(0, graceMs - populationState.hungerMs);
    const remainingSec = Math.ceil(remaining / 1000);
    const min = Math.floor(remainingSec / 60);
    const sec = remainingSec % 60;
    return `Starving — ${min}:${String(sec).padStart(2, '0')} until settler lost`;
  }
  if (populationState.beds <= 0) {
    return 'No beds — build houses to attract settlers';
  }
  if (populationState.current >= populationState.max) {
    return 'At TC capacity — build another town center';
  }
  if (populationState.current >= populationState.beds) {
    return 'All beds full — build houses to grow';
  }
  const effectiveCap = Math.min(populationState.max, populationState.beds);
  const slots = effectiveCap - populationState.current;
  return `Growing — ${slots} bed${slots !== 1 ? 's' : ''} available`;
});

const supportStatusClass = computed(() => {
  if (populationState.pressureState === 'collapsing') return 'tc-status-danger';
  if (populationState.pressureState === 'strained') return 'tc-status-warn';
  return 'tc-status-ok';
});

const supportStatusText = computed(() => {
  switch (populationState.pressureState) {
    case 'collapsing':
      return `Collapsing — ${populationState.inactiveTileCount} tile${populationState.inactiveTileCount === 1 ? '' : 's'} offline`;
    case 'strained':
      return `Strained — fringe tiles are at risk, restore support before expanding again`;
    case 'stable':
    default:
      if (ownedTiles.value <= 0) {
        return 'Stable — claim more territory to build a larger district';
      }
      return `Stable — ${populationState.activeTileCount} of ${ownedTiles.value} owned tiles remain online`;
  }
});

// --- Food ---

const foodStock = computed(() => {
  // Force reactivity on resourceVersion
  void resourceVersion.value;
  return resourceInventory.food ?? 0;
});

const foodPerMinute = computed(() => {
  return populationState.current * FOOD_PER_SETTLER_PER_MINUTE;
});

const minutesOfFood = computed(() => {
  if (foodPerMinute.value <= 0) return Infinity;
  return foodStock.value / foodPerMinute.value;
});

const foodBarPercent = computed(() => {
  // Show bar relative to ~10 minutes of food as "full"
  const target = foodPerMinute.value * 10;
  if (target <= 0) return 100;
  return Math.min(100, (foodStock.value / target) * 100);
});

const foodBarClass = computed(() => {
  if (foodStock.value <= 0) return 'tc-bar-danger';
  if (minutesOfFood.value < 3) return 'tc-bar-danger';
  if (minutesOfFood.value < 5) return 'tc-bar-warn';
  return 'tc-bar-ok';
});

const foodStatusClass = computed(() => {
  if (foodStock.value <= 0) return 'tc-status-danger';
  if (minutesOfFood.value < 3) return 'tc-status-danger';
  if (minutesOfFood.value < 5) return 'tc-status-warn';
  return 'tc-status-ok';
});

const foodStatusText = computed(() => {
  if (populationState.current <= 0) return 'No settlers to feed';
  if (foodStock.value <= 0) return 'No food — settlers are starving!';
  if (minutesOfFood.value === Infinity) return 'No consumption';
  const mins = Math.floor(minutesOfFood.value);
  if (mins < 1) return 'Less than a minute of food left';
  if (mins === 1) return '~1 minute of food remaining';
  return `~${mins} minutes of food remaining`;
});

// --- Jobs ---

const jobSites = computed(() => {
  return workforceState.sites.map((site) => {
    const building = getBuildingDefinitionByKey(site.buildingKey);

    let statusText = 'Ready to work';
    let statusClass = 'tc-job-site-status-ok';
    switch (site.status) {
      case 'offline':
        statusText = 'Offline — reconnect and restore support';
        statusClass = 'tc-job-site-status-danger';
        break;
      case 'unstaffed':
        statusText = 'Unstaffed — waiting for an available settler';
        statusClass = 'tc-job-site-status-warn';
        break;
      case 'missing_input':
        statusText = 'Missing input — supply required resources';
        statusClass = 'tc-job-site-status-warn';
        break;
      case 'storage_full':
        statusText = 'Storage full — clear space in colony stores';
        statusClass = 'tc-job-site-status-danger';
        break;
      case 'staffed':
      default:
        statusText = 'Staffed — production is running';
        statusClass = 'tc-job-site-status-ok';
        break;
    }

    return {
      ...site,
      label: building?.label ?? site.buildingKey,
      statusText,
      statusClass,
    };
  });
});

const jobsStatusClass = computed(() => {
  if (populationState.hungerMs > 0 && workforceState.sites.length > 0) {
    return 'tc-status-danger';
  }
  if (!workforceState.sites.length || workforceState.idleWorkers > 0) {
    return 'tc-status-warn';
  }
  return 'tc-status-ok';
});

const jobsStatusText = computed(() => {
  if (!workforceState.sites.length) {
    return 'No job buildings online yet';
  }
  if (populationState.hungerMs > 0) {
    return 'Hungry settlers abandon their posts until food recovers';
  }
  if (workforceState.availableWorkers <= 0) {
    return 'No housed settlers are available for work';
  }
  if (workforceState.idleWorkers > 0) {
    return `${workforceState.idleWorkers} worker${workforceState.idleWorkers === 1 ? '' : 's'} waiting for more job slots`;
  }
  return 'Every available worker is assigned';
});

// --- Keyboard ---

let listenerActive = false;

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isWindowActive(WINDOW_IDS.TOWN_CENTER_PANEL)) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

watch(() => props.visible, (isVisible) => {
  if (isVisible && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!isVisible && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
});
</script>

<style scoped>
.tc-overlay {
  position: fixed;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 40;
  pointer-events: auto;
}

.tc-panel {
  width: 280px;
  padding: 18px;
  border-radius: 28px;
  max-height: min(70vh, calc(100vh - 32px));
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 32%),
    radial-gradient(circle at 86% 18%, rgba(34, 211, 238, 0.16), transparent 26%),
    linear-gradient(180deg, rgba(7, 12, 24, 0.96), rgba(12, 18, 33, 0.92));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow:
    0 30px 60px rgba(2, 6, 23, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  backdrop-filter: blur(24px);
}

.tc-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 22%),
    linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.14));
  opacity: 0.8;
}

.tc-panel::-webkit-scrollbar {
  width: 8px;
}

.tc-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
}

/* Header */

.tc-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tc-header-copy {
  flex: 1;
}

.tc-kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(252, 211, 77, 0.82);
}

.tc-title {
  margin: 8px 0 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.05;
  color: #f8fafc;
  text-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
}

.tc-close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
  color: rgba(248, 250, 252, 0.9);
  font-size: 14px;
  cursor: pointer;
  transition: transform .15s, border-color .15s, background .15s;
}

.tc-close:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.32);
  background: rgba(15, 23, 42, 0.62);
}

/* Sections */

.tc-section {
  position: relative;
  z-index: 1;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.tc-section-muted {
  opacity: 0.5;
}

.tc-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.tc-section-title {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.72);
}

.tc-section-caption {
  font-size: 10px;
  color: rgba(191, 219, 254, 0.44);
  font-style: italic;
}

/* Stats */

.tc-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.tc-stat-grid-3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.tc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.52);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-stat-value {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  color: #f8fafc;
}

.tc-stat-label {
  font-size: 10px;
  color: rgba(191, 219, 254, 0.56);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Status row */

.tc-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tc-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tc-status-dot.tc-status-ok {
  background: rgba(74, 222, 128, 0.9);
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}

.tc-status-dot.tc-status-warn {
  background: rgba(251, 191, 36, 0.9);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
}

.tc-status-dot.tc-status-danger {
  background: rgba(248, 113, 113, 0.9);
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.4);
  animation: tc-pulse 1.2s ease-in-out infinite;
}

.tc-status-text {
  font-size: 11px;
  line-height: 1.35;
  color: rgba(226, 232, 240, 0.72);
}

/* Food bar */

.tc-food-bar-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.08);
  overflow: hidden;
  margin-bottom: 10px;
}

.tc-food-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.tc-bar-ok {
  background: linear-gradient(90deg, rgba(74, 222, 128, 0.7), rgba(34, 197, 94, 0.9));
}

.tc-bar-warn {
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.7), rgba(245, 158, 11, 0.9));
}

.tc-bar-danger {
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.7), rgba(239, 68, 68, 0.9));
}

.tc-job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.tc-job-site {
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.52);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.tc-job-site-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tc-job-site-name {
  font-size: 12px;
  font-weight: 600;
  color: #f8fafc;
}

.tc-job-site-meta {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(191, 219, 254, 0.44);
}

.tc-job-site-staff {
  font-size: 11px;
  font-weight: 700;
  color: rgba(252, 211, 77, 0.9);
}

.tc-job-site-status {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.35;
}

.tc-job-site-status-ok {
  color: rgba(134, 239, 172, 0.92);
}

.tc-job-site-status-warn {
  color: rgba(253, 224, 71, 0.92);
}

.tc-job-site-status-danger {
  color: rgba(252, 165, 165, 0.94);
}

.tc-placeholder-text {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(226, 232, 240, 0.62);
}

/* Placeholder */

.tc-placeholder-text {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: rgba(191, 219, 254, 0.44);
  font-style: italic;
}

/* Slide transition */

.tc-slide-enter-active,
.tc-slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.tc-slide-enter-from,
.tc-slide-leave-to {
  transform: translateX(-20px) translateY(-50%);
  opacity: 0;
}

.tc-slide-enter-to,
.tc-slide-leave-from {
  transform: translateX(0) translateY(-50%);
  opacity: 1;
}

/* Pulse animation for danger state */

@keyframes tc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
