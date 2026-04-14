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
    <MusicPlayer />
    <OnlinePlayersIndicator />
  </div>
  <div class="fixed bottom-4 left-4 z-30">
    <ChronicleBar />
  </div>
  <PlayerModal />
  <PopulationOverviewModal />
  <ResourceDetailModal />
  <SettlerModal />
  <NotificationOverlay />
  <InGameMenu />
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue';
import ResourceBar from './ResourceBar.vue';
import ChronicleBar from './ChronicleBar.vue';
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

const showHelpers = ref(false);

onMounted(() =>
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        showHelpers.value = !showHelpers.value;
      }
    }));

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
</style>
