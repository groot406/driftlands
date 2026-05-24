<template>
  <div class="game-gui-shell absolute top-0 left-0 w-full h-full z-20 pointer-events-none select-none p-2 flex flex-col gap-4">
    <div class="game-gui-top flex flex-row justify-between gap-2 md:gap-40 items-start">
      <div class="game-gui-resources min-w-0 flex-1 flex flex-col gap-4">
        <ResourceBar/>
      </div>
      <div class="season-hud-stack">
        <SeasonStageHud />
        <Transition name="calamity-countdown">
          <button
            v-if="calamityCountdown"
            class="calamity-countdown-hud"
            type="button"
            :style="{ '--calamity-progress': `${calamityCountdown.progress}%` }"
            :aria-label="`Open ${calamityCountdown.name} warning. Impact in ${calamityCountdown.time}.`"
            @click="reopenActiveCalamityWarning"
          >
            <span class="calamity-countdown-icon" aria-hidden="true">!</span>
            <span class="calamity-countdown-copy">
              <span class="calamity-countdown-kicker">Disaster warning</span>
              <span class="calamity-countdown-name">Incoming {{ calamityCountdown.name }}</span>
            </span>
            <strong>{{ calamityCountdown.time }}</strong>
            <span class="calamity-countdown-track" aria-hidden="true">
              <span></span>
            </span>
          </button>
        </Transition>
      </div>
      <div class="game-gui-menu pointer-events-auto gap-2 md:gap-3 flex shrink-0 flex-row md:flex-col items-end">
        <NineSliceButton class="menu-shortcut-btn pixel-font" @click="pauseGame">Menu</NineSliceButton>
      </div>
    </div>
    <HeroesBar />
  </div>
  <OnlinePlayersStatus />
  <!-- Bottom-right toolbar -->
  <div class="fixed bottom-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
    <MaintenanceAlert />
    <button
      v-if="canUseDebugTools"
      class="debug-toggle-btn pixel-font"
      :class="{ 'debug-toggle-btn--active': activeToolPanel === 'debug' }"
      type="button"
      @click="toggleToolPanel('debug')"
      title="Toggle debug panel (F2, F9, or `)"
    >
      DBG
    </button>
    <button
      v-if="canUseAdminTools"
      class="debug-toggle-btn debug-toggle-btn--admin pixel-font"
      :class="{ 'debug-toggle-btn--active': activeToolPanel === 'admin' }"
      type="button"
      @click="toggleToolPanel('admin')"
      title="Toggle season admin panel"
    >
      ADM
    </button>
    <div v-if="hasTutorial" class="toolbar-popover-anchor">
      <button
        class="tutorial-toggle-btn"
        :class="{ 'tutorial-toggle-btn--active': isTutorialPanelOpen }"
        @click="toggleTutorialGuide"
        title="Open help guide"
      >
        <span class="tutorial-toggle-glyph">?</span>
        <span v-if="!tutorialSnapshot.allCompleted" class="tutorial-toggle-badge">{{ visibleTutorialStepNumber }}</span>
      </button>
      <TutorialPanel />
    </div>
    <button
      v-if="hasGoals"
      class="goals-toggle-btn"
      :class="{ 'goals-toggle-btn--active': isGoalsPanelOpen }"
      @click="toggleGoals"
      title="Open progression roadmap (G)"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <span v-if="openGoalCount > 0" class="goals-toggle-badge">{{ openGoalCount }}</span>
    </button>
    <button
      v-if="chronicleHasEntries"
      class="conversation-recall-btn pixel-font"
      @click="recallConversation"
      title="Re-read conversation (C)"
    >
      <svg class="w-4 h-4 text-amber-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    </button>
    <MusicPlayer />
    <OnlinePlayersIndicator />
  </div>
  <InGameMiniMap />
  <DebugToolsPanel
    v-if="activeToolPanel && canUseActiveToolPanel"
    :mode="activeToolPanel"
    :show-debug-tools="canUseDebugTools"
    :show-admin-tools="canUseAdminTools"
    @close="closeDebugPanel"
  />
  <SeasonScoreboard />
  <!-- Goals panel (anchored bottom-right) -->
  <GoalsPanel />
  <!-- Centered conversation overlay -->
  <ChronicleBar />
  <SettlementStartPicker />
  <PlayerModal />
  <PopulationOverviewModal />
  <ResourceDetailModal />
  <MarketplaceModal />
  <ShipOrderModal />
  <SettlerModal />
  <CalamityEventModal />
  <UnlockAnnouncementModal />
  <NotificationOverlay />
  <SettlementWelcomeModal />
  <SeasonStageAnnouncementModal />
  <SeasonCompletedOverlay />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import ResourceBar from './ResourceBar.vue';
