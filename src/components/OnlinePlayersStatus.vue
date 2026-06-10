<template>
  <div class="online-players-status" aria-live="polite">
    {{ playerCount }} {{ playerCount === 1 ? 'player' : 'players' }} online
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getOnlinePlayersCount } from '../store/playerStore';

const playerCount = computed(() => Math.max(1, getOnlinePlayersCount.value));
</script>

<style scoped>
.online-players-status {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + var(--driftlands-safe-bottom, 0px));
  z-index: 30;
  transform: translateX(-50%);
  color: rgba(226, 232, 240, 0.72);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  pointer-events: none;
  text-shadow: 0 2px 8px rgba(2, 6, 23, 0.9);
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .online-players-status {
    bottom: calc(4.35rem + var(--driftlands-safe-bottom, 0px));
    font-size: 0.68rem;
  }
}
</style>
