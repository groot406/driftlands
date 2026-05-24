<template>
  <div v-if="showAlert" class="maintenance-widget">
    <transition name="fade-menu">
      <aside
        v-if="expanded"
        ref="panelEl"
        class="maintenance-alert pointer-events-auto"
        :style="popoverStyle"
        aria-live="polite"
      >
        <div class="maintenance-alert__header">
          <div>
            <p class="maintenance-alert__kicker pixel-font">Maintenance</p>
            <h3 class="maintenance-alert__title">Repairs needed</h3>
          </div>
          <button class="maintenance-alert__close" type="button" title="Close maintenance panel" @click.stop="closeMaintenancePanel">
            &#x2715;
          </button>
        </div>

        <p class="maintenance-alert__copy">{{ summary.statusText }}</p>

        <div class="maintenance-alert__stats">
          <div class="maintenance-alert__stat">
            <span class="maintenance-alert__stat-value">{{ summary.needsRepairCount }}</span>
            <span class="maintenance-alert__stat-label">Sites</span>
          </div>
          <div class="maintenance-alert__stat">
            <span class="maintenance-alert__stat-value">{{ summary.assignedRepairers }}/{{ summary.crewDemand }}</span>
            <span class="maintenance-alert__stat-label">Crews</span>
          </div>
          <div class="maintenance-alert__stat">
            <span class="maintenance-alert__stat-value">{{ summary.averageCondition }}%</span>
            <span class="maintenance-alert__stat-label">Condition</span>
          </div>
        </div>

        <p v-if="topShortfall" class="maintenance-alert__note">
          Backlog needs {{ formatAmount(topShortfall.amount) }} {{ formatResourceType(topShortfall.type) }}
          <span v-if="topShortfall.shortfall > 0"> · short {{ formatAmount(topShortfall.shortfall) }}</span>
        </p>
        <p v-else class="maintenance-alert__note">
          Repair crews pull wood, and stone for masonry buildings, from colony storage automatically.
        </p>
      </aside>
    </transition>

    <button
      class="maintenance-toggle-btn"
      :class="{ 'maintenance-toggle-btn--active': expanded, 'maintenance-toggle-btn--danger': summary.offlineCount > 0 || summary.damagedCount > 0 }"
      type="button"
      :aria-expanded="expanded"
      :aria-label="`Maintenance: ${summary.statusText}`"
      :title="`Maintenance: ${summary.statusText}`"
      @click.stop="toggleMaintenancePanel"
    >
      <svg class="maintenance-toggle-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4" />
        <path d="M15 5l4 4" />
      </svg>
      <span class="maintenance-toggle-btn__badge" :class="badgeClass">{{ counterLabel }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tileIndex, worldVersion } from '../core/world';
import { settlers } from '../store/settlerStore';
import { getSettlementResourceInventory, resourceInventory, resourceVersion } from '../store/resourceStore';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { getMaintenanceOverview } from '../shared/buildings/maintenanceDetails.ts';
import { formatResourceType } from '../shared/buildings/jobSiteDetails.ts';
import { activeToolbarPanel, closeToolbarPanel, openToolbarPanel } from '../store/toolbarPanelStore.ts';
import { useToolbarPopoverPosition } from '../composables/useToolbarPopoverPosition.ts';

const expanded = ref(false);
const panelEl = ref<HTMLElement | null>(null);
const { popoverStyle } = useToolbarPopoverPosition({
  isOpen: expanded,
  panel: panelEl,
});

function formatAmount(value: number) {
  return `${Math.floor(value)}`;
}

const summary = computed(() => {
  void resourceVersion.value;
  void worldVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  const playerTiles = Object.values(tileIndex)
    .filter((tile) => !settlementId || tile.ownerSettlementId === settlementId || tile.controlledBySettlementId === settlementId);
  const playerSettlers = settlementId
    ? settlers.filter((settler) => settler.settlementId === settlementId)
    : settlers;
  const playerInventory = settlementId
    ? getSettlementResourceInventory(settlementId)
    : resourceInventory;

  return getMaintenanceOverview(playerTiles, playerSettlers, playerInventory);
});

