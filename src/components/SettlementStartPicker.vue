<template>
  <Transition name="settlement-start-fade" appear>
    <div v-if="isOpen" class="settlement-start-backdrop">
      <section class="settlement-start-panel" aria-label="Choose settlement start">
        <header class="settlement-start-header">
          <div>
            <p class="settlement-start-eyebrow">New Settlement</p>
            <h2>Choose Your Landing</h2>
          </div>
          <button class="settlement-start-refresh" type="button" @click="refreshOptions">Refresh</button>
        </header>

        <section v-if="settlementStartLocked" class="settlement-start-lock" aria-live="polite">
          <span>Season Locked</span>
          <strong>{{ settlementStartLockTitle }}</strong>
          <p>{{ settlementStartLockReason }}</p>
        </section>

        <div class="settlement-start-body overflow-hidden rounded-lg">
          <div class="rounded-lg overflow-hidden">
            <div class="-m-2">
          <WorldMiniMap
            aria-label="Settlement start minimap"
            draggable
            layout-mode="fixed"
            :terrain-tiles="terrainTiles"
            :hotspots="mapHotspots"
            :aspect-ratio="1"
            :viewport-center="viewportCenter ?? minimapViewport.center"
            :viewport-width-units="56"
            @hotspot-click="handleHotspotClick"
            @terrain-click="handleTerrainClick"
            @viewport-center-change="viewportCenter = $event"
          />
            </div>
          </div>

          <div v-if="isFreeStart" class="settlement-start-list">
            <button
              class="settlement-start-option settlement-start-option--selected settlement-start-option--free"
              :class="{ 'settlement-start-option--blocked': selectedFreeBlocked || settlementStartLocked }"
              :disabled="!selectedFreeCoord || settlementStartLocked"
              type="button"
            >
              <span class="settlement-start-option__main">
                <strong>{{ selectedFreeCoord ? 'Selected Site' : 'No Site Selected' }}</strong>
                <span>{{ selectedFreeCoord ? selectedFreeDescription : 'Click the minimap to choose a founding tile.' }}</span>
              </span>
              <span class="settlement-start-option__meta">
                {{ selectedFreeTerrain }}
              </span>
            </button>

            <p v-if="error" class="settlement-start-error">{{ error }}</p>
          </div>

          <div v-else class="settlement-start-list">
            <button
              v-for="candidate in candidates"
              :key="candidate.id"
              class="settlement-start-option"
              :class="{
                'settlement-start-option--selected': candidate.id === selectedCandidateId,
                'settlement-start-option--blocked': settlementStartLocked,
                [`settlement-start-option--${candidate.distanceBand}`]: true,
              }"
              :disabled="!candidate.available || settlementStartLocked"
              type="button"
              @click="selectCandidate(candidate.id)"
            >
              <span class="settlement-start-option__main">
                <strong>{{ candidate.label }}</strong>
                <span>{{ candidate.description }}</span>
              </span>
              <span class="settlement-start-option__meta">
                {{ formatTerrain(candidate.terrain) }}
              </span>
            </button>

            <p v-if="error" class="settlement-start-error">{{ error }}</p>
          </div>
        </div>

        <section
          v-if="season"
          class="settlement-start-season"
          :class="{ 'settlement-start-season--locked': settlementStartLocked }"
          aria-label="Season briefing"
        >
          <div>
            <p class="settlement-start-season__eyebrow">Season Briefing</p>
            <strong>{{ seasonStageLabel }}</strong>
            <span>{{ seasonStrategyHint }}</span>
          </div>
          <div class="settlement-start-season__stats">
            <article>
              <span>{{ nextSeasonStageLabel }}</span>
              <strong>{{ seasonCountdown }}</strong>
            </article>
            <article>
              <span>Borders</span>
              <strong>{{ seasonBorderLabel }}</strong>
            </article>
            <article>
              <span>Starts</span>
              <strong>{{ settlementStartsLabel }}</strong>
            </article>
          </div>
        </section>

        <footer class="settlement-start-footer">
          <p>{{ selectedSummary }}</p>
          <button
            class="settlement-start-confirm"
            type="button"
            :disabled="!canConfirm"
            @click="confirmSelection"
          >
            {{ confirmButtonLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import WorldMiniMap, { type MiniMapHotspot } from './WorldMiniMap.vue';
import { requestFoundSettlement, requestFoundSettlementAt, requestSettlementStartOptions } from '../core/settlementStartService.ts';
import {
  needsSettlementStart,
  currentPlayerSettlementId,
  settlementStartCandidates,
  settlementStartError,
  settlementStartFoundingCandidateId,
  settlementStartMarkers,
  settlementStartMode,
  settlementStartOptionsLoaded,
  settlementStartTerrainTiles,
} from '../store/settlementStartStore.ts';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { MIN_SETTLEMENT_START_CONNECTED_LAND, type SettlementStartCandidate } from '../shared/multiplayer/settlementStart.ts';

const selectedCandidateId = ref<string | null>(null);
const selectedFreeCoord = ref<{ q: number; r: number } | null>(null);
const viewportCenter = ref<{ q: number; r: number } | null>(null);
const now = ref(Date.now());
let countdownTimer: number | null = null;

const isOpen = computed(() => (
  needsSettlementStart.value
  || (settlementStartOptionsLoaded.value && !currentPlayerSettlementId.value && settlementStartLocked.value)
));
const season = computed(() => seasonSnapshot.value);
const isFreeStart = computed(() => settlementStartMode.value === 'free');
const candidates = computed(() => settlementStartCandidates.value);
const markers = computed(() => settlementStartMarkers.value);
const terrainTiles = computed(() => settlementStartTerrainTiles.value);
const error = computed(() => settlementStartError.value);
const selectedCandidate = computed(() => candidates.value.find((candidate) => candidate.id === selectedCandidateId.value) ?? null);
const isFounding = computed(() => !!settlementStartFoundingCandidateId.value);
const selectedFreeTile = computed(() => {
  if (!selectedFreeCoord.value) {
    return null;
  }

  return terrainTiles.value.find((entry) => entry.q === selectedFreeCoord.value?.q && entry.r === selectedFreeCoord.value?.r) ?? null;
});
const selectedFreeBlocked = computed(() => !!selectedFreeCoord.value && (!selectedFreeTile.value || !!selectedFreeTile.value.blocked));
const canConfirm = computed(() => (
  !settlementStartLocked.value
  && (
  isFreeStart.value
    ? !!selectedFreeTile.value && !selectedFreeBlocked.value && !isFounding.value
    : !!selectedCandidate.value && !isFounding.value
  )
));
const selectedFreeTerrain = computed(() => {
  if (!selectedFreeCoord.value) {
    return 'select';
  }

  return selectedFreeTile.value ? formatTerrain(selectedFreeTile.value.terrain) : 'unknown';
});
const selectedFreeDescription = computed(() => {
  const coord = selectedFreeCoord.value;
  if (!coord) {
    return 'Click the minimap to choose a founding tile.';
  }

  if (selectedFreeBlocked.value) {
    const tile = selectedFreeTile.value;
    switch (tile?.blockedReason) {
      case 'water':
        return 'Water cannot hold a town center.';
      case 'vulcano':
        return 'Volcano tiles are too dangerous for a settlement start.';
      case 'small_island':
        return `This island has ${tile.connectedNonWaterTiles ?? 0} connected non-water tiles; choose at least ${MIN_SETTLEMENT_START_CONNECTED_LAND}.`;
      case 'player_reach': {
        const playerName = tile.blockedByPlayerName ?? 'another player';
        return `This site is inside ${playerName}'s reach.`;
      }
      default:
        return 'That tile cannot be used as a settlement start.';
    }
  }

  return 'Ready to found on the selected site.';
});
const currentSeasonStage = computed(() => season.value?.currentStage ?? 'preparation');
const currentSeasonStageConfig = computed(() => {
  const snapshot = season.value;
  if (!snapshot || snapshot.currentStage === 'completed') {
    return null;
  }

  return snapshot.config.stages.find((stage) => stage.key === snapshot.currentStage) ?? null;
});
const seasonStageLabel = computed(() => stageName(currentSeasonStage.value));
const nextSeasonStageLabel = computed(() => {
  if (season.value?.status === 'completed' && season.value.nextSeasonStartsAt) {
    return 'Next Season In';
  }
  const next = getNextSeasonStage();
  return next === 'completed' ? 'Completes In' : `${stageName(next)} In`;
});
const seasonCountdown = computed(() => {
  if (season.value?.status === 'completed' && season.value.nextSeasonStartsAt) {
    return formatCountdown(Math.max(0, season.value.nextSeasonStartsAt - now.value));
  }
  const endsAt = season.value?.stageEndsAt;
  return endsAt ? formatCountdown(Math.max(0, endsAt - now.value)) : '--';
});
const seasonBorderLabel = computed(() => {
  switch (currentSeasonStageConfig.value?.borderPolicy) {
    case 'locked_closed':
      return 'Closed';
    case 'locked_open':
      return 'Open';
    case 'player_choice':
      return 'Player choice';
    default:
      return '--';
  }
});
const settlementStartLocked = computed(() => {
  return false;
});
const settlementStartsLabel = computed(() => settlementStartLocked.value ? 'Locked' : 'Open');
const settlementStartLockTitle = computed(() => {
  if (season.value?.status === 'completed' || season.value?.currentStage === 'completed') {
    return 'This season is complete.';
  }
  return `New settlements are locked during ${seasonStageLabel.value}.`;
});
const settlementStartLockReason = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return '';
  }
  if (snapshot.status === 'completed' || snapshot.currentStage === 'completed') {
    const nextSeasonText = snapshot.nextSeasonStartsAt
      ? ` A new season starts in ${seasonCountdown.value}.`
      : '';
    return `The world is now an archive: you can inspect the map and final scores, but no new colonies can join.${nextSeasonText}`;
  }
  const next = getNextSeasonStage();
  const waitText = next === 'completed'
    ? 'the next season'
    : `${stageName(next)} ${seasonCountdown.value === '--' ? '' : `in ${seasonCountdown.value}`}`.trim();
  return `The server has disabled new colony starts for this stage. You can inspect the current world, but founding reopens with ${waitText}.`;
});
const confirmButtonLabel = computed(() => {
  if (settlementStartLocked.value) {
    return 'Starts Locked';
  }
  return isFounding.value ? 'Founding...' : 'Found Settlement';
});
const seasonStrategyHint = computed(() => {
  if (settlementStartLocked.value) {
    return settlementStartLockReason.value;
  }

  switch (currentSeasonStage.value) {
    case 'preparation':
      return 'Pick a landing with room for food, roads and defenses while borders are still closed.';
    case 'midgame':
      return 'Borders are open, so distance, towers and access routes matter from the first minute.';
    case 'endgame':
      return 'Final goals are live. New starts may be blocked soon, so choose only if this site can score quickly.';
    case 'completed':
      return 'This world is complete and can only be inspected.';
    default:
      return 'Choose a landing that fits the active season rules.';
  }
});

