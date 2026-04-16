<template>
  <div class="absolute top-0 left-0 w-full h-full z-20 pointer-events-none select-none p-2 flex flex-col gap-4">
    <div class="flex flex-row justify-between gap-2 md:gap-40 items-start">
      <div class="min-w-0 flex-1 flex flex-col gap-4">
        <ResourceBar/>
      </div>
      <div class="pointer-events-auto gap-2 md:gap-3 flex shrink-0 flex-row md:flex-col items-end">
        <button class="menu-shortcut-btn pixel-font" @click="pauseGame">Menu</button>
      </div>
      <div class="pointer-events-auto gap-2 flex flex-col justify-end justify-items-end" v-if="showHelpers">
        <WorldControls/>
      </div>
    </div>
    <HeroesBar />
    <FpsCounter v-if="showHelpers" />
  </div>
  <!-- Bottom-right toolbar -->
  <div class="fixed bottom-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
    <MaintenanceAlert />
    <button
      v-if="hasGoals"
      class="goals-toggle-btn"
      :class="{ 'goals-toggle-btn--active': isGoalsPanelOpen }"
      @click="toggleGoals"
      title="Open goals (G)"
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
  <!-- Goals panel (anchored bottom-right) -->
  <GoalsPanel />
  <!-- Centered conversation overlay -->
  <ChronicleBar />
  <PlayerModal />
  <PopulationOverviewModal />
  <ResourceDetailModal />
  <SettlerModal />
  <NotificationOverlay />
  <InGameMenu />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
import ResourceBar from './ResourceBar.vue';
import MaintenanceAlert from './MaintenanceAlert.vue';
import ChronicleBar from './ChronicleBar.vue';
import GoalsPanel from './GoalsPanel.vue';
import WorldControls from './WorldControls.vue';
import HeroesBar from './HeroesBar.vue';
import InGameMenu from './InGameMenu.vue';
import FpsCounter from './FpsCounter.vue';
import OnlinePlayersIndicator from './OnlinePlayersIndicator.vue';
import MusicPlayer from './MusicPlayer.vue';
import PlayerModal from './PlayerModal.vue';
import PopulationOverviewModal from './PopulationOverviewModal.vue';
import ResourceDetailModal from './ResourceDetailModal.vue';
import SettlerModal from './SettlerModal.vue';
import NotificationOverlay from './NotificationOverlay.vue';
import { pauseGame } from '../store/uiStore';
import { chronicleHasEntries, requestChronicleReopen, toggleGoalsPanel, isGoalsPanelOpen } from '../store/chronicleStore';
import { runSnapshot } from '../store/runStore';

const showHelpers = ref(false);

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

function recallConversation() {
  requestChronicleReopen();
}

function toggleGoals() {
  toggleGoalsPanel();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault();
    showHelpers.value = !showHelpers.value;
    return;
  }
  const target = e.target as HTMLElement | null;
  const isInput = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
  if (isInput || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.code === 'KeyC') recallConversation();
  if (e.code === 'KeyG') toggleGoals();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
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
  @apply self-end rounded-2xl border border-slate-700/80 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-slate-100 shadow-xl backdrop-blur-md transition-colors hover:border-amber-300/40;
  background-color: rgb(2 6 23 / 0.78);
}

.menu-shortcut-btn:hover {
  background-color: rgb(15 23 42 / 0.9);
}

.conversation-recall-btn {
  @apply flex items-center justify-center rounded-2xl border border-amber-400/30 px-3 py-3 text-sm shadow-xl backdrop-blur-md transition-all hover:border-amber-300/50 hover:scale-105;
  background-color: rgb(2 6 23 / 0.78);
  line-height: 1;
}

.conversation-recall-btn:hover {
  background-color: rgb(15 23 42 / 0.9);
}

.goals-toggle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 16px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.2), transparent 42%),
    rgba(2, 6, 23, 0.78);
  color: rgb(253 230 138);
  box-shadow: 0 16px 32px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(18px);
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.goals-toggle-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(245, 158, 11, 0.48);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.28), transparent 42%),
    rgba(15, 23, 42, 0.92);
}

.goals-toggle-btn--active {
  transform: translateY(-1px);
  border-color: rgba(245, 158, 11, 0.48);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.28), transparent 42%),
    rgba(15, 23, 42, 0.92);
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
</style>
