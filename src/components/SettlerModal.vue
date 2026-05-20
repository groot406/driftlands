<template>
  <Transition name="smooth-modal" appear>
    <div v-if="isOpen && settler" class="settler-modal-backdrop smooth-modal-backdrop" @click.self="close">
      <PanelModalShell
        class="settler-modal-panel"
        close-aria-label="Close settler details"
        header-label="Settler"
        :header-title="settlerName"
        header-icon="⌂"
        @close="close"
      >
        <aside class="settler-left-rail">
          <PanelPortraitFrame class="settler-portrait-frame" :image-style="portraitStyle" glow="purple" />
          <PanelIconBanner class="settler-badge" icon="★" color="purple" size="badge" />
          <blockquote class="settler-paper-note">
            “{{ personalNote }}”
          </blockquote>
          <div class="settler-props" aria-hidden="true">
            <img class="settler-candle" :src="candleUrl" alt="" />
            <img class="settler-mug" :src="mugUrl" alt="" />
          </div>
        </aside>

        <main class="settler-main">
          <section class="settler-pill-row" aria-label="Settler status">
            <span
              v-for="badge in statBadges"
              :key="badge.label"
              class="settler-pill"
              :class="[
                `settler-pill-${badge.kind}`,
                `settler-pill-${badge.icon}`,
                { 'settler-pill-alert': badge.alert },
              ]"
            >
              <span class="settler-pill-icon" :style="settlerIconStyle(badge.icon)" aria-hidden="true"></span>
              {{ badge.label }}
            </span>
          </section>

          <section class="settler-ledger">
            <div class="settler-grid">
            <div class="settler-info-panel settler-info-panel-home">
              <span class="settler-info-icon" :style="settlerIconStyle('home')" aria-hidden="true"></span>
              <div>
                <p class="settler-card-label">Home</p>
                <p class="settler-card-value">{{ homeLabel }}</p>
                <p class="settler-card-meta">{{ accessLabel }}</p>
              </div>
            </div>

            <div class="settler-info-panel settler-info-panel-work">
              <span class="settler-info-icon" :style="settlerIconStyle('work')" aria-hidden="true"></span>
              <div>
                <p class="settler-card-label">Work</p>
                <p class="settler-card-value">{{ workLabel }}</p>
                <p class="settler-card-meta">{{ workProgressLabel }}</p>
                <div class="settler-progress" aria-hidden="true">
                  <span :style="{ width: `${workProgressPercent}%` }"></span>
                </div>
              </div>
            </div>

            <div class="settler-info-panel settler-info-panel-cargo">
              <span class="settler-info-icon" :style="settlerIconStyle('cargo')" aria-hidden="true"></span>
              <div>
                <p class="settler-card-label">Cargo</p>
                <p class="settler-card-value">{{ carryingLabel }}</p>
                <p class="settler-card-meta">{{ movementLabel }}</p>
              </div>
            </div>

            <div class="settler-info-panel settler-info-panel-position">
              <span class="settler-info-icon" :style="settlerIconStyle('position')" aria-hidden="true"></span>
              <div>
                <p class="settler-card-label">Position</p>
                <p class="settler-card-value">{{ positionLabel }}</p>
                <p class="settler-card-meta">{{ facingLabel }}</p>
              </div>
            </div>

            <div class="settler-info-panel settler-info-panel-trait">
              <span class="settler-info-icon" :style="settlerIconStyle('trait')" aria-hidden="true"></span>
              <div>
                <p class="settler-card-label">Trait</p>
                <p class="settler-card-value">{{ traitLabels.join(', ') }}</p>
                <p class="settler-card-meta">{{ traitDescription }}</p>
              </div>
            </div>

            <div class="settler-info-panel settler-info-panel-drink">
              <span class="settler-info-icon" :style="settlerIconStyle(drinkIconKey)" aria-hidden="true"></span>
              <div>
                <p class="settler-card-label">Preferred drink</p>
                <p class="settler-card-value">{{ drinkPreferenceLabel }}</p>
                <p class="settler-card-meta">{{ drinkDescription }}</p>
              </div>
            </div>
            </div>

            <section class="settler-thought-panel">
              <span class="settler-thought-icon" :style="settlerIconStyle('thought')" aria-hidden="true"></span>
              <div class="settler-thought-copy">
                <p class="settler-card-label">{{ routineTitle }}</p>
                <p class="settler-thought-text">{{ routineSummary }}</p>
              </div>
              <img class="settler-thought-building" :src="thoughtBuildingUrl" alt="" />
            </section>
          </section>
        </main>
      </PanelModalShell>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { getSettlerSpriteKey, type SettlerSpriteKey } from '../core/settlerSprite';
