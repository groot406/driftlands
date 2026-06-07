<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen" class="population-modal-backdrop smooth-modal-backdrop" @click.self="close">
      <PanelModalShell
        class="population-modal-panel"
        close-aria-label="Close settler overview"
        header-label="Population"
        header-title="Settler Overview"
        header-icon="⌂"
        @close="close"
      >
        <div class="population-modal-content">
          <section class="population-section">
            <div class="population-stat-grid">
              <PanelStatCard label="Population" :value="`${playerPopulation.current}/${playerPopulation.max}`" :icon-style="settlerIconStyle('status')" />
              <PanelStatCard label="Beds" :value="playerPopulation.beds" :icon-style="settlerIconStyle('home')" />
              <PanelStatCard label="Meals" :value="mealStockLabel" :icon-style="settlerIconStyle('food')" />
              <PanelStatCard label="Food Use" :value="foodUseLabel" :icon-style="settlerIconStyle('work')" />
              <PanelStatCard label="Morale" :value="moraleLabel" :icon-style="settlerIconStyle('happiness')" />
            </div>
            <p v-if="hungerWarningText" class="population-warning">{{ hungerWarningText }}</p>
            <p v-if="moraleWarningText" class="population-warning">{{ moraleWarningText }}</p>
          </section>

          <section class="population-section population-section--settlers">
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
                <PanelPortraitFrame class="population-portrait" :image-style="portraitStyle(settler)" glow="none" />
                <div class="population-settler-copy">
                  <p class="population-settler-name">{{ getSettlerName(settler) }}</p>
                  <p class="population-settler-meta">{{ formatActivity(settler.activity) }} · {{ getSettlerLocation(settler) }}</p>
                </div>
                <span class="population-status" :class="`population-status--${getStatusTone(settler)}`">
                  <span aria-hidden="true"></span>
                  {{ getStatusLabel(settler) }}
                </span>
                <span class="population-chip">{{ getIssueLabel(settler) }}</span>
              </button>
            </div>
            <p v-else class="population-empty">No settlers available.</p>
          </section>
        </div>
      </PanelModalShell>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import type { Settler } from '../core/types/Settler.ts';
import { tileIndex } from '../core/world.ts';
import { getSettlerDisplayName } from '../shared/game/settlerNames.ts';
import { formatSettlerBlocker } from '../shared/game/settlerBlockers.ts';
import PanelModalShell from './ui/PanelModalShell.vue';
import PanelStatCard from './ui/PanelStatCard.vue';
import PanelPortraitFrame from './ui/PanelPortraitFrame.vue';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry.ts';
import { populationState } from '../store/clientPopulationStore';
import { FOOD_PER_SETTLER_PER_MINUTE } from '../store/populationStore';
import { getSettlementResourceInventory, resourceInventory, resourceVersion } from '../store/resourceStore';
import { getHungerFoodMealValue } from '../shared/game/resourceDefinitions.ts';
import { settlers as settlerState } from '../store/settlerStore';
import { closePopulationModal, openSettlerModal } from '../store/uiStore';
import { isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { getSettlerSpriteKey, type SettlerSpriteKey } from '../core/settlerSprite.ts';
import settlerPortraitAtlasUrl from '../assets/ui/settlers/settler-portraits-atlas.png';
import settlerIconAtlasUrl from '../assets/ui/settler-modal/icon-atlas.png';

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.POPULATION_MODAL));
const playerPopulation = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId
    ? populationState.settlements.find((settlement) => settlement.settlementId === settlementId) ?? populationState
    : populationState;
});
const settlers = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId
    ? settlerState.filter((settler) => settler.settlementId === settlementId)
    : [...settlerState];
});
const playerInventory = computed(() => {
  resourceVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? getSettlementResourceInventory(settlementId) : resourceInventory;
});
const edibleMealValue = computed(() => Math.floor(getHungerFoodMealValue(playerInventory.value)));
const mealStockLabel = computed(() => `${edibleMealValue.value}`);
const foodUseLabel = computed(() => `${playerPopulation.value.current * FOOD_PER_SETTLER_PER_MINUTE}/min`);
const averageHappiness = computed(() => {
  if (settlers.value.length === 0) return 100;
  const total = settlers.value.reduce((sum, settler) => sum + Math.max(0, Math.min(100, settler.happiness ?? 100)), 0);
  return Math.round(total / settlers.value.length);
});
const lowHappinessCount = computed(() => settlers.value.filter((settler) => (settler.happiness ?? 100) <= 45).length);
const moraleLabel = computed(() => `${averageHappiness.value}%`);
const hungerWarningText = computed(() => {
  if (playerPopulation.value.hungerMs <= 0) return '';
  return `Hunger risk is active for ${formatHungerDuration(playerPopulation.value.hungerMs)}. Settlers need reachable bread, meat, or fish; drinks and crops do not prevent hunger.`;
});
const moraleWarningText = computed(() => {
  if (lowHappinessCount.value <= 0) return '';
  const countLabel = `${lowHappinessCount.value} settler${lowHappinessCount.value === 1 ? '' : 's'}`;
  return `${countLabel} need a morale lift. Keep pubs stocked with beer or wine, bring trade goods to shops, or improve houses for steady comfort.`;
});

