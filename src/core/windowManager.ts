import { ref, computed } from 'vue';

export type WindowId = string;

export interface WindowConfig {
  id: WindowId;
  priority: number; // Higher priority windows block lower priority ones
  blocksKeyboard: boolean; // Whether this window should block keyboard events to lower priority windows
}

// Window state management
const windows = ref<Map<WindowId, WindowConfig>>(new Map());
const windowStack = ref<WindowId[]>([]);

// Computed values
export const getActiveWindow = computed(() => {
  if (windowStack.value.length === 0) return null;
  return windowStack.value[windowStack.value.length - 1];
});

export const getActiveWindowConfig = computed(() => {
  const activeId = getActiveWindow.value;
  if (!activeId) return null;
  return windows.value.get(activeId) || null;
});

// Check if any window is currently blocking keyboard events
export const isKeyboardBlocked = computed(() => {
  const activeConfig = getActiveWindowConfig.value;
  return activeConfig?.blocksKeyboard ?? false;
});

// Actions
export function registerWindow(config: WindowConfig): void {
  windows.value.set(config.id, config);
}

export function unregisterWindow(windowId: WindowId): void {
  windows.value.delete(windowId);
  closeWindow(windowId); // Ensure it's removed from stack if open
}

export function openWindow(windowId: WindowId): void {
  const config = windows.value.get(windowId);
  if (!config) {
    console.warn(`Attempted to open unregistered window: ${windowId}`);
    return;
  }

  // Remove from stack if already present
  const existingIndex = windowStack.value.indexOf(windowId);
  if (existingIndex !== -1) {
    windowStack.value.splice(existingIndex, 1);
  }

  // Insert in correct position based on priority
  const insertIndex = windowStack.value.findIndex(id => {
    const otherConfig = windows.value.get(id);
    return otherConfig && otherConfig.priority < config.priority;
  });

  if (insertIndex === -1) {
    windowStack.value.push(windowId);
  } else {
    windowStack.value.splice(insertIndex, 0, windowId);
  }
}

export function closeWindow(windowId: WindowId): void {
  const index = windowStack.value.indexOf(windowId);
  if (index !== -1) {
    windowStack.value.splice(index, 1);
  }
}

export function isWindowOpen(windowId: WindowId): boolean {
  return windowStack.value.includes(windowId);
}

export function isWindowActive(windowId: WindowId): boolean {
  return getActiveWindow.value === windowId;
}

// Utility function to check if a specific window type should block keyboard events
export function shouldBlockKeyboardFor(windowId?: WindowId): boolean {
  if (!windowId) {
    // If no specific window provided, check if any window is blocking
    return isKeyboardBlocked.value;
  }

  // Check if the specified window is active and blocking
  const activeWindow = getActiveWindow.value;
  if (activeWindow === windowId) {
    const config = windows.value.get(windowId);
    return config?.blocksKeyboard ?? false;
  }

  return false;
}

// Predefined window IDs for common windows
export const WINDOW_IDS = {
  PLAYER_MODAL: 'player-modal',
  IN_GAME_MENU: 'in-game-menu',
  SETTINGS_MODAL: 'settings-modal',
  MISSION_CENTER: 'mission-center',
  NOTIFICATION_CENTER: 'notification-center',
  TASK_MENU: 'task-menu',
  TOWN_CENTER_PANEL: 'town-center-panel',
} as const;

// Register common windows with default configurations
registerWindow({
  id: WINDOW_IDS.PLAYER_MODAL,
  priority: 100,
  blocksKeyboard: true,
});

registerWindow({
  id: WINDOW_IDS.IN_GAME_MENU,
  priority: 200,
  blocksKeyboard: true,
});

registerWindow({
  id: WINDOW_IDS.SETTINGS_MODAL,
  priority: 150,
  blocksKeyboard: true,
});

registerWindow({
  id: WINDOW_IDS.MISSION_CENTER,
  priority: 175,
  blocksKeyboard: true,
});

registerWindow({
  id: WINDOW_IDS.NOTIFICATION_CENTER,
  priority: 180,
  blocksKeyboard: true,
});

registerWindow({
  id: WINDOW_IDS.TASK_MENU,
  priority: 50,
  blocksKeyboard: true, // Task menu should block keyboard to prevent conflicts
});

registerWindow({
  id: WINDOW_IDS.TOWN_CENTER_PANEL,
  priority: 60,
  blocksKeyboard: true,
});
