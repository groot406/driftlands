<template>
  <div class="space-y-6">
    <h3 class="text-lg font-semibold text-white mb-4">Controls Settings</h3>

    <!-- Keyboard Controls -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Keyboard</h4>

      <!-- Key bindings -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-sm text-slate-200">Pause/Menu</label>
          <kbd class="keybind">ESC</kbd>
        </div>

        <div class="flex items-center justify-between">
          <label class="text-sm text-slate-200">Toggle Debug Panel</label>
          <kbd class="keybind">TAB</kbd>
        </div>
      </div>

      <!-- Keyboard settings -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Enable keyboard shortcuts</label>
          <p class="text-xs text-slate-400 mt-1">Allow keyboard shortcuts for game actions</p>
        </div>
        <input
          type="checkbox"
          v-model="controlSettings.keyboardShortcuts"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>

    <!-- Mouse Controls -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Mouse</h4>

      <!-- Mouse sensitivity -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Camera drag sensitivity</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">Low</span>
          <input
            type="range"
            min="0.3"
            max="2.0"
            step="0.1"
            v-model.number="controlSettings.mouseSensitivity"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-8 text-right">High</span>
        </div>
      </div>

      <!-- Invert mouse -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Invert mouse drag</label>
          <p class="text-xs text-slate-400 mt-1">Reverse the direction of mouse camera dragging</p>
        </div>
        <input
          type="checkbox"
          v-model="controlSettings.invertMouse"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- Double-click speed -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Double-click speed</label>
        <select v-model="controlSettings.doubleClickSpeed" @change="saveSettings" class="setting-select">
          <option value="200">Fast (200ms)</option>
          <option value="300">Normal (300ms)</option>
          <option value="500">Slow (500ms)</option>
        </select>
      </div>
    </div>

    <!-- Touch Controls (for mobile/tablet) -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Touch Controls</h4>

      <!-- Touch sensitivity -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Touch drag sensitivity</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">Low</span>
          <input
            type="range"
            min="0.3"
            max="2.0"
            step="0.1"
            v-model.number="controlSettings.touchSensitivity"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-8 text-right">High</span>
        </div>
      </div>

      <!-- Touch feedback -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Haptic feedback</label>
          <p class="text-xs text-slate-400 mt-1">Enable vibration feedback on supported devices</p>
        </div>
        <input
          type="checkbox"
          v-model="controlSettings.hapticFeedback"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>

    <!-- Accessibility -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Accessibility</h4>

      <!-- Reduced motion -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Reduce motion</label>
          <p class="text-xs text-slate-400 mt-1">Minimize animations for better accessibility</p>
        </div>
        <input
          type="checkbox"
          v-model="controlSettings.reducedMotion"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- High contrast -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">High contrast mode</label>
          <p class="text-xs text-slate-400 mt-1">Increase contrast for better visibility</p>
        </div>
        <input
          type="checkbox"
          v-model="controlSettings.highContrast"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

interface ControlSettingsData {
  keyboardShortcuts: boolean;
  mouseSensitivity: number;
  invertMouse: boolean;
  doubleClickSpeed: number;
  touchSensitivity: number;
  hapticFeedback: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

const CONTROL_SETTINGS_KEY = 'driftlands-control-settings';

function loadControlSettings(): ControlSettingsData {
  try {
    const saved = localStorage.getItem(CONTROL_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        keyboardShortcuts: parsed.keyboardShortcuts ?? true,
        mouseSensitivity: parsed.mouseSensitivity ?? 1.0,
        invertMouse: parsed.invertMouse ?? false,
        doubleClickSpeed: parsed.doubleClickSpeed ?? 300,
        touchSensitivity: parsed.touchSensitivity ?? 1.0,
        hapticFeedback: parsed.hapticFeedback ?? true,
        reducedMotion: parsed.reducedMotion ?? false,
        highContrast: parsed.highContrast ?? false,
      };
    }
  } catch (error) {
    console.warn('Failed to load control settings:', error);
  }

  return {
    keyboardShortcuts: true,
    mouseSensitivity: 1.0,
    invertMouse: false,
    doubleClickSpeed: 300,
    touchSensitivity: 1.0,
    hapticFeedback: true,
    reducedMotion: false,
    highContrast: false,
  };
}

function saveControlSettings(settings: ControlSettingsData) {
  try {
    localStorage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save control settings:', error);
  }
}

const controlSettings = reactive(loadControlSettings());

function saveSettings() {
  saveControlSettings(controlSettings);
}
</script>

<style scoped>
.setting-select {
  @apply bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent;
}

.setting-checkbox {
  @apply w-4 h-4 text-blue-500 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2;
}

.slider {
  @apply h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer;
}

.slider::-webkit-slider-thumb {
  @apply appearance-none w-4 h-4 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-400 transition-colors;
}

.slider::-moz-range-thumb {
  @apply w-4 h-4 bg-blue-500 rounded-full cursor-pointer border-0 hover:bg-blue-400 transition-colors;
}

.keybind {
  @apply inline-flex items-center px-2 py-1 bg-slate-600 border border-slate-500 rounded text-xs font-mono text-slate-200;
}
</style>
