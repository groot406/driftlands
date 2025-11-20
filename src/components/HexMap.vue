<template>
  <div ref="mapEl" class="w-full h-full relative map-container">
    <div class="absolute inner inset-0 text-[9px] font-mono" :style="worldStyle">
      <div
        v-for="tile in visibleTiles"
        :key="tile.id"
        :style="tileStyle(tile)"
        class="absolute"
      >
        <div
          class="hex-tile cursor-pointer"
          :class="!tile.discovered ? 'opacity-50' : ''"
          :style="{ background: tile.discovered ? getTileBackground(tile) : '' }"
          @click="clickTile(tile)"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, shallowRef, watch, type CSSProperties } from 'vue';
import type { Tile } from '../core/world';
import { discoverTile, worldVersion, getTilesInRadius } from '../core/world';
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
  stopCameraAnimation
} from '../core/camera';

import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';

const baseTileSize = `${(HEX_SIZE * 2) - HEX_SPACE}`;
const mapEl = ref<HTMLElement | null>(null);
const mouseDown = ref(false);
const viewport = reactive({ w: 0, h: 0, cx: 0, cy: 0 });
const visibleTiles = shallowRef<Tile[]>([]);

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

function updateVisibleTiles() {
  const cq = Math.round(camera.q);
  const cr = Math.round(camera.r);
  visibleTiles.value = getTilesInRadius(cq, cr, camera.radius + 2);
}

let lastClickTime = 0;
function clickTile(tile: Tile) {
  if (!tile.discovered) {
    discoverTile(tile);
    return;
  }
  const now = performance.now();
  if (now - lastClickTime < 300) {
    camera.targetQ = tile.q;
    camera.targetR = tile.r;
  }
  lastClickTime = now;
}

// Setup pointer handlers
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

watch([worldVersion, camera], () => requestAnimationFrame(updateVisibleTiles));
</script>

<style scoped>
.hex-tile {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: #334155;
}
.hex-tile:hover { filter: brightness(1.25); }
.map-container { touch-action: none; -webkit-user-select: none; user-select: none; overscroll-behavior: contain; }
.map-container:active { cursor: grabbing; }
</style>