import { tileIndex } from '../core/world';
import { getSettlerDisplayName } from '../shared/game/settlerNames.ts';
import { getDrinkPreferenceLabel, getSettlerTraitLabel, normalizeDrinkPreference, normalizeSettlerTraits } from '../shared/game/settlerPreferences.ts';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry';
import { closeWindow, isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';
import { closeSettlerModal, getSelectedSettler } from '../store/uiStore';
import PanelModalShell from './ui/PanelModalShell.vue';
import PanelIconBanner from './ui/PanelIconBanner.vue';
import PanelPortraitFrame from './ui/PanelPortraitFrame.vue';
import settlerPortraitAtlasUrl from '../assets/ui/settlers/settler-portraits-atlas.png';
import settlerIconAtlasUrl from '../assets/ui/settler-modal/icon-atlas.png';
import thoughtBuildingUrl from '../assets/tiles/towncenter.png';
import candleUrl from '../assets/ui/settler-modal/candle.png';
import mugUrl from '../assets/ui/settler-modal/mug.png';

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.SETTLER_MODAL));
const settler = computed(() => getSelectedSettler());

const TIRED_MS = 3 * 60_000;

const portraitAtlasPositions: Record<SettlerSpriteKey, string> = {
  default: '0% 50%',
  female_braid: '25% 50%',
  female_bright: '50% 50%',
  copper_jacket: '75% 50%',
  headband_worker: '100% 50%',
};

type SettlerModalIcon =
  | 'home'
  | 'work'
  | 'cargo'
  | 'position'
  | 'trait'
  | 'beer'
  | 'wine'
  | 'thought'
  | 'status'
  | 'food'
  | 'energy'
  | 'happiness';

const settlerIconPositions: Record<SettlerModalIcon, string> = {
  home: '0% 0%',
  work: '33.333% 0%',
  cargo: '66.666% 0%',
  position: '100% 0%',
  trait: '0% 50%',
  beer: '33.333% 50%',
  wine: '66.666% 50%',
  thought: '100% 50%',
  status: '0% 100%',
  food: '33.333% 100%',
  energy: '66.666% 100%',
  happiness: '100% 100%',
};

function settlerIconStyle(icon: SettlerModalIcon) {
  return {
    backgroundImage: `url(${settlerIconAtlasUrl})`,
    backgroundPosition: settlerIconPositions[icon],
  };
}

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

  return tile.terrain ? formatTitleCase(tile.terrain) : 'Unknown place';
}

const settlerName = computed(() => {
  const currentSettler = settler.value;
  return currentSettler
    ? getSettlerDisplayName(currentSettler.id, currentSettler.nameSeed, currentSettler.gender)
    : getSettlerDisplayName('Settler');
});

const activityLabel = computed(() => settler.value ? formatTitleCase(settler.value.activity) : 'Unknown');
const homeLabel = computed(() => formatTileLabel(settler.value?.homeTileId));
const workLabel = computed(() => formatTileLabel(settler.value?.workTileId ?? settler.value?.assignedWorkTileId));
const accessLabel = computed(() => `Access via ${formatTileLabel(settler.value?.homeAccessTileId)}`);
const portraitStyle = computed(() => {
  const currentSettler = settler.value;
  const spriteKey = currentSettler ? getSettlerSpriteKey(currentSettler) : 'default';
  return {
    backgroundImage: `url(${settlerPortraitAtlasUrl})`,
    backgroundPosition: portraitAtlasPositions[spriteKey],
  };
});

