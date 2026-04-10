<template>
  <div class="world-controls">
    <div class="world-seed-panel">
      <div class="world-seed-copy">
        <span class="world-seed-badge">Seed {{ activeWorldSeed }}</span>
        <span class="world-seed-badge">{{ storySeed !== null ? 'Live Story' : 'Awaiting Sync' }}</span>
      </div>

      <label class="world-seed-label" for="world-seed-input">Restart Seed</label>
      <input
        id="world-seed-input"
        v-model="seedDraft"
        class="world-seed-input"
        type="number"
        inputmode="numeric"
        min="0"
        max="4294967295"
        step="1"
        placeholder="Leave blank for random"
        @keydown.enter.prevent="restartWorldStory()"
      />
      <p class="world-seed-hint">
        Leave the field blank to roll a fresh random seed, or enter one to restart the world and story with that exact seed.
      </p>

      <div class="world-seed-actions">
        <button class="mini-btn" @click="syncDraftToCurrentSeed" title="Copy the active seed into the field">Current</button>
        <button class="mini-btn" @click="randomizeSeed" title="Generate a random seed and place it in the field">Random</button>
        <button class="mini-btn" @click="clearDraft" title="Clear the field so the server rolls a fresh random seed">Clear</button>
      </div>
    </div>

    <div class="world-action-row">
      <button class="mini-btn" @click="restartWorldStory()" title="Restart the world and story using the entered seed">Restart Story</button>
      <button class="mini-btn" @click="restartWorldStory(true)" title="Restart the world and story with a brand new random seed">Restart Random</button>
      <button class="mini-btn" @click="restartLargeWorld()" title="Restart the world and story as a large 200-ring debug world">Large World (200)</button>
      <button class="mini-btn" @click="centerCamera()" title="Center camera on world">Center Camera</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { centerCamera } from '../core/camera';
import { sendMessage } from '../core/socket';
import { getWorldGenerationSeed } from '../core/worldVariation';
import { runSnapshot } from '../store/runStore';

const MAX_UINT32 = 0xffffffff;
const DEBUG_SEED_STORAGE_KEY = 'driftlands-restart-seed-v1';
const DEBUG_LARGE_WORLD_RADIUS = 200;

const storySeed = computed(() => runSnapshot.value?.seed ?? null);
const activeWorldSeed = ref(getWorldGenerationSeed());
const seedDraft = ref(loadInitialSeedDraft());

function normalizeSeed(value: string | number | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number.parseInt(raw, 10);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const truncated = Math.trunc(numeric);
  return ((truncated % (MAX_UINT32 + 1)) + (MAX_UINT32 + 1)) % (MAX_UINT32 + 1);
}

function loadInitialSeedDraft() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const stored = window.localStorage.getItem(DEBUG_SEED_STORAGE_KEY);
    if (stored !== null) {
      return stored;
    }
  } catch {
  }

  return '';
}

function persistSeedDraft(seed: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(DEBUG_SEED_STORAGE_KEY, seed);
  } catch {
  }
}

function resolveDraftSeed() {
  return normalizeSeed(seedDraft.value);
}

function setDraft(seed: number | null) {
  if (seed === null) {
    return;
  }
  seedDraft.value = String(seed);
  persistSeedDraft(seedDraft.value);
}

function clearDraft() {
  seedDraft.value = '';
  persistSeedDraft(seedDraft.value);
}

function syncSeedState(seed: number, nextDraft: string = String(seed)) {
  activeWorldSeed.value = seed;
  seedDraft.value = nextDraft;
  persistSeedDraft(seedDraft.value);
}

function syncDraftToCurrentSeed() {
  setDraft(activeWorldSeed.value);
}

function randomizeSeed() {
  const nextSeed = Math.floor(Math.random() * (MAX_UINT32 + 1));
  setDraft(nextSeed);
}

function restartWorldStory(forceRandom: boolean = false, radius?: number) {
  const nextSeed = forceRandom ? null : resolveDraftSeed();
  centerCamera();
  sendMessage({
    type: 'world:restart',
    ...(nextSeed !== null ? { seed: nextSeed } : {}),
    ...(typeof radius === 'number' ? { radius } : {}),
    timestamp: Date.now(),
  });

  if (nextSeed === null) {
    clearDraft();
  } else {
    persistSeedDraft(seedDraft.value);
  }
}

function restartLargeWorld() {
  restartWorldStory(false, DEBUG_LARGE_WORLD_RADIUS);
}

watch(storySeed, (seed) => {
  if (seed === null) {
    activeWorldSeed.value = getWorldGenerationSeed();
    return;
  }

  syncSeedState(seed);
}, { immediate: true });
</script>

<style scoped>
.world-controls {
  @apply flex flex-col gap-2;
}

.world-seed-panel {
  @apply flex flex-col gap-2 rounded-xl border border-slate-700/80 bg-slate-950/85 p-2 shadow-xl backdrop-blur-md;
}

.world-seed-copy {
  @apply flex flex-wrap gap-2;
}

.world-seed-badge {
  @apply rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200;
}

.world-seed-label {
  @apply text-[10px] uppercase tracking-[0.18em] text-amber-200/80;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
}

.world-seed-input {
  @apply rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-white outline-none transition-colors;
}

.world-seed-input:focus {
  @apply border-amber-300/60;
}

.world-seed-hint {
  @apply text-[11px] leading-5 text-slate-300/75;
}

.world-seed-actions {
  @apply flex flex-wrap gap-2;
}

.world-action-row {
  @apply flex gap-2 flex-wrap justify-end;
}

.mini-btn {
  @apply rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-xs font-medium text-white shadow transition-colors hover:bg-slate-600;
}
</style>
