<template>
  <button
    class="pointer-events-auto relative flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/78 px-3 py-2 md:px-4 md:py-3 text-left text-white shadow-xl backdrop-blur-md transition-colors hover:border-amber-300/40 hover:bg-slate-900/90"
    @click="openNotificationCenter"
  >
    <div class="pixel-font flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-300/15 text-[10px] uppercase tracking-[0.16em] text-sky-100">
      Log
    </div>
    <div class="min-w-0 hidden md:block">
      <p class="pixel-font text-[10px] uppercase tracking-[0.18em] text-sky-200/80">Field Reports</p>
      <p class="mt-1 text-sm font-semibold text-white">{{ statusLabel }}</p>
      <p class="mt-1 text-[11px] text-slate-300">{{ helperLabel }}</p>
    </div>
    <span
      v-if="unreadCount > 0"
      class="pixel-font absolute -right-1 -top-1 md:right-3 md:top-3 rounded-full border border-amber-300/30 bg-amber-300/15 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-100"
    >
      {{ badgeLabel }}
    </span>
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
