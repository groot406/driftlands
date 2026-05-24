<template>
  <div class="world-controls">
    <header class="debug-panel-header">
      <div>
        <p class="debug-kicker">{{ showDebugSections ? 'Debug Helpers' : 'Admin Tools' }}</p>
        <h3 class="debug-title">{{ panelTitle }}</h3>
      </div>
      <div class="debug-status-row">
        <span class="debug-badge">Seed {{ activeWorldSeed }}</span>
        <span v-if="showDebugSections" class="debug-badge" :class="{ 'debug-badge--active': testModeSettings.enabled }">
          {{ testModeSettings.enabled ? 'Enabled' : 'Off' }}
        </span>
        <span v-else class="debug-badge debug-badge--active">Admin</span>
      </div>
    </header>

    <div class="debug-panel-body">
      <section v-if="showDebugSections" class="debug-section debug-section--seed">
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
        <button v-if="showDebugSections" class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'quick' }" type="button" @click="activeDebugTab = 'quick'">Quick</button>
        <button v-if="canUsePersistenceControls" class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'saves' }" type="button" @click="activeDebugTab = 'saves'">Saves</button>
        <button class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'season' }" type="button" @click="activeDebugTab = 'season'">Season</button>
        <button v-if="showDebugSections" class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'progression' }" type="button" @click="activeDebugTab = 'progression'">Progress</button>
        <button v-if="showDebugSections" class="debug-tab" :class="{ 'debug-tab--active': activeDebugTab === 'studies' }" type="button" @click="activeDebugTab = 'studies'">Studies</button>
      </nav>

      <div class="debug-tab-panel">
        <template v-if="activeDebugTab === 'quick' && showDebugSections">
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

        <section v-else-if="activeDebugTab === 'saves' && canUsePersistenceControls" class="test-mode-section test-mode-section--fill">
          <div class="test-mode-section-header">
            <div>
              <p class="test-mode-section-title">Persistence</p>
              <p class="test-mode-section-subtitle">{{ persistenceStatusText }}</p>
            </div>
          </div>

          <div class="persistence-debug-card">
            <div class="persistence-debug-grid">
              <span>Path</span>
              <strong :title="persistenceStatus?.path ?? ''">{{ persistenceStatus?.path ?? 'No save path' }}</strong>
              <span>File</span>
              <strong>{{ persistenceStatus?.fileExists ? 'Found' : 'Missing' }}</strong>
              <span>Last save</span>
              <strong>{{ lastPersistenceSaveLabel }}</strong>
              <span>World</span>
              <strong>{{ persistenceSummaryLabel }}</strong>
            </div>

            <div class="test-mode-section-actions">
              <button class="mini-btn mini-btn--strong" type="button" :disabled="persistenceBusy || !persistenceStatus?.enabled" @click="savePersistenceNow">
                {{ persistenceBusyAction === 'save' ? 'Saving...' : 'Save Now' }}
              </button>
              <button class="mini-btn" type="button" :disabled="persistenceBusy" @click="requestPersistenceStatus">Refresh</button>
            </div>
          </div>

          <div class="persistence-debug-card">
            <label class="persistence-save-as">
              <span>Save as</span>
              <input
                v-model="persistenceSaveName"
                type="text"
                maxlength="64"
                placeholder="Before testing docks"
                :disabled="persistenceBusy || !persistenceStatus?.enabled"
                @keydown.enter.prevent="savePersistenceAs"
              />
            </label>
            <div class="test-mode-section-actions">
              <button class="mini-btn mini-btn--strong" type="button" :disabled="persistenceBusy || !persistenceStatus?.enabled || !persistenceSaveName.trim()" @click="savePersistenceAs">
                {{ persistenceBusyAction === 'save-as' ? 'Saving...' : 'Save As' }}
              </button>
            </div>
          </div>

          <div class="persistence-saved-list">
            <article v-for="savedState in persistenceSavedStates" :key="savedState.id" class="persistence-saved-item">
              <div class="persistence-saved-item__copy">
                <strong :title="savedState.path">{{ savedState.name }}</strong>
                <span>{{ formatSavedStateLabel(savedState) }}</span>
              </div>
              <div class="persistence-saved-item__actions">
                <button class="mini-btn" type="button" :disabled="persistenceBusy" @click="loadPersistenceSavedState(savedState.id, savedState.name)">Load</button>
                <button class="mini-btn mini-btn--danger" type="button" :disabled="persistenceBusy" @click="removePersistenceSavedState(savedState.id, savedState.name)">Remove</button>
              </div>
            </article>
            <p v-if="persistenceSavedStates.length === 0" class="test-mode-section-subtitle">No named saves yet.</p>
          </div>
        </section>

        <section v-else-if="activeDebugTab === 'season'" class="test-mode-section test-mode-section--fill">
          <div class="test-mode-section-header">
            <div>
              <p class="test-mode-section-title">Season Control</p>
              <p class="test-mode-section-subtitle">{{ seasonStatusText }}</p>
            </div>
          </div>

          <div v-if="season" class="season-admin-summary">
            <div>
              <p class="season-admin-summary__label">Current Stage</p>
              <strong>{{ stageLabel(season.currentStage) }}</strong>
              <span>{{ seasonStatusText }}</span>
            </div>
            <div>
              <p class="season-admin-summary__label">Next Automatic Change</p>
              <strong>{{ nextSeasonChangeLabel }}</strong>
              <span>{{ nextSeasonChangeDescription }}</span>
            </div>
          </div>

          <div class="season-admin-actions">
            <article class="season-admin-action">
              <div>
                <strong>Finish season now</strong>
                <span>Locks final scoring immediately and moves the season to the completed board.</span>
              </div>
              <button class="mini-btn mini-btn--danger" type="button" :disabled="!season || season.status === 'completed'" @click="completeSeasonNow">
                Finish Now
              </button>
            </article>
            <article class="season-admin-action">
              <div>
                <strong>Restore default tuning</strong>
                <span>Resets stage lengths, border rules, gameplay pacing and end goals to the built-in defaults.</span>
              </div>
              <button class="mini-btn" type="button" @click="restoreDefaultSeasonConfig">Restore Defaults</button>
            </article>
          </div>

          <div v-if="season?.status === 'completed'" class="season-restart-admin">
            <div>
              <p class="test-mode-section-title">Start Next World Now</p>
              <p class="test-mode-section-subtitle">Starts the next season immediately. Random seed clears the seed field; fixed seed uses the number below.</p>
            </div>
            <div class="season-restart-admin__seed">
              <input
                v-model="seedDraft"
                class="world-seed-input"
                type="number"
                inputmode="numeric"
                min="0"
                max="4294967295"
                step="1"
                placeholder="Fixed seed"
              />
              <button class="mini-btn" type="button" @click="syncDraftToCurrentSeed">Current</button>
              <button class="mini-btn" type="button" @click="randomizeSeed">Random</button>
              <button class="mini-btn" type="button" @click="clearDraft">Clear</button>
            </div>
            <div class="test-mode-section-actions">
              <button class="mini-btn mini-btn--strong" type="button" @click="restartSeasonNow(true)">Start Random Seed</button>
              <button class="mini-btn" type="button" :disabled="fixedRestartSeed === null" @click="restartSeasonNow(false)">Start Fixed Seed</button>
            </div>
          </div>

          <div v-if="season" class="season-debug-grid">
            <article
              v-for="stage in season.config.stages"
              :key="stage.key"
              class="season-debug-card"
              :class="{ 'season-debug-card--active': stage.key === season.currentStage }"
            >
              <div class="season-debug-card__head">
                <div class="season-stage-heading">
                  <p>{{ stageLabel(stage.key) }}</p>
                  <span>{{ stageSummary(stage) }}</span>
                </div>
                <span class="season-stage-pill" :class="{ 'season-stage-pill--current': stage.key === season.currentStage, 'season-stage-pill--disabled': !stage.enabled }">
                  {{ stageStatusLabel(stage) }}
                </span>
              </div>
              <div class="season-stage-action-row">
                <button class="mini-btn" type="button" :disabled="!stage.enabled" @click="jumpToSeasonStage(stage.key)">
                  Jump Here Now
                </button>
                <span>{{ stage.enabled ? 'Immediately changes the live season stage.' : 'Enable this stage before jumping to it.' }}</span>
              </div>
              <label class="test-mode-toggle season-debug-toggle">
                <input type="checkbox" :checked="stage.enabled" @change="setSeasonStageEnabled(stage.key, ($event.target as HTMLInputElement).checked)" />
                <span>
                  <strong>Use this stage in the timeline</strong>
                  <small>Disabled stages are skipped when the season advances automatically.</small>
                </span>
              </label>
              <label class="season-debug-field">
                <span>Duration (minutes)</span>
                <input
                  :value="durationMinutes(stage.durationMs)"
                  type="number"
                  min="0"
                  step="1"
                  @change="setSeasonStageDuration(stage.key, ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="season-debug-field">
                <span>Border rule</span>
                <select :value="stage.borderPolicy" @change="setSeasonStageBorder(stage.key, ($event.target as HTMLSelectElement).value)">
                  <option value="locked_closed">Locked closed</option>
                  <option value="locked_open">Locked open</option>
                  <option value="player_choice">Player choice</option>
                </select>
              </label>
              <label class="test-mode-toggle">
                <input type="checkbox" :checked="stage.allowSettlementStarts" @change="setSeasonStageStarts(stage.key, ($event.target as HTMLInputElement).checked)" />
                <span>
                  <strong>Allow new settlements</strong>
                  <small>{{ stage.allowSettlementStarts ? 'Players can found colonies during this stage.' : 'New colony starts are blocked during this stage.' }}</small>
                </span>
              </label>
              <details class="season-debug-advanced">
                <summary>Advanced event and ship tuning</summary>
                <p>These values save immediately and affect this stage whenever it is active.</p>
                <div class="season-debug-subgrid">
                <label class="season-debug-field">
                  <span>TPS</span>
                  <input
                    :value="stage.gameplay?.serverTickRate ?? 10"
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    @change="setSeasonGameplayNumber(stage.key, 'serverTickRate', ($event.target as HTMLInputElement).value, 1, 120)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Disaster every</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.calamityRollIntervalMs ?? 9 * 60_000)"
                    type="number"
                    min="1"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'calamityRollIntervalMs', ($event.target as HTMLInputElement).value, 1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Disaster %</span>
                  <input
                    :value="Math.round((stage.gameplay?.calamityRollChance ?? 0.28) * 100)"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    @change="setSeasonGameplayPercent(stage.key, 'calamityRollChance', ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Warn min</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.calamityWarningLeadMs ?? 3 * 60_000)"
                    type="number"
                    min="0"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'calamityWarningLeadMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>1st ship min</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.shipFirstArrivalMinMs ?? 2 * 60_000)"
                    type="number"
                    min="1"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'shipFirstArrivalMinMs', ($event.target as HTMLInputElement).value, 1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>1st ship max</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.shipFirstArrivalMaxMs ?? 5 * 60_000)"
                    type="number"
                    min="1"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'shipFirstArrivalMaxMs', ($event.target as HTMLInputElement).value, 1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Next ship min</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.shipNextArrivalMinMs ?? 15 * 60_000)"
                    type="number"
                    min="1"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'shipNextArrivalMinMs', ($event.target as HTMLInputElement).value, 1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Next ship max</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.shipNextArrivalMaxMs ?? 20 * 60_000)"
                    type="number"
                    min="1"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'shipNextArrivalMaxMs', ($event.target as HTMLInputElement).value, 1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Dock min</span>
                  <input
                    :value="durationMinutes(stage.gameplay?.shipDockedDurationMs ?? 12 * 60_000)"
                    type="number"
                    min="1"
                    step="1"
                    @change="setSeasonGameplayMinutes(stage.key, 'shipDockedDurationMs', ($event.target as HTMLInputElement).value, 1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Order x</span>
                  <input
                    :value="stage.gameplay?.shipOrderSizeMultiplier ?? 1"
                    type="number"
                    min="0.1"
                    step="0.1"
                    @change="setSeasonGameplayNumber(stage.key, 'shipOrderSizeMultiplier', ($event.target as HTMLInputElement).value, 0.1)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Gold x</span>
                  <input
                    :value="stage.gameplay?.shipRewardGoldMultiplier ?? 1"
                    type="number"
                    min="0"
                    step="0.1"
                    @change="setSeasonGameplayNumber(stage.key, 'shipRewardGoldMultiplier', ($event.target as HTMLInputElement).value, 0)"
                  />
                </label>
                <label class="season-debug-field">
                  <span>Goods x</span>
                  <input
                    :value="stage.gameplay?.shipRewardGoodsMultiplier ?? 1"
                    type="number"
                    min="0"
                    step="0.1"
                    @change="setSeasonGameplayNumber(stage.key, 'shipRewardGoodsMultiplier', ($event.target as HTMLInputElement).value, 0)"
                  />
                </label>
                </div>
              </details>
            </article>
          </div>

          <div v-if="season" class="season-debug-goals">
            <div class="test-mode-section-header">
              <div>
                <p class="test-mode-section-title">End Goals</p>
                <p class="test-mode-section-subtitle">Enabled goals can complete the season early when their target is reached.</p>
              </div>
            </div>
            <label
              v-for="goal in season.config.endGoals"
              :key="goal.id"
              class="season-debug-goal"
            >
              <input type="checkbox" :checked="goal.enabled" @change="setSeasonGoalEnabled(goal.id, ($event.target as HTMLInputElement).checked)" />
              <span>
                <strong>{{ formatSeasonEndGoalLabel(goal) }}</strong>
                <small>{{ goal.kind }}</small>
              </span>
              <input
                class="season-debug-goal__target"
                :value="goal.target ?? 0"
                type="number"
                min="1"
                step="1"
                @change="setSeasonGoalTarget(goal.id, ($event.target as HTMLInputElement).value)"
              />
              <input
                v-if="goal.kind === 'controlled_tiles_and_percent'"
                class="season-debug-goal__target"
                :value="goal.percent ?? 0"
                type="number"
                min="0"
                max="100"
                step="1"
                @change="setSeasonGoalPercent(goal.id, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <p v-else class="test-mode-section-subtitle">No season snapshot received yet.</p>
        </section>

        <section v-else-if="activeDebugTab === 'progression' && showDebugSections" class="test-mode-section test-mode-section--fill">
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

        <section v-else-if="activeDebugTab === 'studies' && showDebugSections" class="test-mode-section test-mode-section--fill">
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { CalamityKind, PersistenceSavedStateSummary, PersistenceStatusMessage } from '../shared/protocol';
import { centerCamera } from '../core/camera';
import { sendMessage } from '../core/socket';
import { clientMessageRouter } from '../core/messageRouter';
import { getWorldGenerationSeed } from '../core/worldVariation';
import { runSnapshot } from '../store/runStore';
import { currentPlayerIsAdmin, serverDebugModeEnabled } from '../store/serverConfigStore.ts';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import {
  createDefaultSeasonConfig,
  type ActiveSeasonStageKey,
  type SeasonBorderPolicy,
  type SeasonConfig,
  type SeasonStageConfig,
  type SeasonStageGameplayConfig,
} from '../shared/seasons/types.ts';
import { formatSeasonEndGoalLabel } from '../shared/seasons/scoring.ts';
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
const PERSISTENCE_RESPONSE_TIMEOUT_MS = 8_000;

