<template>
  <div class="fixed bottom-4 right-4 z-30 pointer-events-none">
    <div class="bg-black/80 backdrop-blur-sm border border-gray-600 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
      <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
      <span class="text-green-400 font-mono">{{ playerCount }} online</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getOnlinePlayersCount } from '../store/playerStore';
import { computed } from 'vue';

// Show mock count if no real connection, otherwise show actual count
const playerCount = computed(() => {
  const actualCount = getOnlinePlayersCount.value;
  return actualCount > 0 ? actualCount : 1; // Show at least 1 (yourself) when connected
});
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