import SeasonStageHud from './SeasonStageHud.vue';
import MaintenanceAlert from './MaintenanceAlert.vue';
import ChronicleBar from './ChronicleBar.vue';
import SettlementStartPicker from './SettlementStartPicker.vue';
import GoalsPanel from './GoalsPanel.vue';
import TutorialPanel from './TutorialPanel.vue';
import HeroesBar from './HeroesBar.vue';
import DebugToolsPanel from './DebugToolsPanel.vue';
import OnlinePlayersIndicator from './OnlinePlayersIndicator.vue';
import OnlinePlayersStatus from './OnlinePlayersStatus.vue';
import MusicPlayer from './MusicPlayer.vue';
import InGameMiniMap from './InGameMiniMap.vue';
import SeasonScoreboard from './SeasonScoreboard.vue';
import PlayerModal from './PlayerModal.vue';
import PopulationOverviewModal from './PopulationOverviewModal.vue';
import ResourceDetailModal from './ResourceDetailModal.vue';
import MarketplaceModal from './MarketplaceModal.vue';
import ShipOrderModal from './ShipOrderModal.vue';
import SettlerModal from './SettlerModal.vue';
import CalamityEventModal from './CalamityEventModal.vue';
import UnlockAnnouncementModal from './UnlockAnnouncementModal.vue';
import NotificationOverlay from './NotificationOverlay.vue';
import SettlementWelcomeModal from './SettlementWelcomeModal.vue';
import SeasonStageAnnouncementModal from './SeasonStageAnnouncementModal.vue';
import SeasonCompletedOverlay from './SeasonCompletedOverlay.vue';
import NineSliceButton from './ui/NineSliceButton.vue';
import { isPlaying, pauseGame } from '../store/uiStore';
import { chronicleHasEntries, requestChronicleReopen, openGoalsPanel, closeGoalsPanel, isGoalsPanelOpen } from '../store/chronicleStore';
import { runSnapshot } from '../store/runStore';
import { currentPlayerIsAdmin, serverDebugModeEnabled } from '../store/serverConfigStore.ts';
import {
  hasTutorial,
  isTutorialPanelOpen,
  openTutorialPanel,
  closeTutorialPanel,
  tutorialSnapshot,
  visibleTutorialStepNumber,
} from '../store/tutorialStore';
import { activeCalamityWarning, getCalamityDisplayName, reopenActiveCalamityWarning } from '../store/calamityEventStore.ts';
import { activeToolbarPanel, closeToolbarPanel, openToolbarPanel } from '../store/toolbarPanelStore.ts';

const activeToolPanel = ref<'debug' | 'admin' | null>(null);
const countdownNow = ref(Date.now());
const globalKeyListenerOptions = { capture: true };
const DEBUG_HELPER_SHORTCUTS = new Set(['Tab', 'F2', 'F9', 'Backquote']);
let countdownTimer: number | null = null;

const canUseDebugTools = computed(() => serverDebugModeEnabled.value);
const canUseAdminTools = computed(() => currentPlayerIsAdmin.value);
const canUseActiveToolPanel = computed(() => (
  (activeToolPanel.value === 'debug' && canUseDebugTools.value)
  || (activeToolPanel.value === 'admin' && canUseAdminTools.value)
));