const props = defineProps<{
  adminFocus?: boolean;
}>();

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

type WorldControlTab = 'quick' | 'saves' | 'season' | 'progression' | 'studies';

const showDebugSections = computed(() => serverDebugModeEnabled.value && !props.adminFocus);
const canUsePersistenceControls = computed(() => serverDebugModeEnabled.value || currentPlayerIsAdmin.value);
const activeDebugTab = ref<WorldControlTab>(showDebugSections.value ? 'quick' : 'season');
const panelTitle = computed(() => {
  if (activeDebugTab.value === 'saves') {
    return 'Saved Worlds';
  }

  return showDebugSections.value ? 'Test Mode' : 'Season Control';
});
const storySeed = computed(() => runSnapshot.value?.seed ?? null);
const season = computed(() => seasonSnapshot.value);
const activeWorldSeed = ref(getWorldGenerationSeed());
const seedDraft = ref(loadInitialSeedDraft());
const persistenceStatus = ref<PersistenceStatusMessage | null>(null);
const persistenceBusy = ref(false);
const persistenceBusyAction = ref<'save' | 'save-as' | 'load' | 'remove' | null>(null);
const persistenceClientError = ref('');
const persistenceSaveName = ref('');
let persistenceResponseTimeout: number | null = null;
const fixedRestartSeed = computed(() => resolveDraftSeed());
const currentSettlementId = computed(() => currentPlayerSettlementId.value);
const currentProgressionOverrides = computed(() => {
  return getProgressionOverrideNodeKeys(testModeSettings, currentSettlementId.value);
});
const currentProgressionOverrideSet = computed(() => new Set(currentProgressionOverrides.value));
const completedStudyKeySet = computed(() => new Set(testModeSettings.completedStudyKeys));
const seasonStatusText = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return 'Waiting for season snapshot.';
  }

  if (snapshot.status === 'completed') {
    return snapshot.completedReason?.message ?? 'Season completed.';
  }

  const endsAt = snapshot.stageEndsAt;
  return `${stageLabel(snapshot.currentStage)}${endsAt ? ` ends ${formatSeasonDuration(Math.max(0, endsAt - Date.now()))}` : ''}`;
});
const nextSeasonChangeLabel = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return 'Waiting';
  }
  if (snapshot.status === 'completed') {
    return snapshot.nextSeasonStartsAt ? `Next world ${formatSeasonDuration(Math.max(0, snapshot.nextSeasonStartsAt - Date.now()))}` : 'Manual restart';
  }

  const nextStage = getNextEnabledStageKey(snapshot.currentStage);
  return nextStage ? `${stageLabel(nextStage)} starts next` : 'Season completes next';
});
const nextSeasonChangeDescription = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return 'Season data has not arrived yet.';
  }
  if (snapshot.status === 'completed') {
    return 'Restart controls below will create the next world.';
  }
  if (!snapshot.stageEndsAt) {
    return 'This stage has no active timer, so admin controls decide the next change.';
  }
  const nextStage = getNextEnabledStageKey(snapshot.currentStage);
  return nextStage ? `When the timer runs out, ${stageLabel(nextStage)} will begin.` : 'When the timer runs out, the season will finish.';
});
const persistenceStatusText = computed(() => {
  if (persistenceClientError.value) {
    return persistenceClientError.value;
  }

  const status = persistenceStatus.value;
  if (!status) {
    return 'Waiting for save status.';
  }
  if (!status.enabled) {
    return 'Saving is disabled on this server.';
  }
  if (status.lastSaveOk === false) {
    return status.lastSaveError ? `Last save failed: ${status.lastSaveError}` : 'Last save failed.';
  }
  if (status.fileExists) {
    return 'Save file is present.';
  }
  return 'Save path is configured, but no file exists yet.';
});
const lastPersistenceSaveLabel = computed(() => {
  const status = persistenceStatus.value;
  if (!status?.lastSaveAt) {
    return 'Not yet';
  }
  return `${formatShortTime(status.lastSaveAt)} (${status.lastSaveReason ?? 'save'})`;
});
const persistenceSummaryLabel = computed(() => {
  const summary = persistenceStatus.value?.summary;
  if (!summary) {
    return 'Waiting';
  }
  return `seed ${summary.seed}, ${summary.settlements} settlements, ${summary.discoveredTiles}/${summary.tiles} tiles`;
});
const persistenceSavedStates = computed(() => persistenceStatus.value?.savedStates ?? []);

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

