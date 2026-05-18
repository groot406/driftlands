<template>
  <div class="world-controls">
    <header class="debug-panel-header">
      <div>
        <p class="debug-kicker">Debug Helpers</p>
        <h3 class="debug-title">Test Mode</h3>
      </div>
      <div class="debug-status-row">
        <span class="debug-badge">Seed {{ activeWorldSeed }}</span>
        <span class="debug-badge" :class="{ 'debug-badge--active': testModeSettings.enabled }">
          {{ testModeSettings.enabled ? 'Enabled' : 'Off' }}
        </span>
      </div>
    </header>

    <div class="debug-panel-body">
      <section class="debug-section debug-section--seed">
        <label class="debug-label" for="world-seed-input">Restart Seed</label>
        <div class="seed-row">
          <input
            id="world-seed-input"
            v-model="seedDraft"
            class="world-seed-input"
            type="number"
            inputmode="numeric"
            min="0"
            max="4294967295"
            step="1"
            placeholder="Random"
            @keydown.enter.prevent="restartWorldStory()"
          />
          <button class="mini-btn" type="button" @click="syncDraftToCurrentSeed" title="Copy the active seed into the field">Current</button>
          <button class="mini-btn" type="button" @click="randomizeSeed" title="Generate a random seed and place it in the field">Random</button>
          <button class="mini-btn" type="button" @click="clearDraft" title="Clear the field so the server rolls a fresh random seed">Clear</button>
        </div>

        <div class="world-action-row">
          <button class="mini-btn mini-btn--strong" type="button" @click="restartWorldStory()" title="Restart the world and story using the entered seed">Restart</button>
          <button class="mini-btn" type="button" @click="restartWorldStory(true)" title="Restart the world and story with a brand new random seed">Fresh Seed</button>
          <button class="mini-btn mini-btn--disabled" type="button" disabled :title="LARGE_WORLD_DISABLED_TITLE">World 200</button>
          <button class="mini-btn" type="button" @click="centerCamera()" title="Center camera on world">Center</button>
        </div>
      </section>

      <nav class="debug-tabs" aria-label="Debug sections">
        <button class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'quick' }" type="button" @click="activeDebugTab = 'quick'">Quick</button>
        <button class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'progression' }" type="button" @click="activeDebugTab = 'progression'">Progress</button>
        <button class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'studies' }" type="button" @click="activeDebugTab = 'studies'">Studies</button>
      </nav>

      <div class="debug-tab-panel">
        <template v-if="activeDebugTab === 'quick'">
          <div class="test-mode-toggle-grid">
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.enabled" @change="handleEnabledChange" />
              <span>Test mode</span>
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
              <input type="checkbox" :checked="testModeSettings.bypassHunger" @change="handleBypassHungerChange" />
              <span>Bypass hunger</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.bypassMorale" @change="handleBypassMoraleChange" />
              <span>Bypass morale</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.fastHeroMovement" @change="handleFastHeroMovementChange" />
              <span>5x hero speed</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.fastGrowth" @change="handleFastGrowthChange" />
              <span>60x growth</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.fastPopulationGrowth" @change="handleFastPopulationGrowthChange" />
              <span>10x population</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.fastSettlerCycles" @change="handleFastSettlerCyclesChange" />
              <span>5x settlers</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.fastGuardTraining" @change="handleFastGuardTrainingChange" />
              <span>10x guards</span>
            </label>
            <label class="test-mode-toggle">
              <input type="checkbox" :checked="testModeSettings.supportTiles" @change="handleSupportTilesChange" />
              <span>Support tiles</span>
            </label>
          </div>

          <section class="test-mode-section">
            <div class="test-mode-section-header">
              <p class="test-mode-section-title">Military</p>
            </div>
            <div class="test-mode-section-actions">
              <button class="mini-btn" type="button" :disabled="!currentSettlementId" @click="prepareMilitarySandbox">Prep</button>
              <button class="mini-btn" type="button" :disabled="!currentSettlementId" @click="grantGuardReserve">+5 Guards</button>
              <button class="mini-btn" type="button" :disabled="!currentSettlementId" @click="grantWeapons">+20 Weapons</button>
              <button class="mini-btn" type="button" :disabled="!currentSettlementId" @click="openBorders">Open Borders</button>
            </div>
          </section>

          <section class="test-mode-section">
            <div class="test-mode-section-header">
              <p class="test-mode-section-title">Calamities</p>
            </div>
            <div class="test-mode-section-actions">
              <button class="mini-btn" type="button" :disabled="!currentSettlementId" @click="triggerRandomCalamity">Random</button>
              <button
                v-for="calamity in calamityButtons"
                :key="calamity.kind"
                class="mini-btn"
                type="button"
                :disabled="!currentSettlementId"
                @click="triggerCalamity(calamity.kind)"
              >
                {{ calamity.label }}
              </button>
            </div>
          </section>
        </template>

        <section v-else-if="activeDebugTab === 'progression'" class="test-mode-section test-mode-section--fill">
          <div class="test-mode-section-header">
            <div>
              <p class="test-mode-section-title">Settlement Progression</p>
              <p class="test-mode-section-subtitle">
                {{ currentSettlementId ? currentSettlementId : 'No settlement selected' }}
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

        <section v-else class="test-mode-section test-mode-section--fill">
          <div class="test-mode-section-header">
            <div>
              <p class="test-mode-section-title">Study Completions</p>
              <p class="test-mode-section-subtitle">Complete research instantly.</p>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CalamityKind } from '../shared/protocol';
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
const calamityButtons: { kind: CalamityKind; label: string }[] = [
  { kind: 'volcano_eruption', label: 'Volcano' },
  { kind: 'flood', label: 'Flood' },
  { kind: 'lost_harvest', label: 'Harvest' },
  { kind: 'food_spoilage', label: 'Spoilage' },
  { kind: 'forest_fire', label: 'Fire' },
  { kind: 'outbreak', label: 'Outbreak' },
];

