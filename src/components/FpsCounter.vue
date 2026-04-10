<template>
  <div class="fps-counter mt-60">
    <div class="fps-header">
      <span>{{ fps }} FPS</span>
      <span class="quality-badge" :class="`quality-${renderDebugState.qualityLabel}`">
        {{ renderDebugState.qualityLabel }}
      </span>
    </div>
    <div class="fps-row">
      <span>Stress</span>
      <strong>{{ renderDebugState.stressTier }}</strong>
    </div>
    <div class="fps-row">
      <span>Render</span>
      <strong>{{ renderDebugState.smoothedFrameMs }}ms</strong>
    </div>
    <div class="fps-row">
      <span>Tiles</span>
      <strong>{{ renderDebugState.discoveredVisibleCount }}/{{ renderDebugState.visibleTileCount }}</strong>
    </div>
    <div class="fps-row">
      <span>Terrain Cache</span>
      <strong>{{ terrainBufferStatus }}</strong>
    </div>
    <div class="fps-row">
      <span>Chunk Rebuilds</span>
      <strong>{{ renderDebugState.terrainChunkRebuilds }}</strong>
    </div>
    <div class="fps-row">
      <span>Terrain Rebuilds</span>
      <strong>{{ renderDebugState.staticTerrainRebuilds }}</strong>
    </div>
    <div class="fps-row">
      <span>Chunks</span>
      <strong>{{ renderDebugState.visibleChunkCount }}/{{ renderDebugState.dirtyChunkCount }}</strong>
    </div>
    <div class="fps-row">
      <span>Motion Blur</span>
      <strong>{{ renderDebugState.motionBlurActive ? `${renderDebugState.motionBlurSamples} taps` : (renderDebugState.motionBlurEnabled ? 'armed' : 'off') }}</strong>
    </div>
    <div class="fps-row">
      <span>World Ver</span>
      <strong>{{ renderDebugState.worldRenderVersion }}</strong>
    </div>
    <div class="fps-row">
      <span>Passes</span>
      <strong>{{ passTimingSummary }}</strong>
    </div>
    <div class="feature-grid">
      <button
        v-for="feature in features"
        :key="feature.key"
        type="button"
        class="feature-pill"
        :class="{ on: feature.on, off: !feature.on, manual: feature.mode !== 'auto' }"
        :title="`Click to cycle ${feature.label} override (${feature.mode})`"
        @click="toggleFeature(feature.key)"
      >
        <span>{{ feature.label }}</span>
        <span class="feature-mode">{{ feature.mode }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { renderDebugState } from '../store/renderDebugStore';
import {
  cycleRenderFeatureOverride,
  renderFeatureOverrideStore,
  type RenderFeatureKey,
} from '../store/renderFeatureStore';

const fps = ref(0);
const frameCount = ref(0);
let lastTime = performance.now();
let animationId: number | null = null;

const terrainBufferStatus = computed(() => {
  if (renderDebugState.visibleChunkCount > 0) {
    return `chunked:${renderDebugState.visibleChunkCount}`;
  }
  if (renderDebugState.staticTerrainReused) return 'reuse';
  if (renderDebugState.staticTerrainReason === 'shift') return 'shift';
  if (renderDebugState.staticTerrainReason === 'patch') return 'patch';
  return `rebuild:${renderDebugState.staticTerrainReason}`;
});

const features = computed(() => ([
  { key: 'backdropGlows', label: 'backdrop', on: renderDebugState.backdropGlowsEnabled },
  { key: 'motionBlur', label: 'blur', on: renderDebugState.motionBlurEnabled },
  { key: 'bloom', label: 'bloom', on: renderDebugState.bloomEnabled },
  { key: 'clouds', label: 'clouds', on: renderDebugState.cloudsEnabled },
  { key: 'particles', label: 'particles', on: renderDebugState.particlesEnabled },
  { key: 'birds', label: 'birds', on: renderDebugState.birdsEnabled },
  { key: 'edgeVignette', label: 'vignette', on: renderDebugState.edgeVignetteEnabled },
  { key: 'reachGlow', label: 'reach', on: renderDebugState.reachGlowEnabled },
  { key: 'heroAuras', label: 'auras', on: renderDebugState.heroAurasEnabled },
  { key: 'fogShimmer', label: 'fog', on: renderDebugState.fogShimmerEnabled },
  { key: 'manualShadowComposite', label: 'shadow', on: renderDebugState.manualShadowComposite },
].map((feature) => ({
  ...feature,
  mode: renderFeatureOverrideStore[feature.key],
}))));

const passTimingSummary = computed(() => {
  const entries = Object.entries(renderDebugState.passTimingsMs)
    .filter(([, duration]) => duration > 0)
    .map(([name, duration]) => `${name.replace('Pass', '')}:${duration.toFixed(1)}`);

  return entries.length ? entries.join(' ') : 'n/a';
});

function toggleFeature(feature: RenderFeatureKey) {
  cycleRenderFeatureOverride(feature);
}

const updateFPS = () => {
  const now = performance.now();
  frameCount.value++;

  // Update FPS every second
  if (now - lastTime >= 1000) {
    fps.value = Math.round(frameCount.value * 1000 / (now - lastTime));
    frameCount.value = 0;
    lastTime = now;
  }

  animationId = requestAnimationFrame(updateFPS);
};

onMounted(() => {
  lastTime = performance.now();
  frameCount.value = 0;
  updateFPS();
});

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
});
</script>

<style scoped>
.fps-counter {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(2, 6, 23, 0.82);
  color: #fff;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  font-size: 12px;
  font-family: monospace;
  z-index: 1000;
  pointer-events: none;
  user-select: none;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fps-header,
.fps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quality-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  text-transform: uppercase;
}

.quality-full {
  background: rgba(34, 197, 94, 0.18);
  color: rgb(187, 247, 208);
}

.quality-reduced {
  background: rgba(251, 191, 36, 0.18);
  color: rgb(253, 230, 138);
}

.quality-minimal {
  background: rgba(248, 113, 113, 0.18);
  color: rgb(254, 202, 202);
}

.feature-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  pointer-events: auto;
}

.feature-pill {
  appearance: none;
  background: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  border: 1px solid transparent;
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
}

.feature-pill.on {
  background: rgba(56, 189, 248, 0.16);
  color: rgb(186, 230, 253);
  border-color: rgba(56, 189, 248, 0.22);
}

.feature-pill.off {
  background: rgba(51, 65, 85, 0.45);
  color: rgb(148, 163, 184);
}

.feature-pill.manual {
  border-color: rgba(248, 250, 252, 0.35);
}

.feature-pill:focus-visible {
  outline: 1px solid rgba(248, 250, 252, 0.7);
  outline-offset: 1px;
}

.feature-mode {
  font-size: 9px;
  text-transform: uppercase;
  opacity: 0.72;
}
</style>
