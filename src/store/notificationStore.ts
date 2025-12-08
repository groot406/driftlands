import { ref, computed } from 'vue';

export interface Notification {
  id: string;
  type: 'player_join' | 'player_leave' | 'chat';
  title: string;
  message: string;
  duration?: number;
  timestamp: number;
}

// Notification state
const notifications = ref<Notification[]>([]);

// Computed values
export const getNotifications = computed(() => notifications.value);

// Actions
export function addNotification(notification: Omit<Notification, 'id' | 'timestamp'>) {
  const newNotification: Notification = {
    ...notification,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    duration: notification.duration || 5000
  };

  notifications.value.push(newNotification);

  // Auto-remove after duration
  setTimeout(() => {
    removeNotification(newNotification.id);
  }, newNotification.duration);
}

export function removeNotification(id: string) {
  const index = notifications.value.findIndex(n => n.id === id);
  if (index !== -1) {
    notifications.value.splice(index, 1);
  }
}

export function clearAllNotifications() {
  notifications.value = [];
}
