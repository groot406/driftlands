<template>
  <div class="fps-counter">
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
      <span>Cadence</span>
      <strong>{{ renderDebugState.smoothedDrawIntervalMs }}ms</strong>
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
      <span>Metal Dispatch</span>
      <strong>{{ renderDebugState.nativeMetalCompositeDispatched ? 'dispatched' : 'idle' }}</strong>
    </div>
    <div class="fps-row">
      <span>World Ver</span>
      <strong>{{ renderDebugState.worldRenderVersion }}</strong>
    </div>
    <div class="fps-row" v-if="renderDebugState.settlementReachCount">
      <span>Other Reach</span>
      <strong :title="renderDebugState.settlementReachInfo">{{ renderDebugState.settlementReachCount }}</strong>
    </div>
    <div class="fps-row">
      <span>Passes</span>
      <strong>{{ passTimingSummary }}</strong>
    </div>
    <div class="debug-section">
      <div class="debug-section-title">Surface</div>
      <div class="fps-row">
        <span>Canvas</span>
        <strong :title="surfaceTitle">{{ surfaceSummary }}</strong>
      </div>
      <div class="fps-row">
        <span>DPR</span>
        <strong>{{ renderDebugState.viewportDpr }} / win {{ renderDebugState.windowDpr }}</strong>
      </div>
      <div class="fps-row">
        <span>Modes</span>
        <strong :title="modeTitle">{{ modeSummary }}</strong>
      </div>
      <div class="technique-grid">
        <button
          v-for="technique in techniques"
          :key="technique.key"
          type="button"
          class="feature-pill technique-pill"
          :class="{ on: technique.active, off: !technique.active, manual: technique.mode !== 'auto' }"
          :title="technique.title"
          @click="toggleTechnique(technique.key)"
        >
          <span>{{ technique.label }}</span>
          <span class="feature-mode">{{ technique.mode }}</span>
        </button>
      </div>
    </div>
    <div class="debug-section">
      <div class="debug-section-title">Browser/GPU</div>
      <div class="fps-row">
        <span>Platform</span>
        <strong :title="runtimeInfo.userAgent">{{ runtimeInfo.platformSummary }}</strong>
      </div>
      <div class="fps-row">
        <span>GPU</span>
        <strong :title="runtimeInfo.webglRenderer">{{ runtimeInfo.gpuSummary }}</strong>
      </div>
      <div class="fps-row">
        <span>WebGL</span>
        <strong :title="runtimeInfo.webglVersion">{{ runtimeInfo.webglSummary }}</strong>
      </div>
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
import {
  cycleGraphicsDiagnosticOverride,
  graphicsDiagnosticOverrideStore,
  getEffectiveMapTargetFps,
  type GraphicsDiagnosticTechniqueKey,
  shouldUseNativeMetalPath,
  shouldUseBrowserLightRendering,
  shouldUseDesynchronizedCanvas,
  shouldUseWindowsRescueTimer,
  shouldUseWindowsPresentationSafeMode,
} from '../store/graphicsStore';

const fps = ref(0);
const frameCount = ref(0);
let lastTime = performance.now();
let animationId: number | null = null;

function shorten(value: string, maxLength = 38) {
  if (!value) return 'unknown';
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function getBrowserName(userAgent: string) {
  if (/Firefox|FxiOS/i.test(userAgent)) return 'Firefox';
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/Chrome|Chromium|CriOS/i.test(userAgent)) return 'Chrome';
  if (/Safari/i.test(userAgent)) return 'Safari';
  return 'Browser';
}

function getPlatformName() {
  if (typeof navigator === 'undefined') return 'unknown';
  const uaDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return uaDataPlatform ?? navigator.platform ?? 'unknown';
}