const mapHotspots = computed<MiniMapHotspot[]>(() => [
  ...markers.value.map((marker) => ({
    id: `settlement:${marker.settlementId}`,
    q: marker.q,
    r: marker.r,
    kind: 'settlement' as const,
    tone: 'settlement' as const,
    color: marker.playerColor ?? '#b98a35',
    interactive: false,
    title: marker.playerName ? `${marker.playerName}'s settlement` : 'Unclaimed settlement',
  })),
  ...(isFreeStart.value ? [] : candidates.value.map((candidate) => ({
    id: candidate.id,
    q: candidate.q,
    r: candidate.r,
    kind: 'candidate' as const,
    tone: candidate.distanceBand,
    interactive: candidate.available && !settlementStartLocked.value,
    disabled: !candidate.available || settlementStartLocked.value,
    selected: candidate.id === selectedCandidateId.value,
    title: settlementStartLocked.value
      ? 'Settlement starts are locked during this season stage.'
      : candidate.available
      ? `${candidate.label}: ${candidate.description}`
      : `${candidate.label}: occupied by ${candidate.occupiedByPlayerName ?? 'another player'}`,
  }))),
  ...(selectedFreeCoord.value ? [{
    id: `free-start:${selectedFreeCoord.value.q}:${selectedFreeCoord.value.r}`,
    q: selectedFreeCoord.value.q,
    r: selectedFreeCoord.value.r,
    kind: 'candidate' as const,
    tone: 'remote' as const,
    interactive: false,
    selected: true,
    title: 'Selected settlement site',
  }] : []),
]);