const activeDebugTab = ref<'quick' | 'progression' | 'studies'>('quick');
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
  bypassHunger?: boolean;
  bypassMorale?: boolean;
  fastHeroMovement?: boolean;
  fastGrowth?: boolean;
  fastPopulationGrowth?: boolean;
  fastSettlerCycles?: boolean;
  fastGuardTraining?: boolean;
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

function setBypassHunger(enabled: boolean) {
  sendTestSettings({ bypassHunger: enabled });
}

function setBypassMorale(enabled: boolean) {
  sendTestSettings({ bypassMorale: enabled });
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

function setFastGuardTraining(enabled: boolean) {
  sendTestSettings({ fastGuardTraining: enabled });
}

function setSupportTiles(enabled: boolean) {
  sendTestSettings({ supportTiles: enabled });
}

function runTestAction(
  action: 'prepare_military_sandbox' | 'grant_guard_reserve' | 'grant_weapons' | 'trigger_calamity',
  amount?: number,
  calamityKind?: CalamityKind,
) {
  sendMessage({
    type: 'test:run_action',
    settlementId: currentSettlementId.value,
    action,
    ...(typeof amount === 'number' ? { amount } : {}),
    ...(calamityKind ? { calamityKind } : {}),
    timestamp: Date.now(),
  });
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

function handleBypassHungerChange(event: Event) {
  setBypassHunger((event.target as HTMLInputElement).checked);
}

function handleBypassMoraleChange(event: Event) {
  setBypassMorale((event.target as HTMLInputElement).checked);
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

function handleFastGuardTrainingChange(event: Event) {
  setFastGuardTraining((event.target as HTMLInputElement).checked);
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

function prepareMilitarySandbox() {
  runTestAction('prepare_military_sandbox');
}

function grantGuardReserve() {
  runTestAction('grant_guard_reserve', 5);
}

function grantWeapons() {
  runTestAction('grant_weapons', 20);
}

function triggerCalamity(kind: CalamityKind) {
  runTestAction('trigger_calamity', undefined, kind);
}

function triggerRandomCalamity() {
  runTestAction('trigger_calamity');
}

function openBorders() {
  if (!currentSettlementId.value) {
    return;
  }

  sendMessage({
    type: 'settlement:set_border_mode',
    settlementId: currentSettlementId.value,
    borderMode: 'open',
    timestamp: Date.now(),
  });
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
  @apply flex flex-col overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/90 shadow-xl backdrop-blur-md;
  width: min(30rem, calc(100vw - 1rem));
  max-height: calc(100vh - 7.5rem);
}

.debug-panel-header {
  @apply flex shrink-0 items-start justify-between gap-3 border-b border-slate-800/80 bg-slate-950/95 px-3 py-2;
}

.debug-kicker,
.debug-label,
.test-mode-section-title {
  @apply text-[9px] uppercase tracking-normal text-amber-200/80;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
}

.debug-title {
  @apply mt-1 text-sm font-semibold text-white;
}

.debug-status-row {
  @apply flex flex-wrap justify-end gap-1;
}

.debug-badge {
  @apply rounded-md border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-normal text-slate-200;
}

.debug-badge--active {
  @apply border-emerald-400/40 bg-emerald-950/80 text-emerald-200;
}

.debug-panel-body {
  @apply flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2;
}

.debug-section {
  @apply flex shrink-0 flex-col gap-2 rounded-md border border-slate-800/80 bg-slate-900/55 p-2;
}

.seed-row {
  @apply grid gap-1.5;
  grid-template-columns: minmax(0, 1fr) repeat(3, auto);
}

.world-seed-input {
  @apply h-8 min-w-0 rounded-md border border-slate-600 bg-slate-950/80 px-2 text-xs font-medium text-white outline-none transition-colors;
}

.world-seed-input:focus {
  @apply border-amber-300/60;
}

.test-mode-section-subtitle,
.test-mode-list-copy small {
  @apply text-[10px] leading-4 text-slate-300/75;
}

.world-action-row,
.test-mode-section-actions {
  @apply flex flex-wrap gap-1.5;
}

.world-action-row {
  @apply justify-end;
}

.debug-tabs {
  @apply grid shrink-0 gap-1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.debug-tab {
  @apply h-8 rounded-md border border-slate-800 bg-slate-900/75 px-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800;
}

.debug-tab--active {
  @apply border-amber-300/50 bg-amber-950/45 text-amber-100;
}

.debug-tab-panel {
  @apply flex min-h-0 flex-1 flex-col gap-2 overflow-hidden;
}

.mini-btn {
  @apply h-8 rounded-md border border-slate-600 bg-slate-700 px-2 text-xs font-medium text-white shadow transition-colors hover:bg-slate-600;
}

.mini-btn--strong {
  @apply border-amber-300/50 bg-amber-700/70 text-amber-50 hover:bg-amber-700;
}

.mini-btn:disabled,
.mini-btn--disabled,
.mini-btn--disabled:hover {
  @apply cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500;
  box-shadow: none;
}

.test-mode-header,
.test-mode-section-header {
  @apply flex shrink-0 items-start justify-between gap-3;
}

.test-mode-toggle-grid {
  @apply grid gap-1.5;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.test-mode-toggle,
.test-mode-list-item {
  @apply flex items-start gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100;
}

.test-mode-toggle input,
.test-mode-list-item input {
  @apply mt-0.5 h-3.5 w-3.5 accent-emerald-500;
}

.test-mode-section {
  @apply flex min-h-0 flex-col gap-2 rounded-md border border-slate-800/70 bg-slate-950/60 p-2;
}

.test-mode-section--fill {
  @apply flex-1;
}

.test-mode-list {
  @apply grid min-h-0 flex-1 gap-1.5 overflow-y-auto pr-1;
}

.test-mode-list--disabled {
  @apply opacity-60;
}

.test-mode-list-copy {
  @apply flex min-w-0 flex-col gap-1;
}

.test-mode-list-copy strong {
  @apply text-xs font-semibold leading-4 text-slate-100;
}

@media (max-width: 720px) {
  .world-controls {
    width: calc(100vw - 1rem);
    max-height: calc(100vh - 6rem);
  }

  .seed-row {
    grid-template-columns: minmax(0, 1fr) repeat(2, auto);
  }

  .seed-row .mini-btn:last-child {
    grid-column: 1 / -1;
  }

  .test-mode-toggle-grid {
    grid-template-columns: 1fr;
  }
}
</style>