type SettlerOverviewIcon = 'home' | 'work' | 'status' | 'food' | 'happiness';

const iconPositions: Record<SettlerOverviewIcon, string> = {
  home: '0% 0%',
  work: '33.333% 0%',
  status: '0% 100%',
  food: '33.333% 100%',
  happiness: '100% 100%',
};

const portraitAtlasPositions: Record<SettlerSpriteKey, string> = {
  default: '0% 50%',
  female_braid: '25% 50%',
  female_bright: '50% 50%',
  copper_jacket: '75% 50%',
  headband_worker: '100% 50%',
};

function settlerIconStyle(icon: SettlerOverviewIcon) {
  return {
    backgroundImage: `url(${settlerIconAtlasUrl})`,
    backgroundPosition: iconPositions[icon],
  };
}

function portraitStyle(settler: Settler) {
  return {
    backgroundImage: `url(${settlerPortraitAtlasUrl})`,
    backgroundPosition: portraitAtlasPositions[getSettlerSpriteKey(settler)],
  };
}

function formatActivity(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatHungerDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getSettlerName(settler: Settler) {
  return getSettlerDisplayName(settler.id, settler.nameSeed, settler.gender);
}

function getTileLabel(tileId: string | null | undefined) {
  if (!tileId) return 'Unassigned';
  const tile = tileIndex[tileId];
  if (!tile) return 'Unknown place';
  if (tile.terrain === 'towncenter') return 'Town Center';
  const building = getBuildingDefinitionForTile(tile);
  return building?.label ?? tile.terrain?.replace(/_/g, ' ') ?? 'Unknown place';
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
  return `${Math.floor(settler.carryingPayload.amount)} ${settler.carryingPayload.type.replace(/_/g, ' ')}`;
}

function getStatusLabel(settler: Settler) {
  if (settler.blockerReason) return 'Blocked';
  if (settler.activity === 'working' || settler.activity === 'repairing') return 'Working';
  if (settler.activity === 'commuting_home' || settler.activity === 'commuting_work' || settler.activity === 'commuting_social' || settler.activity === 'commuting_shop') return 'Commuting';
  if (settler.activity === 'shopping') return 'Shopping';
  if (settler.activity === 'waiting' || settler.activity === 'idle') return 'Waiting';
  return formatActivity(settler.activity);
}

function getStatusTone(settler: Settler) {
  if (settler.blockerReason) return 'danger';
  if (settler.activity === 'working' || settler.activity === 'repairing') return 'good';
  if (settler.activity === 'commuting_home' || settler.activity === 'commuting_work' || settler.activity === 'commuting_social' || settler.activity === 'commuting_shop') return 'travel';
  if (settler.activity === 'shopping') return 'good';
  if (settler.activity === 'waiting' || settler.activity === 'idle') return 'warn';
  return 'muted';
}

function getIssueLabel(settler: Settler) {
  const blocker = formatSettlerBlocker(settler.blockerReason);
  if (blocker) return blocker;
  return getCargoLabel(settler) === 'Empty' ? 'No issues' : getCargoLabel(settler);
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
  padding: 24px;
  background:
    radial-gradient(circle at 22% 45%, rgb(80 80 80 / 0.22), transparent 23rem),
    rgba(1, 5, 12, 0.78);
  backdrop-filter: blur(4px) saturate(0.86) brightness(0.8);
}

.population-modal-panel {
  position: relative;
  box-sizing: border-box;
  width: min(49rem, calc(100vw - 32px));
  max-height: min(90vh, 44rem);
  display: flex;
  overflow: hidden;
  padding: 1.25rem 1.35rem 1.1rem;
  flex-direction: column;
  --panel-header-margin: -1.25rem -1.35rem 0;
  --panel-header-padding: 1.05rem 3.7rem 0.8rem 5.1rem;
  --panel-header-banner-top: 0.2rem;
  --panel-header-banner-left: 1rem;
  --panel-header-banner-width: 3.35rem;
  --panel-header-banner-height: 5.25rem;
  --panel-header-title-size: clamp(1.72rem, 3vw, 2.1rem);
  border: 16px solid transparent;
  border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 30px stretch;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, #121619 0%, #0a0d10 100%);
  color: #f3e4c9;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.66), inset 0 0 64px rgba(0, 0, 0, 0.82);
}

.population-banner-tab {
  position: absolute;
  top: 0.2rem;
  left: 1rem;
  z-index: 3;
  width: 3.35rem;
  height: 5.25rem;
}

.population-modal-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.population-modal-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  padding: 0.2rem 3.25rem 0.9rem 3.55rem;
  border-bottom: 1px solid rgba(170, 113, 52, 0.48);
}