const minimapViewport = computed(() => {
  const points = [
    ...terrainTiles.value.map((tile) => ({ q: tile.q, r: tile.r })),
    ...mapHotspots.value.map((hotspot) => ({ q: hotspot.q, r: hotspot.r })),
  ];

  if (points.length === 0) {
    return {
      center: { q: 0, r: 0 },
      widthUnits: 24,
    };
  }

  const projected = points.map((point) => ({
    x: point.q + point.r * 0.5,
    y: point.r * 0.866,
  }));
  const minX = Math.min(...projected.map((point) => point.x)) - 0.6;
  const maxX = Math.max(...projected.map((point) => point.x)) + 0.6;
  const minY = Math.min(...projected.map((point) => point.y)) - 0.6;
  const maxY = Math.max(...projected.map((point) => point.y)) + 0.6;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerR = centerY / 0.866;
  const centerQ = centerX - (centerR * 0.5);

  return {
    center: { q: centerQ, r: centerR },
    widthUnits: Math.max(8, maxX - minX),
  };
});

watch(minimapViewport, (nextViewport) => {
  if (!viewportCenter.value) {
    viewportCenter.value = nextViewport.center;
  }
}, { immediate: true });

const selectedSummary = computed(() => {
  if (settlementStartLocked.value) {
    return settlementStartLockReason.value;
  }

  const candidate = selectedCandidate.value;
  if (isFreeStart.value) {
    const coord = selectedFreeCoord.value;
    return coord
      ? (selectedFreeBlocked.value
        ? 'Pick a valid land tile on a large enough island.'
        : 'Found at the selected site.')
      : 'Click a tile on the minimap to choose your settlement site.';
  }

  if (!candidate) {
    return 'Pick a highlighted site on the minimap or in the list.';
  }

  if (candidate.distanceFromNearestSettlement === 0) {
    return 'This claims the original landing as your home settlement.';
  }

  return `${candidate.label} is ${candidate.distanceFromNearestSettlement} tiles from the nearest town center.`;
});

