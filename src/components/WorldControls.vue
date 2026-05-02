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
        <button class="mini-btn" type="button" @click="syncDraftToCurrentSeed" title="Copy the active seed into the field">Current</button>
        <button class="mini-btn" type="button" @click="randomizeSeed" title="Generate a random seed and place it in the field">Random</button>
        <button class="mini-btn" type="button" @click="clearDraft" title="Clear the field so the server rolls a fresh random seed">Clear</button>
      </div>
    </div>

    <div class="world-action-row">
      <button class="mini-btn" type="button" @click="restartWorldStory()" title="Restart the world and story using the entered seed">Restart Story</button>
      <button class="mini-btn" type="button" @click="restartWorldStory(true)" title="Restart the world and story with a brand new random seed">Restart Random</button>
      <button class="mini-btn mini-btn--disabled" type="button" disabled :title="LARGE_WORLD_DISABLED_TITLE">Large World (200)</button>
      <button class="mini-btn" type="button" @click="centerCamera()" title="Center camera on world">Center Camera</button>
    </div>

    <div class="test-mode-panel">
      <div class="test-mode-header">
        <div>
          <p class="test-mode-kicker">Debug Helpers</p>
          <h3 class="test-mode-title">Test Mode</h3>
        </div>
        <span class="test-mode-status" :class="{ 'test-mode-status--active': testModeSettings.enabled }">
          {{ testModeSettings.enabled ? 'Enabled' : 'Disabled' }}
        </span>
      </div>

      <p class="test-mode-copy">
        Server-authoritative shortcuts for faster testing. Progression and study selections are remembered and only take effect while test mode is enabled.
      </p>

      <div class="test-mode-toggle-grid">
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.enabled" @change="handleEnabledChange" />
          <span>Enable test mode</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.instantBuild" @change="handleInstantBuildChange" />
          <span>Instant builds</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.unlimitedResources" @change="handleUnlimitedResourcesChange" />
          <span>Unlimited resources</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.fastHeroMovement" @change="handleFastHeroMovementChange" />
          <span>5x hero speed</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.fastGrowth" @change="handleFastGrowthChange" />
          <span>60x growth speed</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.fastPopulationGrowth" @change="handleFastPopulationGrowthChange" />
          <span>10x population growth</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.fastSettlerCycles" @change="handleFastSettlerCyclesChange" />
          <span>5x settler cycles</span>
        </label>
        <label class="test-mode-toggle">
          <input type="checkbox" :checked="testModeSettings.supportTiles" @change="handleSupportTilesChange" />
          <span>Support tiles</span>
        </label>
      </div>

      <section class="test-mode-section">
        <div class="test-mode-section-header">
          <div>
            <p class="test-mode-section-title">Settlement progression</p>
            <p class="test-mode-section-subtitle">
              {{ currentSettlementId ? `Applies to settlement ${currentSettlementId}` : 'Found a settlement to edit progression unlocks.' }}
            </p>
          </div>
          <div class="test-mode-section-actions">
            <button class="mini-btn" type="button" :disabled="!currentSettlementId" @click="unlockAllProgression">All</button>
            <button class="mini-btn" type="button" :disabled="!currentSettlementId || currentProgressionOverrides.length === 0" @click="clearProgressionOverrides">Clear</button>
          </div>
        </div>

        <div class="test-mode-list" :class="{ 'test-mode-list--disabled': !currentSettlementId }">
          <label
            v-for="node in progressionNodes"
            :key="node.key"
            class="test-mode-list-item"
          >
            <input
              type="checkbox"
              :checked="currentProgressionOverrideSet.has(node.key)"
              :disabled="!currentSettlementId"
              @change="toggleProgressionNode(node.key)"
            />
            <span class="test-mode-list-copy">
              <strong>{{ node.label }}</strong>
              <small>{{ node.category }}</small>
            </span>
          </label>
        </div>
      </section>

      <section class="test-mode-section">
        <div class="test-mode-section-header">
          <div>
            <p class="test-mode-section-title">Study completions</p>
            <p class="test-mode-section-subtitle">Marks studies complete without spending worker time.</p>
          </div>
          <div class="test-mode-section-actions">
            <button class="mini-btn" type="button" @click="completeAllStudies">All</button>
            <button class="mini-btn" type="button" :disabled="testModeSettings.completedStudyKeys.length === 0" @click="clearStudyOverrides">Clear</button>
          </div>
        </div>

        <div class="test-mode-list">
          <label
            v-for="study in studyDefinitions"
            :key="study.key"
            class="test-mode-list-item"
          >
            <input
              type="checkbox"
              :checked="completedStudyKeySet.has(study.key)"
              @change="toggleStudy(study.key)"
            />
            <span class="test-mode-list-copy">
              <strong>{{ study.label }}</strong>
              <small>{{ study.summary }}</small>
            </span>
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { centerCamera } from '../core/camera';
import { sendMessage } from '../core/socket';
import { getWorldGenerationSeed } from '../core/worldVariation';
import { runSnapshot } from '../store/runStore';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import {
  getProgressionOverrideNodeKeys,
  testModeSettings,
} from '../shared/game/testMode.ts';
import {
  listProgressionNodeDefinitions,
  type ProgressionNodeKey,
} from '../shared/story/progression.ts';
import {
  listStudyDefinitions,
  type StudyKey,
} from '../shared/studies/studies.ts';