.population-modal-kicker {
  margin: 0 0 0.26rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c99a4b;
  text-shadow: 0 1px 0 #070706;
}

.population-modal-title,
.population-modal-subtitle,
.population-section-title,
.population-settler-name,
.population-settler-meta,
.population-empty {
  margin: 0;
}

.population-modal-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.55rem, 3vw, 1.95rem);
  line-height: 1.08;
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807;
}

.population-modal-subtitle {
  margin-top: 0.28rem;
  font-family: Georgia, 'Times New Roman', serif;
  color: #d6aa48;
  font-size: 0.92rem;
}

.population-section {
  margin-top: 0.72rem;
}

.population-stat-grid {
  display: grid;
  gap: 0.45rem;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.population-warning {
  margin: 0.72rem 0 0;
  border: 1px solid rgba(239, 184, 82, 0.36);
  border-radius: 7px;
  background: rgba(109, 61, 18, 0.25);
  padding: 0.62rem 0.75rem;
  color: #f4d194;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.88rem;
  line-height: 1.35;
}

.population-section-title,
.population-empty {
  font-family: Georgia, 'Times New Roman', serif;
}

.population-section-title {
  font-size: 0.95rem;
  color: #f3dfb9;
}

.population-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 0.42rem;
  flex-shrink: 0;
  padding: 0 0.1rem;
}

.population-section--settlers {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.population-chip {
  min-width: 6.8rem;
  border: 1px solid rgba(130, 88, 43, 0.34);
  background: rgba(8, 9, 10, 0.34);
  padding: 0.35rem 0.55rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.76rem;
  color: #d9c69d;
  text-align: center;
}

.population-settler-list {
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 0.38rem;
  flex: 1;
  overflow-y: auto;
  min-height: 0;

  overscroll-behavior: contain;

}

.population-settler-row {
  appearance: none;
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr) 7rem 8.4rem;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  min-height: 3.65rem;
  padding: 0.34rem 0.55rem;
  border: 1px solid rgba(130, 88, 43, 0.28);
  background:
    linear-gradient(90deg, rgba(65, 45, 26, 0.18), rgba(15, 17, 18, 0.34)),
    rgba(13, 15, 16, 0.54);
  box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.38);
  text-align: left;
  color: inherit;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease;
}

.population-settler-row:last-child {
  border-bottom: 1px solid rgba(130, 88, 43, 0.28);
}

.population-portrait {
  width: 2.35rem;
  height: 2.8rem;
  margin: 0;
  border-width: 5px;
  border-image-width: 5px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.58));
}

.population-settler-copy {
  min-width: 0;
}

.population-settler-name {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.93rem;
  color: #fff0d2;
  line-height: 1.2;
}

.population-settler-meta {
  margin-top: 0.15rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.77rem;
  line-height: 1.35;
  color: #c9b894;
}

.population-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.82rem;
  color: #d9c69d;
}

.population-status span {
  width: 0.55rem;
  height: 0.55rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #9a8b70;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.55);
}

.population-status--good span {
  background: #5fb940;
}

.population-status--warn span {
  background: #c8922f;
}

.population-status--travel span {
  background: #5b9fbd;
}

.population-status--danger span {
  background: #bd463c;
}

.population-settler-row:hover {
  border-color: rgba(170, 113, 52, 0.36);
  background:
    linear-gradient(90deg, rgba(86, 59, 33, 0.22), rgba(18, 20, 20, 0.38)),
    rgba(16, 18, 18, 0.62);
}

@media (max-width: 720px) {
  .population-modal-backdrop {
    padding: 0;
  }

  .population-modal-panel {
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
  }

  .population-modal-header {
    padding-left: 3rem;
  }

  .population-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .population-settler-row {
    grid-template-columns: 2.25rem minmax(0, 1fr) minmax(4.3rem, auto);
    grid-template-areas:
      "portrait copy issue"
      "portrait status issue";
    align-items: center;
    min-height: 3.2rem;
    max-height: 4rem;
    gap: 0.25rem 0.45rem;
    padding: 0.28rem 0.42rem;
  }

  .population-portrait {
    grid-area: portrait;
    width: 2.05rem;
    height: 2.45rem;
    border-width: 4px;
    border-image-width: 4px;
  }

  .population-settler-copy {
    grid-area: copy;
  }

  .population-settler-name {
    font-size: 0.84rem;
  }

  .population-settler-meta {
    margin-top: 0.08rem;
    font-size: 0.68rem;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .population-status {
    grid-area: status;
    font-size: 0.68rem;
    line-height: 1.1;
    white-space: nowrap;
  }

  .population-chip {
    grid-area: issue;
    justify-self: end;
    min-width: 0;
    padding: 0.22rem 0.38rem;
    font-size: 0.66rem;
    line-height: 1.05;
    white-space: nowrap;
  }
}
</style>