watch(candidates, (nextCandidates) => {
  if (isFreeStart.value) {
    selectedCandidateId.value = null;
    return;
  }

  if (selectedCandidateId.value && nextCandidates.some((candidate) => candidate.id === selectedCandidateId.value && candidate.available)) {
    return;
  }

  selectedCandidateId.value = nextCandidates.find((candidate) => candidate.available)?.id ?? null;
}, { immediate: true });

watch(selectedCandidate, (candidate) => {
  if (!candidate) {
    return;
  }

  viewportCenter.value = { q: candidate.q, r: candidate.r };
});

watch(isFreeStart, (freeStart) => {
  if (!freeStart) {
    selectedFreeCoord.value = null;
  }
}, { immediate: true });

function formatTerrain(terrain: SettlementStartCandidate['terrain']) {
  if (terrain === 'towncenter') {
    return 'town center';
  }

  return terrain;
}

function selectCandidate(candidateId: string) {
  if (settlementStartLocked.value) {
    return;
  }
  selectedCandidateId.value = candidateId;
}

function handleHotspotClick(hotspot: MiniMapHotspot) {
  if (hotspot.kind !== 'candidate' || hotspot.disabled) {
    return;
  }

  selectCandidate(hotspot.id);
}

function handleTerrainClick(coord: { q: number; r: number }) {
  if (!isFreeStart.value || settlementStartLocked.value) {
    return;
  }

  selectedFreeCoord.value = coord;
}

function refreshOptions() {
  requestSettlementStartOptions();
}