const MAX_UINT32 = 0xffffffff;
const DEBUG_SEED_STORAGE_KEY = 'driftlands-restart-seed-v1';
const LARGE_WORLD_DISABLED_TITLE = 'Disabled for now: 200-ring worlds can overwhelm the server snapshot path.';

const progressionNodes = listProgressionNodeDefinitions();
const studyDefinitions = listStudyDefinitions();

const storySeed = computed(() => runSnapshot.value?.seed ?? null);
const activeWorldSeed = ref(getWorldGenerationSeed());
const seedDraft = ref(loadInitialSeedDraft());
const currentSettlementId = computed(() => currentPlayerSettlementId.value);
const currentProgressionOverrides = computed(() => {
  return getProgressionOverrideNodeKeys(testModeSettings, currentSettlementId.value);
});
const currentProgressionOverrideSet = computed(() => new Set(currentProgressionOverrides.value));
const completedStudyKeySet = computed(() => new Set(testModeSettings.completedStudyKeys));

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

function sendTestSettings(message: {
  enabled?: boolean;
  instantBuild?: boolean;
  unlimitedResources?: boolean;
  fastHeroMovement?: boolean;
  fastGrowth?: boolean;
  fastPopulationGrowth?: boolean;
  fastSettlerCycles?: boolean;
  supportTiles?: boolean;
  unlockedNodeKeys?: ProgressionNodeKey[];
  completedStudyKeys?: StudyKey[];
}) {
  sendMessage({
    type: 'test:set_settings',
    settlementId: currentSettlementId.value,
    ...message,
    timestamp: Date.now(),
  });
}

function setTestModeEnabled(enabled: boolean) {
  sendTestSettings({ enabled });
}

function setInstantBuild(enabled: boolean) {
  sendTestSettings({ instantBuild: enabled });
}

function setUnlimitedResources(enabled: boolean) {
  sendTestSettings({ unlimitedResources: enabled });
}

function setFastHeroMovement(enabled: boolean) {
  sendTestSettings({ fastHeroMovement: enabled });
}

function setFastGrowth(enabled: boolean) {
  sendTestSettings({ fastGrowth: enabled });
}

function setFastPopulationGrowth(enabled: boolean) {
  sendTestSettings({ fastPopulationGrowth: enabled });
}

function setFastSettlerCycles(enabled: boolean) {
  sendTestSettings({ fastSettlerCycles: enabled });
}

function setSupportTiles(enabled: boolean) {
  sendTestSettings({ supportTiles: enabled });
}

function handleEnabledChange(event: Event) {
  setTestModeEnabled((event.target as HTMLInputElement).checked);
}

function handleInstantBuildChange(event: Event) {
  setInstantBuild((event.target as HTMLInputElement).checked);
}

function handleUnlimitedResourcesChange(event: Event) {
  setUnlimitedResources((event.target as HTMLInputElement).checked);
}

function handleFastHeroMovementChange(event: Event) {
  setFastHeroMovement((event.target as HTMLInputElement).checked);
}

function handleFastGrowthChange(event: Event) {
  setFastGrowth((event.target as HTMLInputElement).checked);
}

