<template>
  <div class="fixed top-4 right-4 z-40 space-y-2 pointer-events-none">
    <transition-group
      name="notification"
      tag="div"
      class="space-y-2"
    >
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="bg-gray-900/95 backdrop-blur-sm border border-gray-600 rounded-lg p-3 max-w-sm pointer-events-auto shadow-lg"
        :class="getNotificationStyles(notification.type)"
      >
        <div class="flex items-start gap-3">
          <div class="shrink-0 mt-0.5">
            <div
              v-if="notification.type === 'player_join'"
              class="w-2 h-2 bg-green-400 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'player_leave'"
              class="w-2 h-2 bg-red-400 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'chat'"
              class="w-2 h-2 bg-blue-400 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'goal_completed'"
              class="w-2 h-2 bg-emerald-400 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'hero_skill'"
              class="w-2 h-2 bg-yellow-300 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'run_state'"
              class="w-2 h-2 bg-amber-300 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'coop_ping'"
              class="w-2 h-2 bg-cyan-300 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'coop_state'"
              class="w-2 h-2 bg-violet-300 rounded-full"
            ></div>
            <div
              v-else-if="notification.type === 'settlement'"
              class="w-2 h-2 bg-lime-300 rounded-full"
            ></div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-white">{{ notification.title }}</p>
            <p class="text-xs text-gray-300 mt-1 break-words">{{ notification.message }}</p>
          </div>
          <button
            @click="removeNotification(notification.id)"
            class="shrink-0 text-gray-400 hover:text-white transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { getNotifications, removeNotification } from '../store/notificationStore';

const notifications = getNotifications;

function getNotificationStyles(type: string) {
  switch (type) {
    case 'player_join':
      return 'border-green-500/30';
    case 'player_leave':
      return 'border-red-500/30';
    case 'chat':
      return 'border-blue-500/30';
    case 'goal_completed':
      return 'border-emerald-500/30';
    case 'hero_skill':
      return 'border-yellow-300/40 bg-yellow-300/10';
    case 'run_state':
      return 'border-amber-400/30';
    case 'coop_ping':
      return 'border-cyan-400/30';
    case 'coop_state':
      return 'border-violet-400/30';
    case 'settlement':
      return 'border-lime-300/35 bg-lime-300/10';
    default:
      return 'border-gray-500/30';
  }
}
</script>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-move {
  transition: transform 0.3s ease;
}
</style>