function confirmSelection() {
  if (isFounding.value || settlementStartLocked.value) {
    return;
  }

  if (isFreeStart.value) {
    const coord = selectedFreeCoord.value;
    if (!coord || selectedFreeBlocked.value) {
      return;
    }

    requestFoundSettlementAt(coord.q, coord.r);
    return;
  }

  const candidate = selectedCandidate.value;
  if (!candidate) {
    return;
  }

  requestFoundSettlement(candidate.id);
}

function getNextSeasonStage() {
  const snapshot = season.value;
  if (!snapshot || snapshot.status === 'completed' || snapshot.currentStage === 'completed') {
    return 'completed';
  }

  const enabled = snapshot.config.stages.filter((stage) => stage.enabled && stage.durationMs > 0);
  const index = enabled.findIndex((stage) => stage.key === snapshot.currentStage);
  return enabled[index + 1]?.key ?? 'completed';
}

function stageName(stage: string) {
  switch (stage) {
    case 'preparation':
      return 'Preparation';
    case 'midgame':
      return 'Midgame';
    case 'endgame':
      return 'Finale';
    case 'completed':
      return 'Completed';
    default:
      return stage;
  }
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

onMounted(() => {
  countdownTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (countdownTimer != null) {
    window.clearInterval(countdownTimer);
  }
});
</script>

<style scoped>
.settlement-start-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(6, 18, 20, 0.72);
  backdrop-filter: blur(5px);
  pointer-events: auto;
}

.settlement-start-panel {
  width: min(68rem, 100%);
  max-height: min(42rem, calc(100vh - 2rem));
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid rgba(250, 230, 170, 0.28);
  border-radius: 8px;
  background: rgba(16, 36, 31, 0.96);
  color: #fff4cf;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.44);
}

.settlement-start-header,
.settlement-start-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.settlement-start-header h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0;
}

.settlement-start-eyebrow {
  margin: 0 0 0.25rem;
  color: #9dd8c6;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
}

.settlement-start-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(22rem, 1.35fr) minmax(18rem, 0.9fr);
  gap: 1rem;
}

.settlement-start-lock {
  border: 1px solid rgba(251, 191, 36, 0.42);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(92, 44, 12, 0.74), rgba(31, 19, 13, 0.78)),
    rgba(6, 18, 20, 0.84);
  box-shadow:
    inset 0 1px 0 rgba(255, 244, 207, 0.08),
    0 10px 24px rgba(0, 0, 0, 0.22);
  padding: 0.75rem 0.9rem;
}

.settlement-start-lock span {
  display: block;
  color: #facc15;
  font-size: 0.62rem;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.settlement-start-lock strong {
  display: block;
  margin-top: 0.22rem;
  color: #fff4cf;
  font-size: 1rem;
  line-height: 1.2;
}

.settlement-start-lock p {
  margin: 0.28rem 0 0;
  color: rgba(255, 244, 207, 0.78);
  font-size: 0.8rem;
  line-height: 1.35;
}

.settlement-start-season {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  border: 1px solid rgba(157, 216, 198, 0.24);
  border-radius: 8px;
  background:
    radial-gradient(circle at 12% 0%, rgba(45, 148, 123, 0.2), transparent 18rem),
    linear-gradient(180deg, rgba(8, 28, 29, 0.78), rgba(5, 17, 20, 0.72));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  padding: 0.8rem 0.9rem;
}

.settlement-start-season--locked {
  border-color: rgba(251, 191, 36, 0.34);
  background:
    radial-gradient(circle at 12% 0%, rgba(251, 191, 36, 0.16), transparent 18rem),
    linear-gradient(180deg, rgba(43, 28, 13, 0.84), rgba(5, 17, 20, 0.72));
}

.settlement-start-season__eyebrow {
  margin: 0 0 0.22rem;
  color: #9dd8c6;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.settlement-start-season > div:first-child strong {
  display: block;
  color: #fff4cf;
  font-size: 0.98rem;
  line-height: 1.2;
}

.settlement-start-season > div:first-child span {
  display: block;
  margin-top: 0.28rem;
  color: rgba(255, 244, 207, 0.75);
  font-size: 0.78rem;
  line-height: 1.35;
}

.settlement-start-season__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(5.4rem, 1fr));
  gap: 0.45rem;
}