const foodLevel = computed(() => {
  const hungerMs = settler.value?.hungerMs ?? 0;
  return Math.max(0, Math.min(100, Math.round(100 - ((hungerMs / (3 * 60_000)) * 100))));
});
const energyLevel = computed(() => {
  const fatigueMs = settler.value?.fatigueMs ?? 0;
  return Math.max(0, Math.min(100, Math.round(100 - ((fatigueMs / TIRED_MS) * 100))));
});
const happinessLevel = computed(() => Math.max(0, Math.min(100, Math.round(settler.value?.happiness ?? 100))));
const traitLabels = computed(() => normalizeSettlerTraits(settler.value ?? {
  id: 'settler-preview',
  appearanceSeed: 1,
}).map(getSettlerTraitLabel));
const drinkPreferenceLabel = computed(() => getDrinkPreferenceLabel(normalizeDrinkPreference(settler.value ?? {
  id: 'settler-preview',
  appearanceSeed: 1,
})));

const primaryTrait = computed(() => normalizeSettlerTraits(settler.value ?? {
  id: 'settler-preview',
  appearanceSeed: 1,
})[0] ?? 'long_worker');

const drinkPreference = computed(() => normalizeDrinkPreference(settler.value ?? {
  id: 'settler-preview',
  appearanceSeed: 1,
}));

const facingLabel = computed(() => `Facing ${settler.value?.facing ?? 'down'}`);
const drinkIconKey = computed<SettlerModalIcon>(() => {
  switch (drinkPreference.value) {
    case 'beer':
      return 'beer';
    case 'wine':
      return 'wine';
    default:
      return 'beer';
  }
});

const personalNote = computed(() => {
  const currentSettler = settler.value;
  const place = currentSettler?.activity === 'sleeping' ? homeLabel.value : (workLabel.value !== 'None assigned' ? workLabel.value : homeLabel.value);
  if (settler.value?.activity === 'sleeping') {
    return `A quiet night inside ${homeLabel.value}. Let the colony wait until morning.`;
  }
  if (settler.value?.activity === 'socializing') {
    return `${drinkPreferenceLabel.value} in the cup, familiar faces nearby. That will do.`;
  }
  if (settler.value?.activity === 'shopping') {
    return `A small imported comfort from the Shop makes the next shift easier to face.`;
  }
  if (foodLevel.value <= 35) {
    return `The work at ${place} can wait a moment. Supper cannot.`;
  }
  if (energyLevel.value <= 25) {
    return `The road from ${place} feels longer when the bones are tired.`;
  }
  if (currentSettler?.assignedWorkTileId) {
    return `A fair shift at ${workLabel.value}, food enough, and ${homeLabel.value} waiting nearby.`;
  }
  return `A place at ${homeLabel.value}, a warm meal, and a useful task when the colony calls.`;
});

const routineTitle = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler) {
    return 'Routine';
  }
  if (currentSettler.blockerReason) {
    return 'Blocked';
  }
  if (foodLevel.value <= 35 || energyLevel.value <= 25 || happinessLevel.value <= 35) {
    return 'Needs attention';
  }
  if (currentSettler.activity === 'working' || currentSettler.activity === 'repairing') {
    return workProgressPercent.value >= 80 ? 'Nearly done' : 'On shift';
  }
  if (currentSettler.activity === 'commuting_home' || currentSettler.activity === 'commuting_work' || currentSettler.activity === 'commuting_social' || currentSettler.activity === 'commuting_shop') {
    return 'On the road';
  }
  if (currentSettler.activity === 'waiting' || currentSettler.activity === 'idle') {
    return 'Awaiting orders';
  }
  return 'Routine';
});