function requestPersistenceStatus() {
  sendMessage({
    type: 'persistence:request_status',
    timestamp: Date.now(),
  });
}

function clearPersistenceResponseTimeout() {
  if (persistenceResponseTimeout === null || typeof window === 'undefined') {
    persistenceResponseTimeout = null;
    return;
  }

  window.clearTimeout(persistenceResponseTimeout);
  persistenceResponseTimeout = null;
}

function startPersistenceAction(action: NonNullable<typeof persistenceBusyAction.value>) {
  persistenceBusy.value = true;
  persistenceBusyAction.value = action;
  persistenceClientError.value = '';
  clearPersistenceResponseTimeout();

  if (typeof window === 'undefined') {
    return;
  }

  persistenceResponseTimeout = window.setTimeout(() => {
    if (!persistenceBusy.value || persistenceBusyAction.value !== action) {
      return;
    }

    persistenceBusy.value = false;
    persistenceBusyAction.value = null;
    persistenceClientError.value = 'No response from server. Restart the server if it was running before this save feature was added.';
  }, PERSISTENCE_RESPONSE_TIMEOUT_MS);
}

function savePersistenceNow() {
  startPersistenceAction('save');
  sendMessage({
    type: 'persistence:save_now',
    timestamp: Date.now(),
  });
}

