<template>
  <div class="h-screen flex bg-slate-900 text-slate-100">
    <div class="flex-1 p-4 overflow-hidden w-full h-full">
      <div class="flex items-center justify-between mb-4 absolute">
        <h1 class="text-2xl font-bold">Nexus Hex – Idle Frontier (POC)</h1>
        <button v-if="!store.running" class="btn" @click="startIdle()">Start</button>
        <div v-else class="text-xs opacity-70">Tick: {{ store.tick }}</div>
      </div>
      <!-- Camera centered map -->
      <div ref="mapEl" class="w-full h-full relative select-none">
        <div class="absolute inset-0" :style="worldStyle">
          <div v-for="tile in visibleTiles" :key="tile.id" :style="tileStyle(tile)" class="absolute group">
            <div class="hex-tile flex flex-col items-center justify-center font-mono text-[9px] cursor-pointer"
                 :class="tile.discovered ? '' : 'opacity-50'"
                 :style="{ background: tile.discovered ? getTileBackground(tile) : fogColor }"
                 @click="clickTile(tile)"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { idleStore as store, startIdle, discoverTile, type Tile } from '../store/idleStore';
import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';
import { computed, reactive, onMounted, onBeforeUnmount, ref, type CSSProperties } from 'vue';

const HEX_SIZE = 32;
const HEX_SPACE = 4;
const fogColor = '#475569';

// Camera state (smoothed position with separate targets)
const camera = reactive({ q: 0, r: 0, targetQ: 0, targetR: 0, radius: 20, innerRadius: 10 });

// Map container measurements
const mapEl = ref<HTMLElement | null>(null);
const viewport = reactive({ w: 0, h: 0, cx: 0, cy: 0 });
function measure() {
  const el = mapEl.value;
  if (!el) return;
  viewport.w = el.clientWidth;
  viewport.h = el.clientHeight;
  viewport.cx = viewport.w / 2;
  viewport.cy = viewport.h / 2;
}

function axialToPixel(q: number, r: number, size: number) {
  const x = (size + (HEX_SIZE * 0.155)) * Math.sqrt(3) * (q + r / 2);
  const y = size * 3/2 * r;
  return { x, y };
}

function hexDistance(a: {q: number; r: number}, b: {q: number; r: number}): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

// Visible tiles within camera radius (use smoothed camera directly)
const visibleTiles = computed(() => store.tiles.filter(t => hexDistance(camera, t) <= camera.radius));

// Single world transform keeps camera centered
const worldStyle = computed(() => {
  const camPx = axialToPixel(camera.q, camera.r, HEX_SIZE);
  return { transform: `translate(${viewport.cx - camPx.x}px, ${viewport.cy - camPx.y}px)` };
});

function tileStyle(tile: Tile): CSSProperties {
  const p = axialToPixel(tile.q, tile.r, HEX_SIZE);
  const dist = hexDistance(camera, tile);
  const span = Math.max(0.0001, (camera.radius - camera.innerRadius));
  let fade = 1 - Math.max(0, (dist - camera.innerRadius) / span);
  // Ensure fade never exceeds 1 or drops below 0
  fade = Math.min(1, Math.max(0, fade));
  // Use slightly stronger falloff for towncenter so it's not visually exempt
  const falloff = (tile.terrain === 'towncenter') ? (fade * fade * 0.9) : (fade * fade);
  const opacity = falloff;
  return {
    width: `${HEX_SIZE*2 - HEX_SPACE}px`,
    height: `${HEX_SIZE*2 - HEX_SPACE}px`,
    transform: `translate(${p.x - HEX_SIZE}px, ${p.y - HEX_SIZE}px)`,
    opacity,
    pointerEvents: opacity <= 0 ? 'none' : 'auto'
  };
}

function getTileBackground(tile: Tile) { return `url(${getTileImage(tile)}) center/cover`; }
function getTileImage(tile: Tile) {
  switch(tile.terrain) {
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
function clickTile(tile: Tile) {
  if (hexDistance(camera, tile) > camera.radius) return;
  if (!tile.discovered) {
    discoverTile(tile);
  } else {
    camera.targetQ = tile.q;
    camera.targetR = tile.r;
  }
}

function handleKey(e: KeyboardEvent) {
  let dq = 0, dr = 0;
  if (e.key === 'ArrowUp' || e.key === 'w') { dr = -1; dq = 0.5; }
  else if (e.key === 'ArrowDown' || e.key === 's') { dr = 1; dq = -0.5; }
  else if (e.key === 'ArrowLeft' || e.key === 'a') dq = -1;
  else if (e.key === 'ArrowRight' || e.key === 'd') dq = 1;
  else if (e.key === '+') camera.radius = Math.min(30, camera.radius + 1);
  else if (e.key === '-' || e.key === '_') camera.radius = Math.max(camera.innerRadius + 1, camera.radius - 1);
  if (dq !== 0 || dr !== 0) {
    camera.targetQ += dq;
    camera.targetR += dr;
  }
}

// Smooth camera animation loop
let rafId: number | null = null;
function animateCamera() {
  // Distance-adaptive easing: faster when far, slower when close
  const dq = camera.targetQ - camera.q;
  const dr = camera.targetR - camera.r;
  const dist = Math.sqrt(dq * dq + dr * dr);
  const baseMin = 0.28; // was 0.15
  const baseMax = 0.55; // upper bound for very large distances
  const lerp = baseMin + (1 - Math.exp(-dist * 0.9)) * (baseMax - baseMin);
  // Snap when very close to avoid jitter
  if (Math.abs(dq) < 0.005) camera.q = camera.targetQ; else camera.q += dq * lerp;
  if (Math.abs(dr) < 0.005) camera.r = camera.targetR; else camera.r += dr * lerp;
  rafId = requestAnimationFrame(animateCamera);
}

onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('keydown', handleKey);
  animateCamera();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  window.removeEventListener('keydown', handleKey);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
.hex-tile {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  transition: filter 0.15s, opacity 0.3s;
}
.hex-tile:hover { filter: brightness(1.15); }

</style>