const routineSummary = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler) {
    return 'Waiting for the settlement ledger to catch up.';
  }
  if (foodLevel.value <= 35) {
    return `Food is the priority. Send ${settlerName.value.split(' ')[0]} toward stores before the next long shift.`;
  }
  if (energyLevel.value <= 25) {
    return `Finish the immediate errand, then route back to ${homeLabel.value} before fatigue breaks the pace.`;
  }
  if (happinessLevel.value <= 35) {
    return `A pub visit or a small import from the Shop would help steady the mood after this job.`;
  }
  if (currentSettler.blockerReason) {
    switch (currentSettler.blockerReason.code) {
      case 'missing_input':
        return `${formatTitleCase(currentSettler.blockerReason.resourceType ?? 'supplies')} must reach ${workLabel.value} before this shift can continue.`;
      case 'missing_repair_material':
        return `${formatTitleCase(currentSettler.blockerReason.resourceType ?? 'materials')} is needed before repairs can move again.`;
      case 'storage_full':
        return 'Storage is full. Clear room before assigning more hauling.';
      case 'path_blocked':
        return `The route to ${positionLabel.value.replace(/^Near /, '')} is blocked; roads or terrain need attention.`;
      case 'site_offline':
        return `${workLabel.value} is offline. Bring it back before calling workers over.`;
      case 'site_paused':
        return `${workLabel.value} is paused, so this settler will wait for another useful order.`;
      case 'resource_depleted':
        return `${workLabel.value} is out of usable resources. The next task should move elsewhere.`;
      case 'no_work':
        return 'No useful work is assigned yet. A job site or repair order will pull them back in.';
      default:
        return 'Something is holding up the routine. Check the assigned site.';
    }
  }
  if (currentSettler.activity === 'fetching_food') {
    return 'Heading for food now; work can resume once the hunger meter settles.';
  }
  if (currentSettler.activity === 'commuting_home') {
    return `Returning to ${homeLabel.value}. Rest or social time is likely next.`;
  }
  if (currentSettler.activity === 'commuting_work') {
    return `Heading to ${workLabel.value}. The assigned shift starts when they arrive.`;
  }
  if (currentSettler.activity === 'commuting_shop') {
    return `Heading to ${formatTileLabel(currentSettler.socialTileId)} for imported goods.`;
  }
  if (currentSettler.activity === 'working' || currentSettler.activity === 'repairing') {
    if (workProgressPercent.value >= 80) {
      return `${workLabel.value} is almost through this cycle. Expect output, cargo, or a short break next.`;
    }
    return `Settled into ${workLabel.value}; keep the route clear and supplies moving.`;
  }
  if (currentSettler.activity === 'delivering') {
    return carryingLabel.value === 'Empty handed' ? 'Delivery is done; returning to the next assignment.' : `Carrying ${carryingLabel.value.toLowerCase()} toward the next handoff.`;
  }
  if (currentSettler.activity === 'socializing') {
    return `${drinkPreferenceLabel.value} and company are restoring morale for the next workday.`;
  }
  if (currentSettler.activity === 'shopping') {
    return 'Browsing imported goods; the purchase should lift morale for the next routine.';
  }
  if (currentSettler.activity === 'sleeping') {
    return `Resting at ${homeLabel.value}; energy will decide when the day starts again.`;
  }
  if (currentSettler.activity === 'waiting') {
    return 'Ready for work. Assign a job, repair, or guard post to bring them back into the chain.';
  }
  return `${activityLabel.value} near ${positionLabel.value.replace(/^Near /, '')}; no urgent needs right now.`;
});

const statBadges = computed(() => [
  {
    kind: 'activity',
    label: activityLabel.value,
    icon: 'status' as SettlerModalIcon,
    alert: false,
  },
  {
    kind: 'meter',
    label: `Food ${foodLevel.value}`,
    icon: 'food' as SettlerModalIcon,
    alert: foodLevel.value <= 35,
  },
  {
    kind: 'meter',
    label: `Energy ${energyLevel.value}`,
    icon: 'energy' as SettlerModalIcon,
    alert: energyLevel.value <= 25,
  },
  {
    kind: 'meter',
    label: `Happiness ${happinessLevel.value}`,
    icon: 'happiness' as SettlerModalIcon,
    alert: happinessLevel.value <= 45,
  },
]);

