<template>
  <div class="fixed bottom-4 right-4 z-30">
    <button
      @click="openPlayerModal"
      class="bg-black/80 backdrop-blur-sm border border-gray-600 rounded-lg px-3 py-2 flex items-center gap-3 text-sm hover:bg-black/90 hover:border-gray-500 transition-colors cursor-pointer"
    >
      <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
      <div class="flex flex-col items-start leading-tight">
        <span class="text-green-400 font-mono">{{ playerCount }} online</span>
        <span class="text-[11px] text-gray-300">{{ readyPlayers }} ready</span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { getOnlinePlayersCount, getReadyPlayersCount } from '../store/playerStore';
import { setPlayerModalOpen } from '../store/chatStore';
import { openWindow, WINDOW_IDS } from '../core/windowManager';
import { computed } from 'vue';

// Show mock count if no real connection, otherwise show actual count
const playerCount = computed(() => {
  const actualCount = getOnlinePlayersCount.value;
  return actualCount > 0 ? actualCount : 1; // Show at least 1 (yourself) when connected
});

const readyPlayers = computed(() => getReadyPlayersCount.value);

function openPlayerModal() {
  setPlayerModalOpen(true);
  openWindow(WINDOW_IDS.PLAYER_MODAL);
}
</script>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