const showAlert = computed(() => summary.value.needsRepairCount > 0);
const topShortfall = computed(() => summary.value.backlogResources[0] ?? null);
const counterLabel = computed(() => {
  if (summary.value.offlineCount > 0) {
    return `${summary.value.offlineCount}`;
  }
  if (summary.value.damagedCount > 0) {
    return `${summary.value.damagedCount}`;
  }
  return `${summary.value.needsRepairCount}`;
});
const badgeClass = computed(() => {
  if (summary.value.offlineCount > 0) return 'maintenance-alert__badge--danger';
  if (summary.value.damagedCount > 0) return 'maintenance-alert__badge--danger';
  return 'maintenance-alert__badge--warn';
});

function toggleMaintenancePanel() {
  if (expanded.value) {
    closeMaintenancePanel();
  } else {
    openToolbarPanel('maintenance');
    expanded.value = true;
  }
}

function closeMaintenancePanel() {
  expanded.value = false;
  closeToolbarPanel('maintenance');
}

watch(showAlert, (visible) => {
  if (!visible) {
    closeMaintenancePanel();
  }
});

watch(activeToolbarPanel, (panel) => {
  if (panel !== 'maintenance' && expanded.value) {
    expanded.value = false;
  }
});
</script>

<style scoped>
.maintenance-widget {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
}

.maintenance-toggle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.18), transparent 44%),
    rgba(2, 6, 23, 0.78);
  color: rgb(253 230 138);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.maintenance-toggle-btn:hover,
.maintenance-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(245, 158, 11, 0.48);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.28), transparent 44%),
    rgba(15, 23, 42, 0.92);
}

.maintenance-toggle-btn--danger {
  border-color: rgba(248, 113, 113, 0.34);
  color: rgb(254 202 202);
}

.maintenance-toggle-btn__icon {
  width: 18px;
  height: 18px;
}

.maintenance-toggle-btn__badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  color: rgb(17 24 39);
}

.maintenance-alert {
  position: fixed;
  z-index: 60;
  width: min(320px, calc(100vw - 32px));
  padding: 14px 16px;
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 22px;
  background:
    radial-gradient(circle at top left, rgba(248, 113, 113, 0.16), transparent 36%),
    radial-gradient(circle at 85% 20%, rgba(34, 211, 238, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(16, 24, 39, 0.92), rgba(15, 23, 42, 0.9));
  box-shadow: 0 20px 38px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(18px);
  color: rgb(248 250 252);
}

.maintenance-alert__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.maintenance-alert__kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(253, 186, 116, 0.9);
}

.maintenance-alert__title {
  margin: 6px 0 0;
  font-size: 1rem;
  font-weight: 700;
  color: #f8fafc;
}

.maintenance-alert__badge {
  background: rgb(245 158 11);
}

.maintenance-alert__badge--warn {
  background: rgb(245 158 11);
}

.maintenance-alert__badge--danger {
  background: rgb(248 113 113);
}

.maintenance-alert__close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.5);
  color: rgba(248, 250, 252, 0.86);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.maintenance-alert__close:hover {
  border-color: rgba(245, 158, 11, 0.32);
  background: rgba(15, 23, 42, 0.68);
  color: rgb(254 243 199);
}

.maintenance-alert__copy {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(226, 232, 240, 0.92);
}

.maintenance-alert__stats {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.maintenance-alert__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.44);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.maintenance-alert__stat-value {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
}

.maintenance-alert__stat-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.82);
}

.maintenance-alert__note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(191, 219, 254, 0.82);
}
@media (max-width: 640px) {
  .maintenance-alert {
    width: min(300px, calc(100vw - 24px));
  }
}
</style>