function savePersistenceAs() {
  const name = persistenceSaveName.value.trim();
  if (!name) {
    return;
  }

  startPersistenceAction('save-as');
  sendMessage({
    type: 'persistence:save_as',
    name,
    timestamp: Date.now(),
  });
  persistenceSaveName.value = '';
}

function loadPersistenceSavedState(id: string, name: string) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`Load "${name}" now? This replaces the live world for everyone.`);
    if (!confirmed) {
      return;
    }
  }

  startPersistenceAction('load');
  sendMessage({
    type: 'persistence:load_saved',
    id,
    timestamp: Date.now(),
  });
}

function removePersistenceSavedState(id: string, name: string) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`Remove saved state "${name}"? This does not affect the live world.`);
    if (!confirmed) {
      return;
    }
  }

  startPersistenceAction('remove');
  sendMessage({
    type: 'persistence:remove_saved',
    id,
    timestamp: Date.now(),
  });
}

function handlePersistenceStatus(message: PersistenceStatusMessage) {
  clearPersistenceResponseTimeout();
  persistenceStatus.value = message;
  persistenceBusy.value = false;
  persistenceBusyAction.value = null;
  persistenceClientError.value = '';
}

function restartSeasonNow(forceRandom: boolean) {
  const nextSeed = forceRandom ? null : resolveDraftSeed();
  if (!forceRandom && nextSeed === null) {
    return;
  }

  if (typeof window !== 'undefined') {
    const seedLabel = forceRandom ? 'a random seed' : `fixed seed ${nextSeed}`;
    const confirmed = window.confirm(`Start the next season world now with ${seedLabel}? This restarts the world immediately.`);
    if (!confirmed) {
      return;
    }
  }

  centerCamera();
  sendMessage({
    type: 'season_admin:restart_now',
    ...(nextSeed !== null ? { seed: nextSeed } : {}),
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

function cloneSeasonConfig(config: SeasonConfig): SeasonConfig {
  return {
    stages: config.stages.map((stage) => ({
      ...stage,
      scoreMultiplier: stage.scoreMultiplier ? { ...stage.scoreMultiplier } : undefined,
      gameplay: stage.gameplay ? { ...stage.gameplay } : undefined,
    })),
    endGoals: config.endGoals.map((goal) => ({
      ...goal,
      enabledDuring: goal.enabledDuring.slice(),
    })),
  };
}

function updateSeasonConfig(mutator: (config: SeasonConfig) => void) {
  const base = season.value?.config ?? createDefaultSeasonConfig();
  const config = cloneSeasonConfig(base);
  mutator(config);
  sendMessage({
    type: 'season_admin:update_config',
    config,
    timestamp: Date.now(),
  });
}

function durationMinutes(durationMs: number) {
  return Math.round(durationMs / 60_000);
}

function stageLabel(stage: string) {
  switch (stage) {
    case 'preparation':
      return 'Preparation';
    case 'midgame':
      return 'Midgame';
    case 'endgame':
      return 'Endgame';
    case 'completed':
      return 'Completed';
    default:
      return stage;
  }
}

function formatSeasonDuration(ms: number) {
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

function formatShortTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatSavedStateLabel(savedState: PersistenceSavedStateSummary) {
  const summary = savedState.summary;
  return `${formatShortTime(savedState.savedAt)} · seed ${summary.seed} · ${summary.settlements} settlements · ${summary.discoveredTiles}/${summary.tiles} tiles`;
}

function getNextEnabledStageKey(currentStage: string) {
  const snapshot = season.value;
  if (!snapshot || snapshot.currentStage === 'completed') {
    return null;
  }

  const enabled = snapshot.config.stages.filter((stage) => stage.enabled && stage.durationMs > 0);
  const currentIndex = enabled.findIndex((stage) => stage.key === currentStage);
  return enabled[currentIndex + 1]?.key ?? null;
}

function borderPolicyLabel(policy: SeasonBorderPolicy) {
  switch (policy) {
    case 'locked_closed':
      return 'borders closed';
    case 'locked_open':
      return 'borders open';
    case 'player_choice':
      return 'players choose borders';
    default:
      return policy;
  }
}

function stageSummary(stage: SeasonStageConfig) {
  const duration = stage.enabled ? `${durationMinutes(stage.durationMs)} min` : 'skipped';
  const starts = stage.allowSettlementStarts ? 'starts allowed' : 'starts blocked';
  return `${duration} · ${borderPolicyLabel(stage.borderPolicy)} · ${starts}`;
}

function stageStatusLabel(stage: SeasonStageConfig) {
  if (stage.key === season.value?.currentStage) {
    return 'Current';
  }
  if (!stage.enabled) {
    return 'Skipped';
  }
  return 'Enabled';
}

function setSeasonStageEnabled(stageKey: ActiveSeasonStageKey, enabled: boolean) {
  updateSeasonConfig((config) => {
    const stage = config.stages.find((entry) => entry.key === stageKey);
    if (stage) stage.enabled = enabled;
  });
}

function setSeasonStageDuration(stageKey: ActiveSeasonStageKey, value: string) {
  const minutes = Math.max(0, Math.trunc(Number(value) || 0));
  updateSeasonConfig((config) => {
    const stage = config.stages.find((entry) => entry.key === stageKey);
    if (stage) stage.durationMs = minutes * 60_000;
  });
}

function setSeasonStageBorder(stageKey: ActiveSeasonStageKey, value: string) {
  const borderPolicy = value as SeasonBorderPolicy;
  updateSeasonConfig((config) => {
    const stage = config.stages.find((entry) => entry.key === stageKey);
    if (stage) stage.borderPolicy = borderPolicy;
  });
}

function setSeasonStageStarts(stageKey: ActiveSeasonStageKey, enabled: boolean) {
  updateSeasonConfig((config) => {
    const stage = config.stages.find((entry) => entry.key === stageKey);
    if (stage) stage.allowSettlementStarts = enabled;
  });
}

function setSeasonGameplayNumber(
  stageKey: ActiveSeasonStageKey,
  key: keyof SeasonStageGameplayConfig,
  value: string,
  min: number,
  max?: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return;
  }

  const normalized = Math.max(min, typeof max === 'number' ? Math.min(max, parsed) : parsed);
  updateSeasonConfig((config) => {
    const stage = config.stages.find((entry) => entry.key === stageKey);
    if (!stage) return;
    stage.gameplay = { ...(stage.gameplay ?? {}), [key]: normalized };
  });
}

function setSeasonGameplayMinutes(
  stageKey: ActiveSeasonStageKey,
  key: keyof SeasonStageGameplayConfig,
  value: string,
  minMinutes: number,
) {
  const minutes = Math.max(minMinutes, Number(value) || minMinutes);
  setSeasonGameplayNumber(stageKey, key, String(Math.round(minutes * 60_000)), minMinutes * 60_000);
}

function setSeasonGameplayPercent(stageKey: ActiveSeasonStageKey, key: keyof SeasonStageGameplayConfig, value: string) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  setSeasonGameplayNumber(stageKey, key, String(percent / 100), 0, 1);
}

function setSeasonGoalEnabled(goalId: string, enabled: boolean) {
  updateSeasonConfig((config) => {
    const goal = config.endGoals.find((entry) => entry.id === goalId);
    if (goal) goal.enabled = enabled;
  });
}

function setSeasonGoalTarget(goalId: string, value: string) {
  const target = Math.max(1, Math.trunc(Number(value) || 1));
  updateSeasonConfig((config) => {
    const goal = config.endGoals.find((entry) => entry.id === goalId);
    if (goal) goal.target = target;
  });
}

function setSeasonGoalPercent(goalId: string, value: string) {
  const percent = Math.max(0, Math.min(100, Math.trunc(Number(value) || 0)));
  updateSeasonConfig((config) => {
    const goal = config.endGoals.find((entry) => entry.id === goalId);
    if (goal) goal.percent = percent;
  });
}

function jumpToSeasonStage(stage: ActiveSeasonStageKey) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`Jump the live season to ${stageLabel(stage)} now? This changes timers, border rules and gameplay pacing immediately.`);
    if (!confirmed) {
      return;
    }
  }

  sendMessage({
    type: 'season_admin:set_stage',
    stage,
    timestamp: Date.now(),
  });
}