const hasGoals = computed(() => {
  const run = runSnapshot.value;
  if (!run) return false;
  return run.progression.nextRecommendedNodeKeys.length > 0
    || run.progression.recentlyUnlockedNodeKeys.length > 0;
});

const openGoalCount = computed(() => {
  const run = runSnapshot.value;
  if (!run) return 0;
  const recommended = new Set(run.progression.nextRecommendedNodeKeys);
  return run.progression.nodes.filter((n) => recommended.has(n.key) && !n.unlocked).length;
});

const calamityCountdown = computed(() => {
  const warning = activeCalamityWarning.value;
  if (!warning?.event.impactAt) {
    return null;
  }

  const event = warning.event;
  const serverNowAtReceipt = event.timestamp ?? warning.receivedAt;
  const warningDurationMs = Math.max(1, event.impactAt - serverNowAtReceipt);
  const remainingMs = Math.max(0, warningDurationMs - (countdownNow.value - warning.receivedAt));
  if (remainingMs <= 0) {
    return null;
  }

  return {
    name: getCalamityDisplayName(event.kind),
    time: formatCountdown(remainingMs),
    progress: Math.max(0, Math.min(100, ((warningDurationMs - remainingMs) / warningDurationMs) * 100)),
  };
});

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function recallConversation() {
  openToolbarPanel('chronicle');
  requestChronicleReopen();
}

function toggleGoals() {
  if (isGoalsPanelOpen.value) {
    closeGoalsPanel();
    closeToolbarPanel('goals');
  } else {
    openToolbarPanel('goals');
    openGoalsPanel();
  }
}

function toggleTutorialGuide() {
  if (isTutorialPanelOpen.value) {
    closeTutorialPanel();
    closeToolbarPanel('tutorial');
  } else {
    openToolbarPanel('tutorial');
    openTutorialPanel();
  }
}

function toggleToolPanel(panel: 'debug' | 'admin') {
  if (panel === 'debug' && !canUseDebugTools.value) return;
  if (panel === 'admin' && !canUseAdminTools.value) return;
  if (activeToolPanel.value === panel) {
    closeDebugPanel();
  } else {
    openToolbarPanel(panel);
    activeToolPanel.value = panel;
  }
}

function closeDebugPanel() {
  const panel = activeToolPanel.value;
  activeToolPanel.value = null;
  if (panel) {
    closeToolbarPanel(panel);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const isInput = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');

  if (isInput) return;

  if (DEBUG_HELPER_SHORTCUTS.has(e.key) || DEBUG_HELPER_SHORTCUTS.has(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleToolPanel('debug');
    return;
  }

  if (!isPlaying()) return;

  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.code === 'KeyC') recallConversation();
  if (e.code === 'KeyG') toggleGoals();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, globalKeyListenerOptions);
  countdownTimer = window.setInterval(() => {
    countdownNow.value = Date.now();
  }, 250);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, globalKeyListenerOptions);
  if (countdownTimer != null) {
    window.clearInterval(countdownTimer);
  }
});

watch(canUseActiveToolPanel, (enabled) => {
  if (!enabled) {
    activeToolPanel.value = null;
  }
});

watch(activeToolbarPanel, (panel) => {
  if (panel !== 'tutorial' && isTutorialPanelOpen.value) {
    closeTutorialPanel();
  }
  if (panel !== 'goals' && isGoalsPanelOpen.value) {
    closeGoalsPanel();
  }
  if (panel !== 'debug' && panel !== 'admin' && activeToolPanel.value) {
    activeToolPanel.value = null;
  }
});
</script>

<style>
.noscrollbar {
  scrollbar-width: none; /* Firefox */
}
.noscrollbar::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

