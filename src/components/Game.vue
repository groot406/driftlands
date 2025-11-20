<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <div class="flex-1 overflow-hidden w-full h-full">
      <div ref="mapEl" class="w-full h-full relative map-container">
        <div class="absolute inner inset-0 text-[9px] font-mono" :style="worldStyle">
          <div
              v-for="tile in visibleTiles"
              :key="tile.id"
              :style="tileStyle(tile)"
              class="absolute"
          >
            <div class="hex-tile cursor-pointer"
                 :class="!tile.discovered ? 'opacity-50' : ''"
                 :style="{ background: tile.discovered ? getTileBackground(tile) : '' }"
                 @click="clickTile(tile)"
            >
            </div>
          </div>
        </div>
      </div>

      <!-- Loading overlay -->
      <div v-if="generationInProgress"
           class="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50">
        <div
            class="w-[320px] space-y-4 p-6 rounded-lg bg-slate-800 border border-slate-700 shadow-xl drop-shadow-md opacity-80 backdrop:blur-lg">
          <div class="text-sm font-semibold tracking-wide uppercase text-slate-300">World Generation</div>
          <div class="text-xs text-slate-400" role="status">{{ generationStatus }}</div>
          <div class="flex items-center justify-between text-xs text-slate-400">
            <div>Tiles: {{ generationCompleted }} / {{ generationTotal }}</div>
            <div>{{ (generationProgress * 100).toFixed(1) }}%</div>
          </div>
          <div class="h-3 rounded-md overflow-hidden bg-slate-700/60">
            <div class="h-full bg-emerald-500 transition-all"
                 :style="{ width: (generationProgress * 100) + '%' }"></div>
          </div>
          <div v-if="generationProgress >= 1" class="text-emerald-300 text-xs">Finalizing world...</div>
        </div>
      </div>

    </div>
  </div>

  <div class="absolute z-10 top-4 left-4 opacity-80 text-white">
    <h1 class="text-2xl font-bold items-center">Nexus Hex – Idle Frontier (POC)</h1>
    <div class="gap-4 flex flex-row items-center mt-2">
      <button v-if="!store.running" class="btn" @click="startIdle()">Start</button>
      <button class="btn" @click="regenerateWorld()">Regenerate</button>
      <button class="btn" @click="regenerateWorld(200)">Generate large world</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { idleStore as store, startIdle } from '../store/idleStore';
import type { Tile } from '../core/world';
import {
  discoverTile,
  generationCompleted,
  generationInProgress,
  generationProgress,
  generationStatus,
  generationTotal,
  getTilesInRadius,
  startWorldGeneration,
  worldVersion
} from '../core/world';

import {
  camera,
  HEX_SIZE,
  HEX_SPACE,
  axialToPixel,
  hexDistance,
  createPointerHandlers,
  keyDown,
  keyUp,
  animateCamera,
  stopCameraAnimation,
  centerCamera
} from '../core/camera';

import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';

const WORLD_SIZE = 6;

const baseTileSize = `${(HEX_SIZE * 2) - HEX_SPACE}`;
const mouseDown = ref(false);
const mapEl = ref<HTMLElement | null>(null);
const viewport = reactive({ w: 0, h: 0, cx: 0, cy: 0 });
const visibleTiles = shallowRef<Tile[]>([]);

onMounted(() => {
  startWorldGeneration(WORLD_SIZE, store.tiles);
});

watch([worldVersion, camera], () => requestAnimationFrame(updateVisibleTiles));

function updateVisibleTiles() {
  const cq = Math.round(camera.q);
  const cr = Math.round(camera.r);
  visibleTiles.value = getTilesInRadius(cq, cr, camera.radius + 2);
}

function measure() {
  const el = mapEl.value;
  if (!el) return;
  viewport.w = el.clientWidth;
  viewport.h = el.clientHeight;
  viewport.cx = viewport.w / 2;
  viewport.cy = viewport.h / 2;
}

function getPixel(tile: Tile) {
  if (tile.pixel) return tile.pixel;
  tile.pixel = axialToPixel(tile.q, tile.r);
  return tile.pixel;
}

const worldStyle = computed(() => {
  const camPx = axialToPixel(camera.q, camera.r);
  return { transform: `translate(${viewport.cx - camPx.x}px, ${viewport.cy - camPx.y}px)` };
});

function tileStyle(tile: Tile): CSSProperties {
  const px = getPixel(tile);
  const span = Math.max(3, (camera.radius - camera.innerRadius));
  let fade = 1 - Math.max(0, (hexDistance(camera, tile) - camera.innerRadius) / span);
  fade = Math.min(1, Math.max(0, fade));
  const opacity = fade * fade;
  return {
    transform: `translate(${px.x - HEX_SIZE}px, ${px.y - HEX_SIZE}px)`,
    opacity,
    width: baseTileSize + 'px',
    height: baseTileSize + 'px',
  };
}

function getTileBackground(tile: Tile) {
  return `url(${getTileImage(tile)}) center/cover`;
}

function getTileImage(tile: Tile) {
  switch (tile.terrain) {
    case 'towncenter': return towncenter;
    case 'forest': return forest;
    case 'mountain': return mountain;
    case 'water': return water;
    case 'mine': return mine;
    case 'ruin': return ruin;
    case 'plains':
    default: return plains;
  }
}

let lastClickTime = 0;
function clickTile(tile: Tile) {
  if (!tile.discovered) {
    discoverTile(tile);
    return;
  }

  if (performance.now() - lastClickTime < 300) {
    camera.targetQ = tile.q;
    camera.targetR = tile.r;
  }
  lastClickTime = performance.now();
}

function regenerateWorld(size?: number) {
  centerCamera();
  startWorldGeneration(size ?? WORLD_SIZE);
}

// Setup event listeners using extracted handlers
const { pointerDown, pointerMove, pointerUp, pointerCancel } = createPointerHandlers(mouseDown);

onMounted(() => {
  measure();
  updateVisibleTiles();
  window.addEventListener('resize', measure);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const el = mapEl.value;
  if (el) {
    el.addEventListener('pointerdown', pointerDown, { passive: false });
    el.addEventListener('pointermove', pointerMove, { passive: false });
    el.addEventListener('pointerup', pointerUp, { passive: false });
    el.addEventListener('pointercancel', pointerCancel, { passive: false });
    el.addEventListener('pointerleave', pointerUp, { passive: false });
  }
  animateCamera();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  const el = mapEl.value;
  if (el) {
    el.removeEventListener('pointerdown', pointerDown);
    el.removeEventListener('pointermove', pointerMove);
    el.removeEventListener('pointerup', pointerUp);
    el.removeEventListener('pointercancel', pointerCancel);
    el.removeEventListener('pointerleave', pointerUp);
  }
  stopCameraAnimation();
});
</script>

<style scoped>
.hex-tile {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: #334155;
}

body {
  image-rendering: high-quality;
}

.hex-tile:hover {
  filter: brightness(1.25);
}

.map-container {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain;
}

.map-container:active {
  cursor: grabbing;
}

</style>