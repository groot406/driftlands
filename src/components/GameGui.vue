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
  <!-- Bottom-right toolbar -->
  <div class="fixed bottom-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
    <MaintenanceAlert />
    <button
      v-if="activeShipOrder"
      class="ship-order-toggle-btn"
      :class="{ 'ship-order-toggle-btn--active': shipOrderPanelOpen }"
      type="button"
      @click="openShipOrderPanel"
      :title="shipOrderTitle"
      aria-label="Open ship order"
    >
      <svg class="ship-order-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17h18" />
        <path d="M5 17 8 7h8l3 10" />
        <path d="M8 7l4-3 4 3" />
        <path d="M7 20h10" />
      </svg>
      <span class="ship-order-toggle-badge">{{ shipOrderProgress }}%</span>
    </button>
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
  <ShipArrivalPopup />
  <ShipOrderModal />
  <SettlerModal />
  <CalamityEventModal />
  <UnlockAnnouncementModal />
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
import ShipArrivalPopup from './ShipArrivalPopup.vue';
import ShipOrderModal from './ShipOrderModal.vue';
import SettlerModal from './SettlerModal.vue';
import CalamityEventModal from './CalamityEventModal.vue';
import UnlockAnnouncementModal from './UnlockAnnouncementModal.vue';
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
import { activeShipOrder, openShipOrderPanel, shipOrderPanelOpen } from '../store/shipOrderStore.ts';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';
import { activeCalamityWarning, getCalamityDisplayName, reopenActiveCalamityWarning } from '../store/calamityEventStore.ts';
import { worldVersion } from '../core/world.ts';
import { hasSettlementMarketAccess } from '../shared/game/marketAccess.ts';

const showHelpers = ref(false);
const countdownNow = ref(Date.now());
const globalKeyListenerOptions = { capture: true };
const DEBUG_HELPER_SHORTCUTS = new Set(['Tab', 'F2', 'F9', 'Backquote']);
let countdownTimer: number | null = null;


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
const shipOrderProgress = computed(() => {
  const order = activeShipOrder.value;
  if (!order || order.totalRequestedValue <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((order.totalFulfilledValue / order.totalRequestedValue) * 100));
});
const shipOrderTitle = computed(() => {
  const order = activeShipOrder.value;
  return order ? `${order.name} loading cargo · ${shipOrderProgress.value}% filled` : 'Open ship order';
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

function formatGold(value: number) {
  if (value >= 1000) {
    return `${Math.floor(value / 100) / 10}k`;
  }

  return `${Math.floor(value)}`;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

.calamity-countdown-hud {
  position: fixed;
  top: 0.85rem;
  left: 50%;
  z-index: 34;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.7rem;
  width: min(28rem, calc(100vw - 1.5rem));
  min-height: 3.35rem;
  transform: translateX(-50%);
  overflow: hidden;
  border: 1px solid rgba(250, 204, 21, 0.58);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(78, 42, 20, 0.94), rgba(31, 18, 12, 0.96)),
    rgba(30, 18, 12, 0.94);
  box-shadow: 0 12px 28px rgba(20, 12, 8, 0.34), inset 0 1px 0 rgba(255, 247, 207, 0.12);
  color: rgb(255 244 207);
  padding: 0.55rem 0.75rem 0.72rem;
  appearance: none;
  pointer-events: auto;
  backdrop-filter: blur(8px);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.calamity-countdown-hud:hover,
.calamity-countdown-hud:focus-visible {
  border-color: rgba(253, 230, 138, 0.88);
  box-shadow: 0 14px 32px rgba(20, 12, 8, 0.42), 0 0 0 2px rgba(250, 204, 21, 0.16), inset 0 1px 0 rgba(255, 247, 207, 0.16);
  transform: translate(-50%, -1px);
}

.calamity-countdown-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(253, 230, 138, 0.58);
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.6);
  color: rgb(254 243 199);
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.72rem;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.22);
}

.calamity-countdown-copy {
  min-width: 0;
  display: grid;
  gap: 0.16rem;
}

.calamity-countdown-kicker {
  min-width: 0;
  overflow: hidden;
  color: rgba(255, 244, 207, 0.62);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.calamity-countdown-name {
  min-width: 0;
  overflow: hidden;
  color: rgb(255 244 207);
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calamity-countdown-hud strong {
  min-width: 3.7rem;
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.48);
  border: 1px solid rgba(253, 230, 138, 0.28);
  padding: 0.32rem 0.48rem;
  color: rgb(254 243 199);
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.76rem;
  letter-spacing: 0;
  text-align: center;
}

.calamity-countdown-track {
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  bottom: 0.42rem;
  height: 0.18rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 244, 207, 0.16);
}

.calamity-countdown-track span {
  display: block;
  width: var(--calamity-progress);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #facc15, #fb923c);
}

.calamity-countdown-enter-active,
.calamity-countdown-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.calamity-countdown-enter-from,
.calamity-countdown-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.45rem);
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
    top: 4.15rem;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.5rem;
    min-height: 3.2rem;
    padding-inline: 0.58rem;
  }

  .calamity-countdown-kicker {
    font-size: 0.52rem;
  }

  .calamity-countdown-name {
    font-size: 0.72rem;
  }

  .calamity-countdown-icon {
    width: 1.7rem;
    height: 1.7rem;
  }

  .calamity-countdown-hud strong {
    min-width: 3.2rem;
    font-size: 0.62rem;
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

.ship-order-toggle-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(103, 232, 249, 0.45);
  background:
    linear-gradient(180deg, rgba(14, 116, 144, 0.92), rgba(8, 47, 73, 0.9));
  color: rgb(224 242 254);
  box-shadow: 0 8px 18px rgba(8, 47, 73, 0.24);
  backdrop-filter: blur(8px);
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.ship-order-toggle-btn:hover,
.ship-order-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(165, 243, 252, 0.78);
}

.ship-order-toggle-icon {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ship-order-toggle-badge {
  position: absolute;
  top: -0.38rem;
  right: -0.45rem;
  min-width: 1.55rem;
  border-radius: 999px;
  border: 1px solid rgba(165, 243, 252, 0.62);
  background: rgba(8, 47, 73, 0.96);
  padding: 0.08rem 0.3rem;
  font-size: 0.58rem;
  font-weight: 800;
  color: rgb(236 254 255);
  line-height: 1.1;
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