.menu-shortcut-btn {
  @apply self-end uppercase shadow-md;
  min-width: 5.9rem;
  min-height: 3.05rem;
  border-radius: 4px;
  background:
    radial-gradient(circle at 50% 12%, rgba(255, 226, 161, 0.14), transparent 58%),
    linear-gradient(180deg, rgba(45, 27, 13, 0.9), rgba(17, 12, 8, 0.96));
  color: #fff1c5;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0;
  text-shadow:
    0 2px 0 rgba(5, 3, 2, 0.92),
    0 0 10px rgba(255, 210, 118, 0.26);
  box-shadow:
    0 8px 18px rgba(7, 6, 4, 0.34),
    inset 0 1px 0 rgba(255, 226, 161, 0.16);
}

.menu-shortcut-btn .ui-nine-slice-button__content {
  min-width: 100%;
  padding: 0.35rem 0.92rem 0.3rem;
  color: #fff1c5;
  line-height: 1;
  text-transform: uppercase;
}

.menu-shortcut-btn:hover {
  filter: brightness(1.1);
  color: #fff8dc;
  transform: translateY(-1px);
}

.menu-shortcut-btn:hover .ui-nine-slice-button__content {
  color: #fff8dc;
}

.menu-shortcut-btn:focus-visible {
  outline: 2px solid rgba(255, 238, 177, 0.95);
  outline-offset: 2px;
}

.game-gui-top {
  display: grid;
  grid-template-columns: minmax(18rem, 1fr) minmax(22rem, 32rem) auto;
  align-items: start;
  gap: 0.75rem;
}

.game-gui-resources {
  min-width: 0;
}

.season-hud-stack {
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
  width: min(32rem, 100%);
  pointer-events: none;
}

.season-hud-stack .season-stage-hud {
  width: 100%;
}

.game-gui-menu {
  justify-self: end;
}

.calamity-countdown-hud {
  position: relative;
  z-index: 34;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-height: 2.35rem;
  overflow: hidden;
  border: 1px solid rgba(178, 137, 53, 0.74);
  border-radius: 5px;
  background:
    linear-gradient(180deg, rgba(28, 40, 34, 0.94), rgba(12, 18, 17, 0.96)),
    rgba(14, 18, 16, 0.94);
  box-shadow:
    0 8px 20px rgba(4, 8, 7, 0.34),
    inset 0 1px 0 rgba(255, 247, 207, 0.1);
  color: rgb(255 244 207);
  padding: 0.42rem 0.58rem 0.54rem;
  appearance: none;
  pointer-events: auto;
  backdrop-filter: blur(6px);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.calamity-countdown-hud:hover,
.calamity-countdown-hud:focus-visible {
  border-color: rgba(222, 180, 80, 0.92);
  box-shadow:
    0 10px 24px rgba(4, 8, 7, 0.42),
    0 0 0 2px rgba(178, 137, 53, 0.15),
    inset 0 1px 0 rgba(255, 247, 207, 0.15);
  transform: translateY(-1px);
}

.calamity-countdown-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border: 1px solid rgba(204, 158, 58, 0.62);
  border-radius: 4px;
  background: rgba(83, 45, 28, 0.78);
  color: rgb(254 243 199);
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.58rem;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.22);
}

.calamity-countdown-copy {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
}