const traitDescription = computed(() => {
  switch (primaryTrait.value) {
    case 'long_worker':
      return 'Keeps longer shifts before fatigue sets in.';
    case 'short_worker':
      return 'Prefers shorter shifts and tires sooner.';
    case 'light_sleeper':
      return 'Rises sooner, but needs rest more often.';
    case 'heavy_sleeper':
      return 'Sleeps deep and wakes slower.';
    case 'social':
      return 'Gains more from tavern time and company.';
    case 'independent':
      return 'Handles quiet routines with less fuss.';
    case 'easy_to_please':
      return 'Small comforts lift their mood quickly.';
    case 'hard_to_please':
      return 'Needs better conditions to stay cheerful.';
    case 'big_eater':
      return 'Burns through food faster than most.';
    case 'small_eater':
      return 'Stretches food supplies a little further.';
    case 'shopper':
      return 'Seeks out imported comforts sooner than most.';
    case 'frugal':
      return 'Waits longer before spending on luxuries.';
    default:
      return 'Their routine shapes the colony day.';
  }
});

const drinkDescription = computed(() => {
  switch (drinkPreference.value) {
    case 'beer':
      return 'Chooses beer first when the pub is stocked.';
    case 'wine':
      return 'Chooses wine first when the pub is stocked.';
    default:
      return 'Happy with either drink when served.';
  }
});

const workProgressLabel = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler?.assignedWorkTileId) {
    return 'No active work cycle';
  }

  if (currentSettler.assignedRole === 'guard') {
    return 'Garrisoned at assigned tower';
  }

  if (currentSettler.assignedRole === 'repair') {
    const clamped = Math.min(currentSettler.workProgressMs, 30_000);
    const percent = Math.round((clamped / 30_000) * 100);
    return `Repair ${percent}% · ${formatDuration(clamped)} / ${formatDuration(30_000)}`;
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

const workProgressPercent = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler?.assignedWorkTileId) {
    return 0;
  }
  if (currentSettler.assignedRole === 'guard') {
    return 100;
  }
  if (currentSettler.assignedRole === 'repair') {
    return Math.round((Math.min(currentSettler.workProgressMs, 30_000) / 30_000) * 100);
  }

  const workTile = tileIndex[currentSettler.assignedWorkTileId] ?? null;
  const building = workTile ? getBuildingDefinitionForTile(workTile) : null;
  const cycleMs = building?.cycleMs ?? 0;
  if (cycleMs <= 0) {
    return 0;
  }
  return Math.round((Math.min(currentSettler.workProgressMs, cycleMs) / cycleMs) * 100);
});

