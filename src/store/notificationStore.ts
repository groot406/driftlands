import { ref, computed } from 'vue';

export type NotificationType =
  | 'player_join'
  | 'player_leave'
  | 'chat'
  | 'goal_completed'
  | 'hero_skill'
  | 'run_state'
  | 'coop_ping'
  | 'coop_state';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  timestamp: number;
}

export interface NotificationHistoryEntry extends Notification {
  read: boolean;
}

const MAX_NOTIFICATION_HISTORY = 48;

// Notification state
const notifications = ref<Notification[]>([]);
const notificationHistory = ref<NotificationHistoryEntry[]>([]);

// Computed values
export const getNotifications = computed(() => notifications.value);
export const getNotificationHistory = computed(() => notificationHistory.value);
export const getUnreadNotificationCount = computed(() => notificationHistory.value.filter((notification) => !notification.read).length);

// Actions
export function addNotification(notification: Omit<Notification, 'id' | 'timestamp'>) {
  const newNotification: Notification = {
    ...notification,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    duration: notification.duration || 5000
  };

  notifications.value.push(newNotification);
  notificationHistory.value.unshift({
    ...newNotification,
    read: false,
  });

  if (notificationHistory.value.length > MAX_NOTIFICATION_HISTORY) {
    notificationHistory.value.splice(MAX_NOTIFICATION_HISTORY);
  }

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

export function markAllNotificationsRead() {
  notificationHistory.value = notificationHistory.value.map((notification) => (
    notification.read
      ? notification
      : { ...notification, read: true }
  ));
}

export function clearNotificationHistory() {
  notificationHistory.value = [];
}

export function resetNotifications() {
  notifications.value = [];
  notificationHistory.value = [];
}
