<template>
  <div class="space-y-6">
    <h3 class="text-lg font-semibold text-white mb-4">Graphics Settings</h3>

    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Camera Effects</h4>

      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Impact camera shake</label>
          <p class="text-xs text-slate-400 mt-1">Adds brief shake bursts for nearby drop-offs, deliveries, and completed work</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.screenShake"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Camera motion blur</label>
          <p class="text-xs text-slate-400 mt-1">Adds a directional smear when the camera moves quickly</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.motionBlur"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Bloom</label>
          <p class="text-xs text-slate-400 mt-1">Adds a soft glow to bright tiles and interaction highlights</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.bloom"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Particles</label>
          <p class="text-xs text-slate-400 mt-1">Adds ambient motes and movement trails across the map</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.particles"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { graphicsStore, persistGraphicsSettings } from '../../store/graphicsStore';

const graphicsSettings = graphicsStore;

function saveSettings() {
  persistGraphicsSettings();
}
</script>

<style scoped>
.setting-checkbox {
  @apply w-4 h-4 text-blue-500 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2;
}
</style>