const carryingLabel = computed(() => {
  const currentSettler = settler.value;
  if (!currentSettler?.carryingPayload || !currentSettler.carryingKind) {
    return 'Empty handed';
  }

  return `${formatTitleCase(currentSettler.carryingKind)} · ${Math.floor(currentSettler.carryingPayload.amount)} ${formatTitleCase(currentSettler.carryingPayload.type)}`;
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

  if ((currentSettler.activity === 'working' || currentSettler.activity === 'repairing' || currentSettler.activity === 'defending' || currentSettler.activity === 'raiding') && (currentSettler.workTileId || currentSettler.assignedWorkTileId)) {
    if (currentSettler.assignedRole === 'guard') {
      if (currentSettler.activity === 'raiding') {
        return `Raiding ${workLabel.value}`;
      }
      if (currentSettler.activity === 'defending') {
        return `Defending ${workLabel.value}`;
      }
      return `Guarding ${workLabel.value}`;
    }
    return `${currentSettler.activity === 'repairing' ? 'Repairing' : 'Working'} at ${workLabel.value}`;
  }

  if (currentSettler.activity === 'commuting_home') {
    return `Heading home to ${homeLabel.value}`;
  }

  if (currentSettler.activity === 'commuting_work') {
    if (currentSettler.assignedRole === 'guard') {
      return `Marching to ${workLabel.value}`;
    }
    return `Heading to ${workLabel.value}`;
  }

  if (currentSettler.activity === 'idle' && currentSettler.assignedRole === 'guard' && (currentSettler.workTileId || currentSettler.assignedWorkTileId)) {
    return `Standing watch at ${workLabel.value}`;
  }

  if (currentSettler.activity === 'fetching_food') {
    return 'Fetching food';
  }

  if (currentSettler.activity === 'commuting_social') {
    return `Heading to ${formatTileLabel(currentSettler.socialTileId)}`;
  }

  if (currentSettler.activity === 'socializing') {
    return `Socializing at ${formatTileLabel(currentSettler.socialTileId)}`;
  }

  if (currentSettler.activity === 'commuting_shop') {
    return `Heading to ${formatTileLabel(currentSettler.socialTileId)}`;
  }

  if (currentSettler.activity === 'shopping') {
    return `Shopping at ${formatTileLabel(currentSettler.socialTileId)}`;
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

  if (currentSettler.workTileId || currentSettler.assignedWorkTileId) {
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
  padding: 24px;
  background:
    radial-gradient(circle at 22% 45%, rgb(40 43 37 / 0.26), transparent 23rem),
    radial-gradient(circle at 50% 120%, rgba(57, 80, 57, 0.12), transparent 28rem),
    rgba(1, 5, 12, 0.82);
  backdrop-filter: blur(4px) saturate(0.82) brightness(0.78);
}

.settler-modal-panel {
  position: relative;
  box-sizing: border-box;
  width: min(55.5rem, calc(100vw - 32px));
  max-height: min(88vh, 40.5rem);
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
  image-rendering: auto;
}

.settler-modal-panel::after {
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

.settler-modal-header {
  min-width: 0;
  padding: 0.05rem 0 0.1rem;
}

.settler-modal-eyebrow {
  margin: 0 0 0.25rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #c99a4b;
  text-shadow: 0 1px 0 #070706;
}

.settler-modal-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.75rem, 3.7vw, 2.18rem);
  font-weight: 700;
  line-height: 1.1;
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807, 0 0 10px rgba(216, 170, 83, 0.18);
}

.settler-modal-subtitle {
  margin: 0.28rem 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  color: #d6aa48;
  font-size: 1rem;
}

.settler-banner-tab {
  position: absolute;
  top: 0.25rem;
  left: 1.05rem;
  z-index: 3;
}

.settler-left-rail,
.settler-main {
  position: relative;
  z-index: 1;
}

.settler-left-rail {
  display: grid;
  align-content: start;
  gap: 0.46rem;
  padding-top: 0.75rem;
}

.settler-badge {
  z-index: 2;
  margin: -1.55rem auto 0;
}

.settler-paper-note {
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

.settler-props {
  display: flex;
  align-items: end;
  justify-content: space-between;
  width: min(100%, 11.95rem);
  min-height: 2.9rem;
  margin: 0 auto;
  padding: 0 0.8rem;
  position: absolute;
  bottom: 0px;
}

.settler-candle {
  width: 2.5rem;
  height: 3.15rem;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 0 70px #f6a63f);
}

.settler-mug {
  width: 3.25rem;
  height: 2.65rem;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 5px 5px rgba(0, 0, 0, 0.38));
}

.settler-main {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.46rem;
  min-width: 0;
  overflow: hidden;
}

.settler-ledger {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(159, 105, 47, 0.48);
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 226, 161, 0.046), transparent 11rem),
    radial-gradient(circle at 80% 110%, rgba(157, 95, 43, 0.095), transparent 16rem),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, rgba(22, 25, 27, 0.96), rgba(10, 12, 14, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.82),
    inset 0 0 42px rgba(0, 0, 0, 0.78);
}

.settler-ledger::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    radial-gradient(circle at 9% 23%, rgba(218, 165, 86, 0.28) 0 1px, transparent 1px),
    radial-gradient(circle at 67% 34%, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px),
    radial-gradient(circle at 42% 82%, rgba(0, 0, 0, 0.78) 0 1px, transparent 1px);
  background-size: 23px 19px, 29px 31px, 17px 13px;
}

.settler-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  min-height: 0;
}

.settler-info-panel {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 3.1rem minmax(0, 1fr);
  gap: 0.64rem;
  min-height: 5.05rem;
  padding: 0.58rem 0.78rem;
  border: 0;
  border-right: 1px solid rgba(130, 88, 43, 0.52);
  border-bottom: 1px solid rgba(130, 88, 43, 0.52);
  background: transparent;
}

.settler-info-panel:nth-child(even) {
  border-right: 0;
}

.settler-info-panel:nth-last-child(-n + 2) {
  border-bottom: 0;
}

