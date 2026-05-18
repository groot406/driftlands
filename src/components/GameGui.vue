<template>
  <div class="game-gui-shell absolute top-0 left-0 w-full h-full z-20 pointer-events-none select-none p-2 flex flex-col gap-4">
    <div class="game-gui-top flex flex-row justify-between gap-2 md:gap-40 items-start">
      <div class="game-gui-resources min-w-0 flex-1 flex flex-col gap-4">
        <ResourceBar/>
      </div>
      <div class="game-gui-menu pointer-events-auto gap-2 md:gap-3 flex shrink-0 flex-row md:flex-col items-end">
        <NineSliceButton class="menu-shortcut-btn pixel-font" @click="pauseGame">Menu</NineSliceButton>
      </div>
      <div class="pointer-events-auto gap-2 flex flex-col items-end" v-if="showHelpers && serverDebugModeEnabled">
        <WorldControls/>
        <FpsCounter />
      </div>
    </div>
    <HeroesBar />
  </div>
  <!-- Bottom-right toolbar -->
  <div class="fixed bottom-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
    <MaintenanceAlert />
    <button
      class="market-toggle-btn"
      :class="{ 'market-toggle-btn--active': marketplaceOpen, 'market-toggle-btn--locked': !marketAccessUnlocked }"
      type="button"
      :disabled="!marketAccessUnlocked"
      @click="openMarketplace()"
      :title="marketButtonTitle"
      aria-label="Open system market"
    >
      <svg class="market-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8.5h16" />
        <path d="M7 8.5l-2.4 5.2a2.8 2.8 0 0 0 5.6 0L7.8 8.5" />
        <path d="M16.2 8.5l-2.4 5.2a2.8 2.8 0 0 0 5.6 0L17 8.5" />
        <path d="M12 5v14" />
        <path d="M8.5 19h7" />
      </svg>
    </button>
    <button
      v-if="serverDebugModeEnabled"
      class="debug-toggle-btn pixel-font"
      :class="{ 'debug-toggle-btn--active': showHelpers }"
      type="button"
      @click="toggleDebugHelpers"
      title="Toggle debug panel (F2, F9, or `)"
    >
      DBG
    </button>
    <button
      v-if="hasTutorial"
      class="tutorial-toggle-btn"
      :class="{ 'tutorial-toggle-btn--active': isTutorialPanelOpen }"
      @click="toggleTutorialPanel"
      title="Open help guide"
    >
      <span class="tutorial-toggle-glyph">?</span>
      <span v-if="!tutorialSnapshot.allCompleted" class="tutorial-toggle-badge">{{ visibleTutorialStepNumber }}</span>
    </button>
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
  <!-- Goals panel (anchored bottom-right) -->
  <GoalsPanel />
  <TutorialPanel />
  <!-- Centered conversation overlay -->
  <ChronicleBar />
  <SettlementStartPicker />
  <PlayerModal />
  <PopulationOverviewModal />
  <ResourceDetailModal />
  <MarketplaceModal />
  <SettlerModal />
  <CalamityEventModal />
  <NotificationOverlay />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import ResourceBar from './ResourceBar.vue';
import MaintenanceAlert from './MaintenanceAlert.vue';
import ChronicleBar from './ChronicleBar.vue';
import SettlementStartPicker from './SettlementStartPicker.vue';
import GoalsPanel from './GoalsPanel.vue';
import TutorialPanel from './TutorialPanel.vue';
import WorldControls from './WorldControls.vue';
import HeroesBar from './HeroesBar.vue';
import FpsCounter from './FpsCounter.vue';
import OnlinePlayersIndicator from './OnlinePlayersIndicator.vue';
import MusicPlayer from './MusicPlayer.vue';
import InGameMiniMap from './InGameMiniMap.vue';
import PlayerModal from './PlayerModal.vue';
import PopulationOverviewModal from './PopulationOverviewModal.vue';
import ResourceDetailModal from './ResourceDetailModal.vue';
import MarketplaceModal from './MarketplaceModal.vue';
import SettlerModal from './SettlerModal.vue';
import CalamityEventModal from './CalamityEventModal.vue';
import NotificationOverlay from './NotificationOverlay.vue';
import NineSliceButton from './ui/NineSliceButton.vue';
import { isPlaying, pauseGame } from '../store/uiStore';
import { chronicleHasEntries, requestChronicleReopen, toggleGoalsPanel, isGoalsPanelOpen } from '../store/chronicleStore';
import { runSnapshot } from '../store/runStore';
import { serverDebugModeEnabled } from '../store/serverConfigStore.ts';
import {
  hasTutorial,
  isTutorialPanelOpen,
  toggleTutorialPanel,
  tutorialSnapshot,
  visibleTutorialStepNumber,
} from '../store/tutorialStore';
import { marketplaceOpen, marketWallet, openMarketplace } from '../store/marketStore.ts';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { worldVersion } from '../core/world.ts';
import { hasSettlementMarketAccess } from '../shared/game/marketAccess.ts';

