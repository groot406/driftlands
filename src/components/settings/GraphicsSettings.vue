<template>
  <div class="space-y-6">
    <h3 class="text-lg font-semibold text-white mb-4">Graphics Settings</h3>

    <!-- Rendering Settings -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Rendering</h4>

      <!-- Rendering quality -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Rendering quality</label>
        <select v-model="graphicsSettings.renderingQuality" @change="saveSettings" class="setting-select">
          <option value="ultra">Ultra</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="potato">Potato Mode</option>
        </select>
      </div>

      <!-- Anti-aliasing -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Anti-aliasing</label>
          <p class="text-xs text-slate-400 mt-1">Smooth jagged edges for better visual quality</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.antiAliasing"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- Vsync -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">V-Sync</label>
          <p class="text-xs text-slate-400 mt-1">Synchronize with monitor refresh rate to prevent tearing</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.vsync"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- Frame rate limit -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Frame rate limit</label>
        <select v-model="graphicsSettings.frameRateLimit" @change="saveSettings" class="setting-select">
          <option value="unlimited">Unlimited</option>
          <option value="144">144 FPS</option>
          <option value="120">120 FPS</option>
          <option value="90">90 FPS</option>
          <option value="60">60 FPS</option>
          <option value="30">30 FPS</option>
        </select>
      </div>
    </div>

    <!-- Visual Effects -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Visual Effects</h4>

      <!-- Particle density -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Particle effect density</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">Low</span>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            v-model.number="graphicsSettings.particleDensity"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-8 text-right">High</span>
        </div>
      </div>

      <!-- Screen shake -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Screen shake effects</label>
          <p class="text-xs text-slate-400 mt-1">Camera shake during impactful events</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.screenShake"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- Bloom effects -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-sm text-slate-200">Bloom effects</label>
          <p class="text-xs text-slate-400 mt-1">Glowing light effects for magical elements</p>
        </div>
        <input
          type="checkbox"
          v-model="graphicsSettings.bloom"
          @change="saveSettings"
          class="setting-checkbox"
        />
      </div>

      <!-- Shadow quality -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Shadow quality</label>
        <select v-model="graphicsSettings.shadowQuality" @change="saveSettings" class="setting-select">
          <option value="ultra">Ultra</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="off">Disabled</option>
        </select>
      </div>
    </div>

    <!-- Display Settings -->
    <div class="space-y-4">
      <h4 class="text-sm font-medium text-slate-300 border-b border-slate-600 pb-2">Display</h4>

      <!-- Brightness -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Brightness</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">Dark</span>
          <input
            type="range"
            min="0.3"
            max="2.0"
            step="0.05"
            v-model.number="graphicsSettings.brightness"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-12 text-right">Bright</span>
        </div>
      </div>

      <!-- Contrast -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Contrast</label>
        <div class="flex items-center gap-3 w-48">
          <span class="text-xs text-slate-400 w-8">Low</span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            v-model.number="graphicsSettings.contrast"
            @input="saveSettings"
            class="flex-1 slider"
          />
          <span class="text-xs text-slate-400 w-8 text-right">High</span>
        </div>
      </div>

      <!-- Color theme -->
      <div class="flex items-center justify-between">
        <label class="text-sm text-slate-200">Color theme</label>
        <select v-model="graphicsSettings.colorTheme" @change="saveSettings" class="setting-select">
          <option value="default">Default</option>
          <option value="warm">Warm</option>
          <option value="cool">Cool</option>
          <option value="monochrome">Monochrome</option>
          <option value="colorblind">Colorblind Friendly</option>
        </select>
      </div>
    </div>

    <!-- Performance Info -->
    <div class="bg-slate-800/50 rounded-lg p-3 mt-6">
      <h4 class="text-sm font-medium text-slate-300 mb-2">Performance Impact</h4>
      <div class="grid grid-cols-3 gap-4 text-xs">
        <div class="text-center">
          <div class="text-green-400 font-semibold">CPU</div>
          <div class="text-slate-400">{{ getPerformanceImpact('cpu') }}</div>
        </div>
        <div class="text-center">
          <div class="text-yellow-400 font-semibold">GPU</div>
          <div class="text-slate-400">{{ getPerformanceImpact('gpu') }}</div>
        </div>
        <div class="text-center">
          <div class="text-blue-400 font-semibold">Memory</div>
          <div class="text-slate-400">{{ getPerformanceImpact('memory') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';

interface GraphicsSettingsData {
  renderingQuality: string;
  antiAliasing: boolean;
  vsync: boolean;
  frameRateLimit: string;
  particleDensity: number;
  screenShake: boolean;
  bloom: boolean;
  shadowQuality: string;
  brightness: number;
  contrast: number;
  colorTheme: string;
}

const GRAPHICS_SETTINGS_KEY = 'driftlands-graphics-settings';

function loadGraphicsSettings(): GraphicsSettingsData {
  try {
    const saved = localStorage.getItem(GRAPHICS_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        renderingQuality: parsed.renderingQuality ?? 'high',
        antiAliasing: parsed.antiAliasing ?? true,
        vsync: parsed.vsync ?? true,
        frameRateLimit: parsed.frameRateLimit ?? 'unlimited',
        particleDensity: parsed.particleDensity ?? 1.0,
        screenShake: parsed.screenShake ?? true,
        bloom: parsed.bloom ?? true,
        shadowQuality: parsed.shadowQuality ?? 'medium',
        brightness: parsed.brightness ?? 1.0,
        contrast: parsed.contrast ?? 1.0,
        colorTheme: parsed.colorTheme ?? 'default',
      };
    }
  } catch (error) {
    console.warn('Failed to load graphics settings:', error);
  }

  return {
    renderingQuality: 'high',
    antiAliasing: true,
    vsync: true,
    frameRateLimit: 'unlimited',
    particleDensity: 1.0,
    screenShake: true,
    bloom: true,
    shadowQuality: 'medium',
    brightness: 1.0,
    contrast: 1.0,
    colorTheme: 'default',
  };
}

function saveGraphicsSettings(settings: GraphicsSettingsData) {
  try {
    localStorage.setItem(GRAPHICS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save graphics settings:', error);
  }
}

const graphicsSettings = reactive(loadGraphicsSettings());

function saveSettings() {
  saveGraphicsSettings(graphicsSettings);
}

// Calculate performance impact
function getPerformanceImpact(type: 'cpu' | 'gpu' | 'memory'): string {
  let score = 0;

  switch (type) {
    case 'cpu':
      if (graphicsSettings.renderingQuality === 'ultra') score += 3;
      else if (graphicsSettings.renderingQuality === 'high') score += 2;
      else if (graphicsSettings.renderingQuality === 'medium') score += 1;

      if (graphicsSettings.particleDensity > 1.5) score += 2;
      else if (graphicsSettings.particleDensity > 1.0) score += 1;
      break;

    case 'gpu':
      if (graphicsSettings.antiAliasing) score += 2;
      if (graphicsSettings.bloom) score += 1;
      if (graphicsSettings.shadowQuality === 'ultra') score += 3;
      else if (graphicsSettings.shadowQuality === 'high') score += 2;
      else if (graphicsSettings.shadowQuality === 'medium') score += 1;
      break;

    case 'memory':
      if (graphicsSettings.renderingQuality === 'ultra') score += 2;
      else if (graphicsSettings.renderingQuality === 'high') score += 1;
      if (graphicsSettings.particleDensity > 1.0) score += 1;
      break;
  }

  if (score === 0) return 'Very Low';
  if (score <= 2) return 'Low';
  if (score <= 4) return 'Medium';
  if (score <= 6) return 'High';
  return 'Very High';
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
