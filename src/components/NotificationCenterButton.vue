<template>
  <button
    class="reports-btn pointer-events-auto"
    :title="statusLabel"
    @click="openNotificationCenter"
  >
    <!-- Bell icon -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" />
    </svg>
    <!-- Unread count badge -->
    <span v-if="unreadCount > 0" class="count-badge">{{ badgeLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { isKeyboardBlocked, openWindow, WINDOW_IDS } from '../core/windowManager';
import { getNotificationHistory, getUnreadNotificationCount } from '../store/notificationStore';

const history = getNotificationHistory;
const unreadCount = getUnreadNotificationCount;
const badgeLabel = computed(() => unreadCount.value > 99 ? '99+' : `${unreadCount.value}`);
const statusLabel = computed(() => {
  if (unreadCount.value > 0) {
    return `${unreadCount.value} unread report${unreadCount.value === 1 ? '' : 's'}`;
  }

  if (history.value.length > 0) {
    return 'All caught up';
  }

  return 'No reports yet';
});
const helperLabel = computed(() => {
  if (history.value.length > 0) {
    return `${history.value.length} recent notification${history.value.length === 1 ? '' : 's'} stored`;
  }

  return 'Press N to reopen missed alerts';
});

function openNotificationCenter() {
  openWindow(WINDOW_IDS.NOTIFICATION_CENTER);
}

function handleKeydown(event: KeyboardEvent) {
  if (isKeyboardBlocked.value) return;
  if (event.key.toLowerCase() !== 'n') return;

  event.preventDefault();
  openNotificationCenter();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.reports-btn {
  @apply relative flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-2.5 py-2 text-sky-300/80 shadow-lg backdrop-blur-sm transition-all hover:border-sky-300/50 hover:text-sky-300 cursor-pointer;
  background: rgba(2, 6, 23, 0.82);
}
.reports-btn:hover {
  background: rgba(15, 23, 42, 0.92);
}

.count-badge {
  @apply text-[11px] font-mono leading-none text-sky-300;
}
</style>
