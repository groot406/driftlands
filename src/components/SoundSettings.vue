<template>
  <div class="space-y-6">
    <h3 class="text-lg font-semibold text-white mb-4">Sound Settings</h3>

    <!-- Volume Controls -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Volume Controls</h4>

      <!-- Sound Enable/Disable -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Enable Sound</label>
          <p class="text-xs text-slate-400 mt-1">Master switch for all game audio</p>
        </div>
        <input
          id="sound-enabled"
          type="checkbox"
          :checked="soundStore.soundEnabled"
          @change="toggleSoundEnabled"
          class="setting-checkbox"
        />
      </div>

      <!-- Master Volume -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Master Volume</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">0%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="soundStore.masterVolume"
            @input="updateMasterVolume"
            :disabled="!soundStore.soundEnabled"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-12 text-right">{{ Math.round(soundStore.masterVolume * 100) }}%</span>
        </div>
      </div>

      <!-- Music Volume -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Music Volume</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">0%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="soundStore.musicVolume"
            @input="updateMusicVolume"
            :disabled="!soundStore.soundEnabled"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-12 text-right">{{ Math.round(soundStore.musicVolume * 100) }}%</span>
        </div>
      </div>

      <!-- Effects Volume -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Effects Volume</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">0%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="soundStore.effectsVolume"
            @input="updateEffectsVolume"
            :disabled="!soundStore.soundEnabled"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-12 text-right">{{ Math.round(soundStore.effectsVolume * 100) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  soundStore,
  setMasterVolume,
  setMusicVolume,
  setEffectsVolume,
  toggleSound,
} from '../store/soundStore';

function updateMasterVolume(event: Event) {
  const target = event.target as HTMLInputElement;
  setMasterVolume(parseFloat(target.value));
}

function updateMusicVolume(event: Event) {
  const target = event.target as HTMLInputElement;
  setMusicVolume(parseFloat(target.value));
}

function updateEffectsVolume(event: Event) {
  const target = event.target as HTMLInputElement;
  setEffectsVolume(parseFloat(target.value));
}

function toggleSoundEnabled(event: Event) {
  const target = event.target as HTMLInputElement;
  toggleSound(target.checked);
}

</script>

<style scoped>
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

.slider:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.slider:disabled::-webkit-slider-thumb {
  @apply cursor-not-allowed bg-slate-400;
}
</style>
