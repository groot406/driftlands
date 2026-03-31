<template>
  <button
    @click="openPlayerModal"
    class="toolbar-icon-btn"
    :title="`${playerCount} player${playerCount === 1 ? '' : 's'} online`"
  >
    <!-- People icon -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
      <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
    <!-- Player count badge -->
    <span class="count-badge">{{ playerCount }}</span>
  </button>
</template>

<script setup lang="ts">
import { getOnlinePlayersCount } from '../store/playerStore';
import { setPlayerModalOpen } from '../store/chatStore';
import { openWindow, WINDOW_IDS } from '../core/windowManager';
import { computed } from 'vue';

// Show mock count if no real connection, otherwise show actual count
const playerCount = computed(() => {
  const actualCount = getOnlinePlayersCount.value;
  return actualCount > 0 ? actualCount : 1; // Show at least 1 (yourself) when connected
});

function openPlayerModal() {
  setPlayerModalOpen(true);
  openWindow(WINDOW_IDS.PLAYER_MODAL);
}
</script>

<style scoped>
.toolbar-icon-btn {
  @apply relative flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-2.5 py-2 text-green-400/80 shadow-lg backdrop-blur-sm transition-all hover:border-green-400/50 hover:text-green-400 cursor-pointer;
  background: rgba(2, 6, 23, 0.82);
}
.toolbar-icon-btn:hover {
  background: rgba(15, 23, 42, 0.92);
}

.count-badge {
  @apply text-[11px] font-mono leading-none text-green-400;
}
</style>
