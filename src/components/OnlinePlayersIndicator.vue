<template>
  <button
    @click="openPlayerModal"
    class="toolbar-icon-btn"
    :title="buttonTitle"
    :aria-label="buttonTitle"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
      <path d="M4.5 5.25A2.25 2.25 0 016.75 3h10.5a2.25 2.25 0 012.25 2.25v7.5A2.25 2.25 0 0117.25 15H9.31l-3.97 3.31A.75.75 0 014.125 17.73V15H4.5a2.25 2.25 0 01-2.25-2.25v-7.5A2.25 2.25 0 014.5 5.25z" />
    </svg>
    <span v-if="unreadChatCount > 0" class="count-badge" aria-label="Unread chat messages">
      {{ unreadChatLabel }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { getUnreadChatCount, setPlayerModalOpen } from '../store/chatStore';
import { closeWindow, openWindow, WINDOW_IDS } from '../core/windowManager';
import { computed, watch } from 'vue';
import { activeToolbarPanel, openToolbarPanel } from '../store/toolbarPanelStore';

const unreadChatCount = getUnreadChatCount;
const unreadChatLabel = computed(() => unreadChatCount.value > 9 ? '9+' : `${unreadChatCount.value}`);
const buttonTitle = computed(() => {
  if (unreadChatCount.value <= 0) {
    return 'Open chat';
  }

  return `Open chat - ${unreadChatCount.value} unread message${unreadChatCount.value === 1 ? '' : 's'}`;
});

function openPlayerModal() {
  openToolbarPanel('chat');
  setPlayerModalOpen(true);
  openWindow(WINDOW_IDS.PLAYER_MODAL);
}

watch(activeToolbarPanel, (panel) => {
  if (panel !== 'chat') {
    setPlayerModalOpen(false);
    closeWindow(WINDOW_IDS.PLAYER_MODAL);
  }
});
</script>

<style scoped>
.toolbar-icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(52, 211, 153, 0.34);
  background:
    radial-gradient(circle at top left, rgba(52, 211, 153, 0.18), transparent 44%),
    rgba(15, 23, 42, 0.78);
  color: rgb(110 231 183);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.toolbar-icon-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(52, 211, 153, 0.58);
  background:
    radial-gradient(circle at top left, rgba(52, 211, 153, 0.28), transparent 44%),
    rgba(21, 83, 45, 0.9);
}

.count-badge {
  position: absolute;
  right: -5px;
  top: -5px;
  min-width: 17px;
  height: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 1px solid rgba(52, 211, 153, 0.58);
  border-radius: 999px;
  background: rgb(52 211 153);
  color: rgb(15 23 42);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 0 0 2px rgba(2, 6, 23, 0.9), 0 0 12px rgba(52, 211, 153, 0.5);
  animation: chat-unread-pulse 1.5s ease-in-out infinite;
}

@keyframes chat-unread-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}
</style>