.settler-card-label {
  margin: 0 0 0.22rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c69549;
}

.settler-card-value {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
  line-height: 1.15;
  color: #fff0d2;
  text-shadow: 0 1px 0 #070707;
}

.settler-card-meta {
  margin: 0.22rem 0 0;
  overflow-wrap: anywhere;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.82rem;
  line-height: 1.18;
  color: #b9aa8d;
}

.settler-info-icon {
  width: 3rem;
  height: 3rem;
  display: block;
  align-self: center;
  justify-self: center;
  border-radius: 8px;
  background-color: rgba(246, 199, 108, 0.08);
  background-repeat: no-repeat;
  background-size: 400% 300%;
  filter:
    saturate(1.18)
    contrast(1.08)
    drop-shadow(0 2px 0 rgba(0, 0, 0, 0.72))
    drop-shadow(0 0 7px rgba(235, 169, 64, 0.22));
  image-rendering: auto;
}

.settler-progress {
  width: min(11rem, 100%);
  height: 0.26rem;
  margin-top: 0.34rem;
  overflow: hidden;
  border: 1px solid rgba(69, 55, 38, 0.95);
  background: #090909;
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.92);
}

.settler-progress span {
  display: block;
  height: 100%;
  min-width: 0.15rem;
  background: linear-gradient(90deg, #c88425, #f0bd46);
  box-shadow: 0 0 8px rgba(228, 159, 45, 0.45);
}

.settler-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.34rem;
  min-width: 0;
}

.settler-pill {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  min-height: 2.54rem;
  padding: 0.2rem 0.58rem;
  border: 7px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 7px stretch;
  color: #f3dfb9;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.81rem;
  line-height: 1;
  white-space: nowrap;
  background: transparent;
  text-shadow: 0 1px 0 #070707;
}

.settler-pill-activity {
  min-width: 5.7rem;
}

.settler-pill-meter {
  flex: 1 0 7.25rem;
  justify-content: flex-start;
}

.settler-pill-happiness {
  flex-basis: 9.1rem;
  min-width: 8.75rem;
}

.settler-pill-icon {
  width: 2.08rem;
  height: 2.08rem;
  display: inline-block;
  flex: 0 0 auto;
  margin-right: 0.48rem;
  border-radius: 6px;
  background-color: rgba(255, 225, 158, 0.08);
  background-repeat: no-repeat;
  background-size: 400% 300%;
  filter:
    saturate(1.22)
    contrast(1.08)
    drop-shadow(0 1px 0 rgba(0, 0, 0, 0.72))
    drop-shadow(0 0 5px rgba(233, 174, 72, 0.18));
  image-rendering: auto;
}

.settler-pill-alert {
  color: #ffd36d;
  filter: brightness(1.12);
}

.settler-thought-panel {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 2.35rem minmax(0, 1fr);
  align-items: start;
  gap: 0.72rem;
  min-height: 4.55rem;
  padding: 0.74rem 5.25rem 0.65rem 0.9rem;
  overflow: hidden;
  border: 0;
  border-top: 1px solid rgba(170, 113, 52, 0.58);
  background:
    radial-gradient(circle at 87% 82%, rgba(203, 138, 53, 0.16), transparent 7rem),
    linear-gradient(90deg, rgba(59, 43, 27, 0.42), rgba(14, 15, 16, 0.1) 58%),
    rgba(28, 22, 17, 0.42);
}

.settler-thought-panel::before {
  content: '';
  position: absolute;
  top: 0.38rem;
  right: 0.9rem;
  left: 0.9rem;
  height: 1px;
  opacity: 0.58;
  background:
    linear-gradient(90deg, transparent, rgba(196, 137, 63, 0.75) 18%, rgba(196, 137, 63, 0.22) 56%, transparent);
}

.settler-thought-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 236, 188, 0.04), transparent 42%);
}

.settler-thought-copy {
  position: relative;
  z-index: 1;
}

.settler-thought-panel .settler-card-label {
  margin-top: 0.08rem;
  font-size: 0.66rem;
  color: #d0a050;
}

.settler-thought-text {
  max-width: 31rem;
  margin: 0.28rem 0 0;
  overflow-wrap: anywhere;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.86rem;
  line-height: 1.23;
  color: #d7c8a7;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.84);
}

