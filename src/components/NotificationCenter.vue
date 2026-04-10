<template>
  <Transition name="smooth-modal" appear>
    <div
      v-if="isOpen"
      class="smooth-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 text-white backdrop-blur-sm"
      @click.self="closeNotificationCenter"
    >
      <section class="smooth-modal-surface flex h-[min(88vh,44rem)] w-[min(94vw,40rem)] flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/94 shadow-2xl">
        <header class="border-b border-slate-800 px-6 py-5">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="pixel-font text-[10px] uppercase tracking-[0.2em] text-sky-200/80">Recallable Alerts</p>
              <h2 class="mt-3 text-2xl font-semibold text-white">Field Reports</h2>
              <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                Every gameplay notification is kept here until you leave the run, so missed discoveries and status updates stay recoverable.
              </p>
            </div>
            <button
              class="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-700"
              @click="closeNotificationCenter"
            >
              Close
            </button>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
            <span class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1">
              {{ history.length }} stored
            </span>
            <span class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-100">
              {{ unreadCount }} unread
            </span>
            <button
              class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!history.length"
              @click="clearHistory"
            >
              Clear log
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div
            v-if="!history.length"
            class="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-950/45 px-6 py-10 text-center"
          >
            <div>
              <p class="text-lg font-semibold text-white">No reports logged yet</p>
              <p class="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                Frontier finds, objective updates, and co-op alerts will stay here after their toast fades. Press <span class="rounded bg-slate-800 px-2 py-1 text-xs text-white">N</span> anytime to reopen this panel.
              </p>
            </div>
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="notification in history"
              :key="notification.id"
              class="rounded-2xl border px-4 py-4 transition-colors"
              :class="notification.read ? 'border-slate-800 bg-slate-950/55' : 'border-amber-400/30 bg-amber-400/8'"
            >
              <div class="flex items-start gap-3">
                <div class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" :class="indicatorClass(notification.type)" />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-white">{{ notification.title }}</p>
                      <p class="mt-1 break-words text-sm leading-relaxed text-slate-300">{{ notification.message }}</p>
                    </div>
                    <span class="shrink-0 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      {{ formatTimestamp(notification.timestamp) }}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { clearNotificationHistory, getNotificationHistory, getUnreadNotificationCount, markAllNotificationsRead, type NotificationType } from '../store/notificationStore';
import { closeWindow, isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';

const history = getNotificationHistory;
const unreadCount = getUnreadNotificationCount;
const isOpen = computed(() => isWindowOpen(WINDOW_IDS.NOTIFICATION_CENTER));

const todayFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const olderFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function closeNotificationCenter() {
  closeWindow(WINDOW_IDS.NOTIFICATION_CENTER);
}

function clearHistory() {
  clearNotificationHistory();
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? todayFormatter.format(date) : olderFormatter.format(date);
}

function indicatorClass(type: NotificationType) {
  switch (type) {
    case 'player_join':
      return 'bg-green-400';
    case 'player_leave':
      return 'bg-red-400';
    case 'chat':
      return 'bg-blue-400';
    case 'goal_completed':
      return 'bg-emerald-400';
    case 'run_state':
      return 'bg-amber-300';
    case 'coop_ping':
      return 'bg-cyan-300';
    case 'coop_state':
      return 'bg-violet-300';
    default:
      return 'bg-slate-300';
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.NOTIFICATION_CENTER)) {
    event.preventDefault();
    event.stopPropagation();
    closeNotificationCenter();
  }
}

watch(isOpen, (open) => {
  if (open) {
    markAllNotificationsRead();
  }
});

watch(() => history.value.length, () => {
  if (isOpen.value) {
    markAllNotificationsRead();
  }
});

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
