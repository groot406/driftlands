import { ref } from 'vue';

export type ToolbarPanelKey =
  | 'maintenance'
  | 'debug'
  | 'admin'
  | 'tutorial'
  | 'goals'
  | 'chronicle'
  | 'music'
  | 'chat';

export const activeToolbarPanel = ref<ToolbarPanelKey | null>(null);

export function openToolbarPanel(panel: ToolbarPanelKey) {
  activeToolbarPanel.value = panel;
}

export function closeToolbarPanel(panel?: ToolbarPanelKey) {
  if (!panel || activeToolbarPanel.value === panel) {
    activeToolbarPanel.value = null;
  }
}

export function toggleToolbarPanel(panel: ToolbarPanelKey) {
  if (activeToolbarPanel.value === panel) {
    activeToolbarPanel.value = null;
  } else {
    activeToolbarPanel.value = panel;
  }
}