.settler-thought-icon {
  position: relative;
  z-index: 1;
  width: 2.9rem;
  height: 2.9rem;
  margin-top: 0;
  display: block;
  align-self: center;
  border-radius: 8px;
  background-color: rgba(246, 199, 108, 0.08);
  background-repeat: no-repeat;
  background-size: 400% 300%;
  opacity: 0.94;
  filter:
    saturate(1.12)
    contrast(1.08)
    drop-shadow(0 2px 0 rgba(0, 0, 0, 0.68));
  image-rendering: auto;
}

.settler-thought-building {
  position: absolute;
  right: 0.86rem;
  bottom: -0.1rem;
  z-index: 0;
  width: 4.35rem;
  opacity: 0.52;
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.68)) saturate(0.85) brightness(0.9);
  image-rendering: auto;
}

@media (max-width: 820px) {
  .settler-modal-backdrop {
    align-items: stretch;
    padding: 0;
  }

  .settler-modal-panel {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.85rem;
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    min-height: 0;
    padding: 1.55rem 1rem 1rem;
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .settler-banner-tab {
    left: 0.95rem;
    width: 2.85rem;
    height: 4.3rem;
    padding-top: 1rem;
    --panel-banner-icon-size: 1.2rem;
  }

  .settler-left-rail {
    grid-template-columns: minmax(8.2rem, 11rem) minmax(0, 1fr);
    align-items: center;
    min-height: 0;
    padding-top: 1.6rem;
  }

  .settler-main {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 0.25rem;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .settler-ledger {
    display: block;
    flex: 0 0 auto;
    min-height: auto;
    overflow: visible;
  }

  .settler-portrait-frame,
  .settler-paper-note,
  .settler-props {
    width: 100%;
  }

  .settler-badge {
    position: absolute;
    left: min(8.2rem, 42vw);
    top: calc(1.6rem + 8.2rem);
    width: 2.7rem;
    height: 3.05rem;
    margin: 0;
    --panel-banner-icon-size: 1.1rem;
    transform: translate(-50%, -42%);
  }

  .settler-paper-note {
    min-height: 6.2rem;
    padding: 1rem;
    font-size: 0.88rem;
  }

  .settler-props {
    display: none;
  }

  .settler-modal-title {
    font-size: 1.65rem;
  }

  .settler-grid {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .settler-info-panel {
    min-height: 6.2rem;
    border-right: 0;
  }

  .settler-info-panel:nth-last-child(-n + 2) {
    border-bottom: 1px solid rgba(130, 88, 43, 0.52);
  }

  .settler-info-panel:last-child {
    border-bottom: 0;
  }

  .settler-thought-panel {
    grid-template-columns: 2.25rem minmax(0, 1fr);
    padding-right: 0.9rem;
  }

  .settler-thought-building {
    display: none;
  }
}

@media (max-width: 520px) {
  .settler-modal-panel {
    padding: 1.4rem 0.75rem 0.85rem;
  }

  .settler-left-rail {
    grid-template-columns: 1fr;
    padding-top: 1.9rem;
  }

  .settler-portrait-frame {
    width: min(100%, 11rem);
  }

  .settler-badge {
    position: relative;
    top: auto;
    left: auto;
    margin: -2rem auto 0;
    transform: none;
  }

  .settler-paper-note {
    width: min(100%, 15rem);
    min-height: auto;
  }

  .settler-pill {
    flex: 1 1 calc(50% - 0.45rem);
    justify-content: center;
    font-size: 0.85rem;
  }

  .settler-pill-meter,
  .settler-pill-activity {
    flex-basis: calc(50% - 0.45rem);
    min-width: 0;
  }

  .settler-info-panel {
    grid-template-columns: 2.25rem minmax(0, 1fr);
    gap: 0.55rem;
    padding: 0.75rem;
  }

  .settler-info-icon {
    width: 2rem;
    height: 2rem;
  }

  .settler-card-value {
    font-size: 1rem;
  }

  .settler-card-meta {
    font-size: 0.83rem;
  }
}
</style>
