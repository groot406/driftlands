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
            @viewport-center-change="viewportCenter = $event"
          />
            </div>
          </div>

          <div class="settlement-start-list">
            <button
              v-for="candidate in candidates"
              :key="candidate.id"
              class="settlement-start-option"
              :class="{
                'settlement-start-option--selected': candidate.id === selectedCandidateId,
                [`settlement-start-option--${candidate.distanceBand}`]: true,
              }"
              :disabled="!candidate.available"
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

        <footer class="settlement-start-footer">
          <p>{{ selectedSummary }}</p>
          <button
            class="settlement-start-confirm"
            type="button"
            :disabled="!selectedCandidate || isFounding"
            @click="confirmSelection"
          >
            {{ isFounding ? 'Founding...' : 'Found Settlement' }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import WorldMiniMap, { type MiniMapHotspot } from './WorldMiniMap.vue';
import { requestFoundSettlement, requestSettlementStartOptions } from '../core/settlementStartService.ts';
import {
  needsSettlementStart,
  settlementStartCandidates,
  settlementStartError,
  settlementStartFoundingCandidateId,
  settlementStartMarkers,
  settlementStartTerrainTiles,
} from '../store/settlementStartStore.ts';
import type { SettlementStartCandidate } from '../shared/multiplayer/settlementStart.ts';

const selectedCandidateId = ref<string | null>(null);
const viewportCenter = ref<{ q: number; r: number } | null>(null);

const isOpen = computed(() => needsSettlementStart.value);
const candidates = computed(() => settlementStartCandidates.value);
const markers = computed(() => settlementStartMarkers.value);
const terrainTiles = computed(() => settlementStartTerrainTiles.value);
const error = computed(() => settlementStartError.value);
const selectedCandidate = computed(() => candidates.value.find((candidate) => candidate.id === selectedCandidateId.value) ?? null);
const isFounding = computed(() => !!settlementStartFoundingCandidateId.value);

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
  ...candidates.value.map((candidate) => ({
    id: candidate.id,
    q: candidate.q,
    r: candidate.r,
    kind: 'candidate' as const,
    tone: candidate.distanceBand,
    interactive: candidate.available,
    disabled: !candidate.available,
    selected: candidate.id === selectedCandidateId.value,
    title: candidate.available
      ? `${candidate.label}: ${candidate.description}`
      : `${candidate.label}: occupied by ${candidate.occupiedByPlayerName ?? 'another player'}`,
  })),
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
  const candidate = selectedCandidate.value;
  if (!candidate) {
    return 'Pick a highlighted site on the minimap or in the list.';
  }

  if (candidate.distanceFromNearestSettlement === 0) {
    return 'This claims the original landing as your home settlement.';
  }

  return `${candidate.label} is ${candidate.distanceFromNearestSettlement} tiles from the nearest town center.`;
});

watch(candidates, (nextCandidates) => {
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

function formatTerrain(terrain: SettlementStartCandidate['terrain']) {
  if (terrain === 'towncenter') {
    return 'town center';
  }

  return terrain;
}

function selectCandidate(candidateId: string) {
  selectedCandidateId.value = candidateId;
}

function handleHotspotClick(hotspot: MiniMapHotspot) {
  if (hotspot.kind !== 'candidate' || hotspot.disabled) {
    return;
  }

  selectCandidate(hotspot.id);
}

function refreshOptions() {
  requestSettlementStartOptions();
}

function confirmSelection() {
  const candidate = selectedCandidate.value;
  if (!candidate || isFounding.value) {
    return;
  }

  requestFoundSettlement(candidate.id);
}
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
  .settlement-start-footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