function handleFastPopulationGrowthChange(event: Event) {
  setFastPopulationGrowth((event.target as HTMLInputElement).checked);
}

function handleFastSettlerCyclesChange(event: Event) {
  setFastSettlerCycles((event.target as HTMLInputElement).checked);
}

function handleSupportTilesChange(event: Event) {
  setSupportTiles((event.target as HTMLInputElement).checked);
}

function toggleProgressionNode(nodeKey: ProgressionNodeKey) {
  if (!currentSettlementId.value) {
    return;
  }

  const next = new Set(currentProgressionOverrides.value);
  if (next.has(nodeKey)) {
    next.delete(nodeKey);
  } else {
    next.add(nodeKey);
  }

  sendTestSettings({ unlockedNodeKeys: progressionNodes.filter((node) => next.has(node.key)).map((node) => node.key) });
}

function unlockAllProgression() {
  if (!currentSettlementId.value) {
    return;
  }

  sendTestSettings({ unlockedNodeKeys: progressionNodes.map((node) => node.key) });
}

function clearProgressionOverrides() {
  if (!currentSettlementId.value) {
    return;
  }

  sendTestSettings({ unlockedNodeKeys: [] });
}

function toggleStudy(studyKey: StudyKey) {
  const next = new Set(testModeSettings.completedStudyKeys);
  if (next.has(studyKey)) {
    next.delete(studyKey);
  } else {
    next.add(studyKey);
  }

  sendTestSettings({ completedStudyKeys: studyDefinitions.filter((study) => next.has(study.key)).map((study) => study.key) });
}

function completeAllStudies() {
  sendTestSettings({ completedStudyKeys: studyDefinitions.map((study) => study.key) });
}

function clearStudyOverrides() {
  sendTestSettings({ completedStudyKeys: [] });
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

.world-seed-panel,
.test-mode-panel {
  @apply flex flex-col gap-2 rounded-xl border border-slate-700/80 bg-slate-950/85 p-2 shadow-xl backdrop-blur-md;
}

.world-seed-copy {
  @apply flex flex-wrap gap-2;
}

.world-seed-badge,
.test-mode-status {
  @apply rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200;
}

.test-mode-status--active {
  @apply border-emerald-400/40 bg-emerald-950/80 text-emerald-200;
}

.world-seed-label,
.test-mode-kicker,
.test-mode-section-title {
  @apply text-[10px] uppercase tracking-[0.18em] text-amber-200/80;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
}

.world-seed-input {
  @apply rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-white outline-none transition-colors;
}

.world-seed-input:focus {
  @apply border-amber-300/60;
}

.world-seed-hint,
.test-mode-copy,
.test-mode-section-subtitle,
.test-mode-list-copy small {
  @apply text-[11px] leading-5 text-slate-300/75;
}

.world-seed-actions,
.test-mode-section-actions {
  @apply flex flex-wrap gap-2;
}

.world-action-row {
  @apply flex gap-2 flex-wrap justify-end;
}

.mini-btn {
  @apply rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-xs font-medium text-white shadow transition-colors hover:bg-slate-600;
}

.mini-btn:disabled,
.mini-btn--disabled,
.mini-btn--disabled:hover {
  @apply cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500;
  box-shadow: none;
}

.test-mode-header,
.test-mode-section-header {
  @apply flex items-start justify-between gap-3;
}

.test-mode-title {
  @apply text-sm font-semibold text-white;
}

.test-mode-toggle-grid {
  @apply grid gap-2;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.test-mode-toggle,
.test-mode-list-item {
  @apply flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-xs text-slate-100;
}

.test-mode-toggle input,
.test-mode-list-item input {
  @apply mt-0.5 h-3.5 w-3.5 accent-emerald-500;
}

.test-mode-section {
  @apply flex flex-col gap-2 rounded-lg border border-slate-800/70 bg-slate-950/60 p-2;
}

.test-mode-list {
  @apply grid gap-2 max-h-56 overflow-y-auto pr-1;
}

.test-mode-list--disabled {
  @apply opacity-60;
}

.test-mode-list-copy {
  @apply flex min-w-0 flex-col gap-1;
}

.test-mode-list-copy strong {
  @apply text-xs font-semibold text-slate-100;
}
</style>