function probeWebGLInfo() {
  if (typeof document === 'undefined') {
    return {
      api: 'none',
      vendor: 'unknown',
      renderer: 'unavailable',
      version: 'unknown',
      maxTextureSize: 0,
      hardwareAccelerated: null as boolean | null,
    };
  }

  const canvas = document.createElement('canvas');
  const gl = (
    canvas.getContext('webgl2', { powerPreference: 'high-performance' })
    ?? canvas.getContext('webgl', { powerPreference: 'high-performance' })
    ?? canvas.getContext('experimental-webgl', { powerPreference: 'high-performance' })
  ) as WebGLRenderingContext | WebGL2RenderingContext | null;

  if (!gl) {
    return {
      api: 'none',
      vendor: 'unknown',
      renderer: 'unavailable',
      version: 'unknown',
      maxTextureSize: 0,
      hardwareAccelerated: null as boolean | null,
    };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as WEBGL_debug_renderer_info | null;
  const vendor = String(debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  const renderer = String(debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const version = String(gl.getParameter(gl.VERSION));
  const softwareRenderer = /swiftshader|software|llvmpipe|microsoft basic|mesa offscreen/i.test(renderer);

  return {
    api: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1',
    vendor,
    renderer,
    version,
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0),
    hardwareAccelerated: renderer ? !softwareRenderer : null,
  };
}

function collectRuntimeInfo() {
  const userAgent = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
  const platform = getPlatformName();
  const webgl = probeWebGLInfo();
  const deviceMemory = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hardwareConcurrency = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;

  return {
    userAgent,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    webglVersion: webgl.version,
    platformSummary: `${getBrowserName(userAgent)} ${platform}${hardwareConcurrency ? ` ${hardwareConcurrency}c` : ''}${deviceMemory ? ` ${deviceMemory}GB` : ''}`,
    gpuSummary: `${webgl.hardwareAccelerated === false ? 'software ' : webgl.hardwareAccelerated === true ? 'hw ' : ''}${shorten(webgl.renderer)}`,
    webglSummary: `${webgl.api} tex ${webgl.maxTextureSize || 'n/a'}`,
  };
}

const runtimeInfo = ref(collectRuntimeInfo());

const terrainBufferStatus = computed(() => {
  if (renderDebugState.visibleChunkCount > 0) {
    return `chunked:${renderDebugState.visibleChunkCount}`;
  }
  if (renderDebugState.staticTerrainReused) return 'reuse';
  if (renderDebugState.staticTerrainReason === 'shift') return 'shift';
  if (renderDebugState.staticTerrainReason === 'patch') return 'patch';
  return `rebuild:${renderDebugState.staticTerrainReason}`;
});

const features = computed(() => {
  const featureEntries: Array<{ key: RenderFeatureKey; label: string; on: boolean }> = [
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
  { key: 'tileRelief', label: 'relief', on: renderDebugState.tileReliefEnabled },
  { key: 'manualShadowComposite', label: 'shadow', on: renderDebugState.manualShadowComposite },
  ];

  return featureEntries.map((feature) => ({
    ...feature,
    mode: renderFeatureOverrideStore[feature.key],
  }));
});

const passTimingSummary = computed(() => {
  const entries = Object.entries(renderDebugState.passTimingsMs)
    .filter(([, duration]) => duration > 0)
    .map(([name, duration]) => `${name.replace('Pass', '')}:${duration.toFixed(1)}`);

  return entries.length ? entries.join(' ') : 'n/a';
});

const surfaceSummary = computed(() => (
  `${renderDebugState.canvasBackingWidth}x${renderDebugState.canvasBackingHeight} ${renderDebugState.canvasMegapixels}MP`
));

const surfaceTitle = computed(() => (
  `CSS ${renderDebugState.canvasCssWidth}x${renderDebugState.canvasCssHeight}, viewport ${renderDebugState.viewportWidth}x${renderDebugState.viewportHeight}, backing ${renderDebugState.canvasBackingWidth}x${renderDebugState.canvasBackingHeight}`
));

const modeSummary = computed(() => (
  `safe:${shouldUseWindowsPresentationSafeMode() ? 'on' : 'off'} light:${shouldUseBrowserLightRendering() ? 'on' : 'off'} desync:${shouldUseDesynchronizedCanvas() ? 'on' : 'off'} rescue:${shouldUseWindowsRescueTimer() ? 'on' : 'off'} target:${getEffectiveMapTargetFps()} metal:${shouldUseNativeMetalPath() ? 'on' : 'off'}`
));

const modeTitle = computed(() => (
  `Windows presentation safe mode: ${shouldUseWindowsPresentationSafeMode() ? 'on' : 'off'}; browser-light effects: ${shouldUseBrowserLightRendering() ? 'on' : 'off'}; desynchronized canvas: ${shouldUseDesynchronizedCanvas() ? 'on' : 'off'}; rescue timer: ${shouldUseWindowsRescueTimer() ? 'on' : 'off'}; native-metal path: ${shouldUseNativeMetalPath() ? 'on' : 'off'}; map target FPS: ${getEffectiveMapTargetFps()}`
));

const techniques = computed(() => [
  {
    key: 'windowsPresentationSafeMode' as GraphicsDiagnosticTechniqueKey,
    label: 'safe',
    mode: graphicsDiagnosticOverrideStore.windowsPresentationSafeMode,
    active: shouldUseWindowsPresentationSafeMode(),
    title: 'Cycle Windows presentation-safe mode override. Auto enables this on Windows Chrome/Firefox.',
  },
  {
    key: 'browserLightRendering' as GraphicsDiagnosticTechniqueKey,
    label: 'light',
    mode: graphicsDiagnosticOverrideStore.browserLightRendering,
    active: shouldUseBrowserLightRendering(),
    title: 'Cycle browser-light rendering override. Disables filter-heavy effects when active.',
  },
  {
    key: 'desynchronizedCanvas' as GraphicsDiagnosticTechniqueKey,
    label: 'desync',
    mode: graphicsDiagnosticOverrideStore.desynchronizedCanvas,
    active: shouldUseDesynchronizedCanvas(),
    title: 'Cycle 2D canvas desynchronized context override. Resize/rebuilds canvas contexts.',
  },
  {
    key: 'rescueTimer' as GraphicsDiagnosticTechniqueKey,
    label: 'rescue',
    mode: graphicsDiagnosticOverrideStore.rescueTimer,
    active: shouldUseWindowsRescueTimer(),
    title: 'Cycle timer-backed map render pump override. Useful when requestAnimationFrame is throttled.',
  },
  {
    key: 'canvasDpr' as GraphicsDiagnosticTechniqueKey,
    label: 'dpr',
    mode: graphicsDiagnosticOverrideStore.canvasDpr,
    active: graphicsDiagnosticOverrideStore.canvasDpr !== 'auto',
    title: 'Cycle canvas backing-store DPR: auto, low, 1x, native. Low reduces pixels sent to the compositor.',
  },
  {
    key: 'nativeMetalPath' as GraphicsDiagnosticTechniqueKey,
    label: 'metal',
    mode: graphicsDiagnosticOverrideStore.nativeMetalPath,
    active: shouldUseNativeMetalPath(),
    title: 'Cycle native Metal bridge path override. Auto uses native plugin when available.',
  },
]);

function toggleFeature(feature: RenderFeatureKey) {
  cycleRenderFeatureOverride(feature);
}

function toggleTechnique(technique: GraphicsDiagnosticTechniqueKey) {
  cycleGraphicsDiagnosticOverride(technique);
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
  runtimeInfo.value = collectRuntimeInfo();
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
  position: relative;
  left: -60px;
  background: rgba(2, 6, 23, 0.82);
  color: #fff;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  font-size: 12px;
  font-family: monospace;
  pointer-events: auto;
  user-select: none;
  min-width: 220px;
  max-width: min(24rem, calc(100vw - 1rem));
  align-self: flex-end;
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

.fps-row strong {
  min-width: 0;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 5px;
  margin-top: 3px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.debug-section-title {
  color: rgb(148, 163, 184);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0;
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

.feature-grid,
.technique-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  pointer-events: auto;
}

.technique-grid {
  margin-top: 2px;
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