.settlement-start-season__stats article {
  min-width: 0;
  border: 1px solid rgba(255, 244, 207, 0.12);
  border-radius: 6px;
  background: rgba(6, 18, 20, 0.44);
  padding: 0.5rem 0.55rem;
}

.settlement-start-season__stats span {
  display: block;
  color: rgba(255, 244, 207, 0.58);
  font-size: 0.58rem;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
}

.settlement-start-season__stats strong {
  display: block;
  min-width: 0;
  margin-top: 0.26rem;
  color: #c7f7ff;
  font-size: 0.78rem;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.settlement-start-list {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-right: 0.15rem;
}

.settlement-start-option {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.8rem 0.85rem;
  border: 1px solid rgba(255, 244, 207, 0.16);
  border-radius: 8px;
  background: rgba(6, 18, 20, 0.5);
  color: inherit;
  text-align: left;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.settlement-start-option:not(:disabled) {
  cursor: pointer;
}

.settlement-start-option:disabled {
  opacity: 0.5;
}

.settlement-start-option--selected {
  border-color: rgba(157, 216, 198, 0.68);
  background: rgba(35, 83, 46, 0.58);
  box-shadow:
    inset 0 0 0 1px rgba(157, 216, 198, 0.18),
    0 8px 18px rgba(4, 14, 16, 0.18);
}

.settlement-start-option--home {
  border-left: 3px solid rgba(251, 146, 60, 0.7);
}

.settlement-start-option--near {
  border-left: 3px solid rgba(74, 222, 128, 0.7);
}

.settlement-start-option--frontier {
  border-left: 3px solid rgba(56, 189, 248, 0.72);
}

.settlement-start-option--remote {
  border-left: 3px solid rgba(250, 204, 21, 0.74);
}

.settlement-start-option--free {
  border-left: 3px solid rgba(157, 216, 198, 0.78);
}

.settlement-start-option--blocked {
  border-color: rgba(248, 113, 113, 0.62);
  background: rgba(127, 29, 29, 0.36);
}

.settlement-start-option__main,
.settlement-start-option__meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.settlement-start-option__main strong {
  font-size: 0.98rem;
}

.settlement-start-option__main span,
.settlement-start-footer p,
.settlement-start-option__meta {
  color: rgba(255, 244, 207, 0.72);
  font-size: 0.8rem;
  line-height: 1.35;
}

.settlement-start-option__meta {
  flex: 0 0 auto;
  text-align: right;
  text-transform: capitalize;
  color: rgba(255, 244, 207, 0.82);
}

.settlement-start-refresh,
.settlement-start-confirm {
  min-height: 2.6rem;
  padding: 0 1rem;
  border: 1px solid rgba(250, 230, 170, 0.35);
  border-radius: 8px;
  background: rgba(250, 230, 170, 0.12);
  color: #fff4cf;
  font-weight: 800;
}

.settlement-start-confirm {
  background: #d7a948;
  color: #241406;
}

.settlement-start-confirm:disabled {
  cursor: wait;
  opacity: 0.6;
}

.settlement-start-footer p {
  max-width: 36rem;
}

.settlement-start-error {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(248, 113, 113, 0.36);
  border-radius: 8px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.3);
  font-size: 0.78rem;
}

.settlement-start-fade-enter-active,
.settlement-start-fade-leave-active {
  transition: opacity 0.18s ease;
}

.settlement-start-fade-enter-from,
.settlement-start-fade-leave-to {
  opacity: 0;
}

@media (max-width: 820px) {
  .settlement-start-panel {
    max-height: calc(100vh - 1rem);
  }

  .settlement-start-body {
    grid-template-columns: 1fr;
  }

  .settlement-start-header,
  .settlement-start-footer,
  .settlement-start-season {
    align-items: stretch;
    flex-direction: column;
  }

  .settlement-start-season {
    display: flex;
  }

  .settlement-start-season__stats {
    grid-template-columns: 1fr;
  }
}
</style>