function completeSeasonNow() {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm('Finish the season now? This locks final scores and moves everyone to the completed season board.');
    if (!confirmed) {
      return;
    }
  }

  sendMessage({
    type: 'season_admin:complete_now',
    message: 'Season completed from debug controls.',
    timestamp: Date.now(),
  });
}

function restoreDefaultSeasonConfig() {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm('Restore the default season configuration? This replaces the current stage lengths, border rules, pacing values and end goals.');
    if (!confirmed) {
      return;
    }
  }

  sendMessage({
    type: 'season_admin:update_config',
    config: createDefaultSeasonConfig(),
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

watch(showDebugSections, (enabled) => {
  if (!enabled && activeDebugTab.value !== 'season' && activeDebugTab.value !== 'saves') {
    activeDebugTab.value = 'season';
  } else if (enabled && activeDebugTab.value === 'season' && !props.adminFocus) {
    activeDebugTab.value = 'quick';
  }
});

watch(() => props.adminFocus, (adminFocus) => {
  if (adminFocus) {
    activeDebugTab.value = 'season';
  } else if (showDebugSections.value && activeDebugTab.value === 'season') {
    activeDebugTab.value = 'quick';
  }
});

watch(canUsePersistenceControls, (enabled) => {
  if (!enabled && activeDebugTab.value === 'saves') {
    activeDebugTab.value = showDebugSections.value ? 'quick' : 'season';
  }
});

onMounted(() => {
  clientMessageRouter.on('persistence:status', handlePersistenceStatus);
  requestPersistenceStatus();
});

onUnmounted(() => {
  clearPersistenceResponseTimeout();
  clientMessageRouter.off('persistence:status', handlePersistenceStatus);
});
</script>

<style scoped>
.world-controls {
  @apply flex flex-col overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/90 shadow-xl backdrop-blur-md;
  position: relative;
  z-index: 45;
  width: min(35rem, calc(100vw - 1rem));
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
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
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

.mini-btn--danger {
  @apply border-red-300/50 bg-red-900/70 text-red-50 hover:bg-red-800;
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

.test-mode-toggle span {
  @apply min-w-0;
}

.test-mode-toggle strong {
  @apply block text-xs font-semibold leading-4 text-slate-100;
}

.test-mode-toggle small {
  @apply block text-[10px] leading-4 text-slate-300/70;
}

.test-mode-section {
  @apply flex min-h-0 flex-col gap-2 rounded-md border border-slate-800/70 bg-slate-950/60 p-2;
}

.persistence-debug-card {
  @apply grid gap-2 rounded-md border border-slate-800/70 bg-slate-950/45 p-2;
}

.persistence-debug-grid {
  @apply grid gap-x-2 gap-y-1 text-[10px];
  grid-template-columns: auto minmax(0, 1fr);
}

.persistence-debug-grid span {
  @apply text-slate-400;
}

.persistence-debug-grid strong {
  @apply min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-slate-100;
}

.persistence-save-as {
  @apply grid gap-1 text-[10px] text-slate-300;
}

.persistence-save-as span {
  @apply text-slate-400;
}

.persistence-save-as input {
  @apply h-8 min-w-0 rounded-md border border-slate-600 bg-slate-950/80 px-2 text-xs font-medium text-white outline-none transition-colors;
}

.persistence-save-as input:focus {
  @apply border-amber-300/60;
}

.persistence-saved-list {
  @apply grid min-h-0 gap-1.5 overflow-y-auto pr-1;
}

.persistence-saved-item {
  @apply grid gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 p-2;
  grid-template-columns: minmax(0, 1fr) auto;
}

.persistence-saved-item__copy {
  @apply min-w-0;
}

.persistence-saved-item__copy strong {
  @apply block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-slate-100;
}

.persistence-saved-item__copy span {
  @apply mt-1 block text-[10px] leading-4 text-slate-300/75;
}

.persistence-saved-item__actions {
  @apply flex items-start gap-1.5;
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

.season-debug-grid {
  @apply grid gap-2 overflow-y-auto pr-1;
}

.season-debug-card {
  @apply rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5;
}

.season-debug-card--active {
  @apply border-emerald-400/40 bg-emerald-950/30;
}

.season-debug-subgrid {
  @apply mt-2 grid gap-1.5 border-t border-slate-800/80 pt-2;
}

.season-debug-card__head {
  @apply mb-2 flex items-start justify-between gap-2;
}

.season-admin-summary {
  @apply grid gap-2 rounded-lg border border-amber-300/20 bg-amber-950/20 p-2;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.season-admin-summary > div {
  @apply rounded-md border border-slate-800/70 bg-slate-950/45 p-2;
}

.season-admin-summary__label {
  @apply text-[9px] uppercase tracking-normal text-amber-200/70;
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
}

.season-admin-summary strong {
  @apply mt-1 block text-sm font-semibold text-white;
}

.season-admin-summary span {
  @apply mt-1 block text-[10px] leading-4 text-slate-300/75;
}

.season-admin-actions {
  @apply grid gap-2;
}

.season-admin-action {
  @apply grid items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/50 p-2;
  grid-template-columns: minmax(0, 1fr) auto;
}

.season-admin-action strong {
  @apply block text-xs font-semibold text-slate-100;
}

.season-admin-action span {
  @apply mt-1 block text-[10px] leading-4 text-slate-300/75;
}

.season-stage-heading {
  @apply min-w-0;
}

.season-stage-heading p {
  @apply text-sm font-semibold text-white;
}

.season-stage-heading span {
  @apply mt-1 block text-[10px] leading-4 text-slate-300/75;
}

.season-stage-pill {
  @apply shrink-0 rounded-full border border-slate-700 bg-slate-950/60 px-2 py-1 text-[9px] font-bold uppercase tracking-normal text-slate-300;
}

.season-stage-pill--current {
  @apply border-emerald-300/40 bg-emerald-950/70 text-emerald-200;
}

.season-stage-pill--disabled {
  @apply border-slate-700 bg-slate-900/60 text-slate-500;
}

.season-stage-action-row {
  @apply mb-2 grid items-center gap-2 rounded-md border border-slate-800/70 bg-slate-950/35 p-2;
  grid-template-columns: auto minmax(0, 1fr);
}

.season-stage-action-row span {
  @apply text-[10px] leading-4 text-slate-300/70;
}

.season-debug-toggle {
  @apply mb-2 flex-1;
}

.season-restart-admin {
  display: grid;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
  border: 1px solid rgba(251, 191, 36, 0.28);
  border-radius: 0.7rem;
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.12), transparent 55%),
    rgba(15, 23, 42, 0.54);
  padding: 0.75rem;
}

.season-restart-admin__seed {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  gap: 0.4rem;
  align-items: center;
}

.season-debug-field {
  @apply mb-1.5 grid items-center gap-2 text-[10px] text-slate-300;
  grid-template-columns: 7rem minmax(0, 1fr);
}

.season-debug-field input,
.season-debug-field select,
.season-debug-goal__target {
  @apply h-8 min-w-0 rounded-md border border-slate-700 bg-slate-950/80 px-2 text-xs text-white outline-none;
}

.season-debug-goals {
  @apply grid gap-1.5 overflow-y-auto rounded-lg border border-slate-800/70 bg-slate-950/45 p-2 pr-1;
}

.season-debug-goal {
  @apply grid items-center gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100;
  grid-template-columns: auto minmax(0, 1fr) 4.5rem;
}

.season-debug-goal input[type='checkbox'] {
  @apply h-3.5 w-3.5 accent-emerald-500;
}

.season-debug-goal span {
  @apply flex min-w-0 flex-col gap-0.5;
}

.season-debug-goal strong,
.season-debug-goal small {
  @apply truncate;
}

.season-debug-advanced {
  @apply mt-2 rounded-md border border-slate-800/70 bg-slate-950/35 p-2;
}

.season-debug-advanced summary {
  @apply cursor-pointer text-xs font-semibold text-slate-100 outline-none;
}

.season-debug-advanced summary:hover {
  @apply text-amber-100;
}

.season-debug-advanced > p {
  @apply mt-1 text-[10px] leading-4 text-slate-300/70;
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

  .season-admin-summary,
  .season-admin-action,
  .season-stage-action-row {
    grid-template-columns: 1fr;
  }

  .season-debug-field {
    grid-template-columns: 1fr;
  }
}
</style>
