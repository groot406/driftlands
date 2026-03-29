<template>
  <div v-if="isOpen" class="player-modal-backdrop" @click="close">
    <div class="player-modal-panel" @click.stop>
      <div class="player-modal-header">
        <div>
          <p class="player-modal-eyebrow">Party</p>
          <h2 class="player-modal-title">Connected Players</h2>
        </div>
        <button class="player-modal-close" @click="close" title="Close">
          ✕
        </button>
      </div>

      <div class="player-list">
        <div v-for="player in players" :key="player.id" class="player-row">
          <div class="player-main">
            <span class="player-name">{{ player.name }}</span>
            <span class="player-status" :class="{ 'player-status-ready': player.ready }">
              {{ player.ready ? 'Ready' : 'Preparing' }}
            </span>
          </div>
          <div class="player-meta">
            <span>{{ player.claimedHeroIds.length }} heroes claimed</span>
          </div>
        </div>

        <div v-if="players.length === 0" class="player-empty">
          Waiting for the first traveler to join.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { getConnectedPlayers } from '../store/playerStore';
import { getIsPlayerModalOpen, setPlayerModalOpen } from '../store/chatStore';
import { closeWindow, isWindowActive, WINDOW_IDS } from '../core/windowManager';

const isOpen = computed(() => getIsPlayerModalOpen.value);
const players = computed(() => getConnectedPlayers.value);

function close() {
  setPlayerModalOpen(false);
  closeWindow(WINDOW_IDS.PLAYER_MODAL);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.PLAYER_MODAL)) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

let listenerActive = false;

watch(isOpen, (nextOpen) => {
  if (nextOpen && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!nextOpen && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.player-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(8px);
}

.player-modal-panel {
  width: min(480px, 100%);
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.84)),
    radial-gradient(circle at top, rgba(14, 165, 233, 0.12), transparent 58%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
  color: #f8fafc;
}

.player-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 14px 20px;
}

.player-modal-eyebrow {
  margin: 0 0 4px 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.72);
}

.player-modal-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
}

.player-modal-close {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.78);
  color: inherit;
  cursor: pointer;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 20px 20px 20px;
}

.player-row {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.player-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.player-name {
  font-weight: 600;
}

.player-status {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(71, 85, 105, 0.44);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(226, 232, 240, 0.8);
}

.player-status-ready {
  background: rgba(34, 197, 94, 0.18);
  color: rgba(187, 247, 208, 0.96);
}

.player-meta {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(203, 213, 225, 0.76);
}

.player-empty {
  padding: 18px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.42);
  color: rgba(203, 213, 225, 0.76);
  text-align: center;
}
</style>
