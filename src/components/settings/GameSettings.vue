<template>
  <div class="space-y-6">
    <h3 class="text-lg font-semibold text-white mb-4">Game Settings</h3>

    <!-- Gameplay Settings -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Gameplay</h4>

      <!-- Auto-save frequency -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Auto-save frequency</label>
        <select v-model="gameSettings.autoSaveInterval" @change="saveSettings" class="setting-select">
          <option value="30">30 seconds</option>
          <option value="60">1 minute</option>
          <option value="300">5 minutes</option>
          <option value="600">10 minutes</option>
          <option value="0">Disabled</option>
        </select>
      </div>

      <!-- Camera settings -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Camera movement speed</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">Slow</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            v-model.number="gameSettings.cameraSpeed"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-8 text-right">Fast</span>
        </div>
      </div>

      <!-- Pause on focus loss -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Pause when window loses focus</label>
          <p class="text-xs text-slate-400 mt-1">Automatically pause the game when switching to another window</p>
        </div>
        <input
          type="checkbox"
          v-model="gameSettings.pauseOnFocusLoss"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- Show coordinates -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Show coordinates in debug panel</label>
          <p class="text-xs text-slate-400 mt-1">Display hex coordinates when debug panel is visible (Tab key)</p>
        </div>
        <input
          type="checkbox"
          v-model="gameSettings.showCoordinates"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>

    <!-- Performance Settings -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Performance</h4>

      <!-- Animation quality -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Animation quality</label>
        <select v-model="gameSettings.animationQuality" @change="saveSettings" class="setting-select">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="off">Disabled</option>
        </select>
      </div>

      <!-- Particle effects -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Particle effects</label>
          <p class="text-xs text-slate-400 mt-1">Enable visual effects for tasks and interactions</p>
        </div>
        <input
          type="checkbox"
          v-model="gameSettings.particleEffects"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>

    <!-- UI Settings -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">User Interface</h4>

      <!-- UI scale -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">UI Scale</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">75%</span>
          <input
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            v-model.number="gameSettings.uiScale"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-8 text-right">150%</span>
        </div>
      </div>

      <!-- Show tooltips -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Show tooltips</label>
          <p class="text-xs text-slate-400 mt-1">Display helpful tooltips when hovering over elements</p>
        </div>
        <input
          type="checkbox"
          v-model="gameSettings.showTooltips"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

interface GameSettingsData {
  autoSaveInterval: number;
  cameraSpeed: number;
  pauseOnFocusLoss: boolean;
  showCoordinates: boolean;
  animationQuality: 'high' | 'medium' | 'low' | 'off';
  particleEffects: boolean;
  uiScale: number;
  showTooltips: boolean;
}

const GAME_SETTINGS_KEY = 'driftlands-game-settings';

function loadGameSettings(): GameSettingsData {
  try {
    const saved = localStorage.getItem(GAME_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        autoSaveInterval: parsed.autoSaveInterval ?? 60,
        cameraSpeed: parsed.cameraSpeed ?? 1.0,
        pauseOnFocusLoss: parsed.pauseOnFocusLoss ?? true,
        showCoordinates: parsed.showCoordinates ?? false,
        animationQuality: parsed.animationQuality ?? 'high',
        particleEffects: parsed.particleEffects ?? true,
        uiScale: parsed.uiScale ?? 1.0,
        showTooltips: parsed.showTooltips ?? true,
      };
    }
  } catch (error) {
    console.warn('Failed to load game settings:', error);
  }

  return {
    autoSaveInterval: 60,
    cameraSpeed: 1.0,
    pauseOnFocusLoss: true,
    showCoordinates: false,
    animationQuality: 'high',
    particleEffects: true,
    uiScale: 1.0,
    showTooltips: true,
  };
}

function saveGameSettings(settings: GameSettingsData) {
  try {
    localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save game settings:', error);
  }
}

const gameSettings = reactive(loadGameSettings());

function saveSettings() {
  saveGameSettings(gameSettings);
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
</style>