.calamity-countdown-kicker {
  min-width: 0;
  overflow: hidden;
  color: rgba(216, 190, 128, 0.78);
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.calamity-countdown-name {
  min-width: 0;
  overflow: hidden;
  color: rgb(255 239 198);
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calamity-countdown-hud strong {
  min-width: 3.25rem;
  border-radius: 4px;
  background: rgba(7, 10, 13, 0.5);
  border: 1px solid rgba(204, 158, 58, 0.34);
  padding: 0.24rem 0.38rem;
  color: rgb(254 243 199);
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.62rem;
  letter-spacing: 0;
  text-align: center;
}

.calamity-countdown-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.14rem;
  overflow: hidden;
  background: rgba(255, 244, 207, 0.1);
}

.calamity-countdown-track span {
  display: block;
  width: var(--calamity-progress);
  height: 100%;
  background: linear-gradient(90deg, #b88b2e, #e0b54f);
}

.calamity-countdown-enter-active,
.calamity-countdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.calamity-countdown-enter-from,
.calamity-countdown-leave-to {
  opacity: 0;
  transform: translateY(-0.45rem);
}

@media (max-width: 1180px) {
  .game-gui-top {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .season-hud-stack {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: end;
  }
}

@media (max-width: 640px) {
  .game-gui-shell {
    padding: 0.35rem;
    gap: 0.75rem;
  }

  .game-gui-top {
    position: relative;
    display: block;
  }

  .game-gui-resources {
    width: 100%;
    padding-right: 4.2rem;
  }

  .game-gui-menu {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 5;
  }

  .menu-shortcut-btn {
    min-width: 3.55rem;
    min-height: 2.35rem;
    padding-inline: 0.55rem;
    font-size: 8px;
  }

  .calamity-countdown-hud {
    gap: 0.45rem;
    min-height: 2.35rem;
    padding: 0.4rem 0.5rem 0.52rem;
  }

  .calamity-countdown-kicker {
    font-size: 0.48rem;
  }

  .calamity-countdown-name {
    font-size: 0.68rem;
  }

  .calamity-countdown-icon {
    width: 1.45rem;
    height: 1.45rem;
  }

  .calamity-countdown-hud strong {
    min-width: 3rem;
    font-size: 0.56rem;
  }
}

.conversation-recall-btn {
  @apply flex items-center justify-center rounded-lg border border-amber-200/40 px-3 py-3 text-sm shadow-md transition-all hover:border-amber-200/70 hover:scale-105;
  background-color: rgb(35 83 46 / 0.74);
  line-height: 1;
}

.conversation-recall-btn:hover {
  background-color: rgb(80 103 49 / 0.84);
}

.debug-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(125, 211, 252, 0.42);
  background: rgba(15, 23, 42, 0.78);
  color: rgb(186 230 253);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.debug-toggle-btn:hover,
.debug-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(252, 211, 77, 0.6);
  background: rgba(36, 48, 26, 0.9);
  color: rgb(254 243 199);
}

.debug-toggle-btn--admin {
  border-color: rgba(252, 211, 77, 0.46);
  background:
    radial-gradient(circle at top left, rgba(252, 211, 77, 0.18), transparent 54%),
    rgba(42, 32, 18, 0.82);
  color: rgb(253 230 138);
}

.toolbar-popover-anchor {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
}

.goals-toggle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(252, 211, 77, 0.34);
  background:
    radial-gradient(circle at top left, rgba(252, 211, 77, 0.22), transparent 44%),
    rgba(35, 83, 46, 0.76);
  color: rgb(253 230 138);
  box-shadow: 0 8px 18px rgba(20, 42, 28, 0.2);
  backdrop-filter: blur(8px);
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.goals-toggle-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(252, 211, 77, 0.58);
  background:
    radial-gradient(circle at top left, rgba(252, 211, 77, 0.3), transparent 44%),
    rgba(65, 103, 49, 0.9);
}

.goals-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(252, 211, 77, 0.58);
  background:
    radial-gradient(circle at top left, rgba(252, 211, 77, 0.3), transparent 44%),
    rgba(65, 103, 49, 0.9);
}

.goals-toggle-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgb(245 158 11);
  color: rgb(17 24 39);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  padding: 0 5px;
}

.tutorial-toggle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(52, 211, 153, 0.36);
  background:
    linear-gradient(180deg, rgba(21, 128, 61, 0.84), rgba(15, 23, 42, 0.82));
  color: rgb(209 250 229);
  box-shadow: 0 8px 18px rgba(20, 42, 28, 0.22);
  backdrop-filter: blur(8px);
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.tutorial-toggle-btn:hover,
.tutorial-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(252, 211, 77, 0.56);
  background:
    linear-gradient(180deg, rgba(146, 64, 14, 0.86), rgba(21, 83, 45, 0.88));
  color: rgb(254 243 199);
}

.tutorial-toggle-glyph {
  font-size: 1rem;
  font-weight: 900;
  line-height: 1;
}

.tutorial-toggle-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgb(52 211 153);
  color: rgb(15 23 42);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  padding: 0 5px;
}
</style>