const showHelpers = ref(false);
const globalKeyListenerOptions = { capture: true };
const DEBUG_HELPER_SHORTCUTS = new Set(['Tab', 'F2', 'F9', 'Backquote']);


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

const marketGold = computed(() => marketWallet.value?.gold ?? 0);
const marketAccessUnlocked = computed(() => {
  worldVersion.value;
  return hasSettlementMarketAccess(currentPlayerSettlementId.value);
});
const marketButtonTitle = computed(() => {
  if (!currentPlayerSettlementId.value) {
    return 'Start a settlement before opening the market';
  }

  if (!marketAccessUnlocked.value) {
    return 'Grant a Market Charter at the town center to unlock trading';
  }

  return marketWallet.value
    ? `Open system market · ${formatGold(marketGold.value)} Gold`
    : 'Open system market';
});

function formatGold(value: number) {
  if (value >= 1000) {
    return `${Math.floor(value / 100) / 10}k`;
  }

  return `${Math.floor(value)}`;
}

function recallConversation() {
  requestChronicleReopen();
}

function toggleGoals() {
  toggleGoalsPanel();
}

function toggleDebugHelpers() {
  if (!serverDebugModeEnabled.value) return;
  showHelpers.value = !showHelpers.value;
}

function handleKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const isInput = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');

  if (isInput) return;

  if (DEBUG_HELPER_SHORTCUTS.has(e.key) || DEBUG_HELPER_SHORTCUTS.has(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleDebugHelpers();
    return;
  }

  if (!isPlaying()) return;

  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.code === 'KeyC') recallConversation();
  if (e.code === 'KeyG') toggleGoals();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, globalKeyListenerOptions);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, globalKeyListenerOptions);
});

watch(serverDebugModeEnabled, (enabled) => {
  if (!enabled) {
    //showHelpers.value = false;
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
  @apply self-end text-[10px] uppercase tracking-normal shadow-md;
  min-width: 5.75rem;
  min-height: 3rem;
  color: #2f1609;
  font-weight: 800;
  letter-spacing: 0;
}

.menu-shortcut-btn:hover {
  filter: brightness(1.06);
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
}

.conversation-recall-btn {
  @apply flex items-center justify-center rounded-lg border border-amber-200/40 px-3 py-3 text-sm shadow-md transition-all hover:border-amber-200/70 hover:scale-105;
  background-color: rgb(35 83 46 / 0.74);
  line-height: 1;
}

.conversation-recall-btn:hover {
  background-color: rgb(80 103 49 / 0.84);
}

.market-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(245, 197, 95, 0.42);
  background:
    linear-gradient(180deg, rgba(73, 50, 23, 0.88), rgba(31, 20, 12, 0.86));
  color: rgb(255 241 204);
  box-shadow: 0 8px 18px rgba(25, 18, 12, 0.24);
  backdrop-filter: blur(8px);
  font-weight: 900;
  line-height: 1;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.market-toggle-icon {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.market-toggle-btn:hover,
.market-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(245, 197, 95, 0.72);
  background:
    linear-gradient(180deg, rgba(112, 74, 28, 0.92), rgba(48, 30, 13, 0.9));
}

.market-toggle-btn--locked,
.market-toggle-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
  border-color: rgba(148, 127, 83, 0.28);
  background: rgba(28, 22, 16, 0.76);
  color: rgba(255, 241, 204, 0.58);
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
