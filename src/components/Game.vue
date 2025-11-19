<template>
  <div class="h-screen flex bg-slate-900 text-slate-100">
    <div class="flex-1 p-4 overflow-hidden w-full h-full">
      <div class="flex items-center justify-between mb-4 absolute">
        <h1 class="text-2xl font-bold">Nexus Hex – Idle Frontier (POC)</h1>
        <button v-if="!store.running" class="btn" @click="startIdle()">Start</button>
        <div v-else class="text-xs opacity-70">Tick: {{ store.tick }}</div>
        {{ visibleTiles.length }}
      </div>
      <!-- Camera centered map -->
      <div ref="mapEl" class="w-full h-full relative select-none">
        <div class="absolute inset-0" :style="worldStyle">
          <div v-for="tile in visibleTiles" :key="tile.id" :style="tileStyle(tile)" class="absolute group">
            <div class="hex-tile flex flex-col items-center justify-center font-mono text-[9px] cursor-pointer"
                 :class="tile.discovered ? '' : 'opacity-50'"
                 :style="{ background: tile.discovered ? getTileBackground(tile) : '' }"
                 @click="clickTile(tile)">
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { idleStore as store, startIdle, discoverTile, type Tile, getTile, ensureChunksInView } from '../store/idleStore';
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
// Precompute constants used in axialToPixel for speed
const SQRT3 = Math.sqrt(3);
const HEX_X_FACTOR = (HEX_SIZE + (HEX_SIZE * 0.155)) * SQRT3; // simplified reused factor
const HEX_Y_FACTOR = HEX_SIZE * 3/2;

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

function axialToPixel(q: number, r: number) {
  const x = HEX_X_FACTOR * (q + r / 2);
  const y = HEX_Y_FACTOR * r;
  return { x, y };
}

function hexDistance(a: {q: number; r: number}, b: {q: number; r: number}): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

// Cache for pixel positions per tile id to avoid recalculation every frame
const pixelCache = new Map<string, {x: number; y: number}>();
// Reusable style object cache (static size + transform per tile)
const styleCache = new Map<string, CSSProperties>();
const baseTileSize = `${HEX_SIZE*2 - HEX_SPACE}px`;
function getPixel(tile: Tile) {
  let cached = pixelCache.get(tile.id);
  if (!cached) {
    cached = axialToPixel(tile.q, tile.r);
    pixelCache.set(tile.id, cached);
  }
  return cached;
}

// Cache for style opacity per tile id for last camera position hash
let lastCamKey = '';
const opacityCache = new Map<string, number>();

// Optimized visible tiles: iterate axial coords within camera radius instead of filtering all tiles
const visibleTiles = computed(() => {
  const radius = camera.radius + 4;
  const cq = camera.q;
  const cr = camera.r;
  const minQ = Math.floor(cq - radius);
  const maxQ = Math.ceil(cq + radius);
  const rMinGlobal = Math.floor(cr - radius);
  const rMaxGlobal = Math.ceil(cr + radius);
  // Ensure chunks before collecting tiles
  ensureChunksInView(minQ, maxQ, rMinGlobal, rMaxGlobal);
  const results: Tile[] = [];
  for (let q = minQ; q <= maxQ; q++) {
    const minR = rMinGlobal;
    const maxR = rMaxGlobal;
    for (let r = minR; r <= maxR; r++) {
      const dq = Math.abs(q - cq);
      const dr = Math.abs(r - cr);
      const ds = Math.abs((-q - r) - (-cq - cr));
      if (Math.max(dq, dr, ds) > radius) continue;
      const tile = getTile(q, r);
      if (tile) results.push(tile);
    }
  }
  return results;
});

// Single world transform keeps camera centered
const worldStyle = computed(() => {
  const camPx = axialToPixel(camera.q, camera.r);
  return { transform: `translate(${viewport.cx - camPx.x}px, ${viewport.cy - camPx.y}px)` };
});

function tileStyle(tile: Tile): CSSProperties {
  const camKey = `${camera.q.toFixed(3)}:${camera.r.toFixed(3)}:${camera.radius}:${camera.innerRadius}`;
  const px = getPixel(tile);
  // Fetch or create static style object for this tile
  let style = styleCache.get(tile.id);
  if (!style) {
    style = {
      width: baseTileSize,
      height: baseTileSize,
      transform: `translate(${px.x - HEX_SIZE}px, ${px.y - HEX_SIZE}px)`,
      opacity: 1,
      pointerEvents: 'auto'
    };
    styleCache.set(tile.id, style);
  }
  let opacity: number;
  if (camKey === lastCamKey && opacityCache.has(tile.id)) {
    opacity = opacityCache.get(tile.id)!;
  } else {
    const dist = hexDistance(camera, tile);
    const span = Math.max(0.0001, (camera.radius - camera.innerRadius));
    let fade = 1 - Math.max(0, (dist - camera.innerRadius) / span);
    fade = Math.min(1, Math.max(0, fade));
    opacity = (tile.terrain === 'towncenter') ? (fade * fade * 0.9) : (fade * fade);
    if (camKey !== lastCamKey) {
      if (opacityCache.size > 0) opacityCache.clear();
      lastCamKey = camKey;
    }
    opacityCache.set(tile.id, opacity);
  }
  // Mutate dynamic parts
  style.opacity = opacity;
  style.pointerEvents = opacity <= 0 ? 'none' : 'auto';
  return style;
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

// Continuous input tracking for smoother movement
const heldKeys = new Set<string>();
const MOVE_SPEED = 20; // tiles per second when holding a direction
let lastTime = performance.now();

function keyDown(e: KeyboardEvent) {
  // Movement keys: add to held set (prevent repeat lag)
  if (['ArrowUp','w','ArrowDown','s','ArrowLeft','a','ArrowRight','d'].includes(e.key)) {
    heldKeys.add(e.key);
    e.preventDefault();
  } else if (e.key === '+' ) {
    camera.radius = Math.min(30, camera.radius + 1);
  } else if (e.key === '-' || e.key === '_') {
    camera.radius = Math.max(camera.innerRadius + 1, camera.radius - 1);
  }
}
function keyUp(e: KeyboardEvent) {
  if (heldKeys.has(e.key)) {
    heldKeys.delete(e.key);
    e.preventDefault();
  }
}

// Smooth camera animation loop
let rafId: number | null = null;
function animateCamera() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000; // seconds
  lastTime = now;

  // Aggregate movement directions from held keys
  let dqInput = 0, drInput = 0;
  for (const k of heldKeys) {
    if (k === 'ArrowUp' || k === 'w') { drInput += -1; dqInput += 0.5; }
    else if (k === 'ArrowDown' || k === 's') { drInput += 1; dqInput += -0.5; }
    else if (k === 'ArrowLeft' || k === 'a') { dqInput += -1; }
    else if (k === 'ArrowRight' || k === 'd') { dqInput += 1; }
  }
  // Normalize diagonal to avoid faster speed (simple scale if both components non-zero)
  if (dqInput !== 0 || drInput !== 0) {
    const mag = Math.sqrt(dqInput * dqInput + drInput * drInput);
    if (mag > 0) {
      dqInput /= mag;
      drInput /= mag;
    }
    camera.targetQ += dqInput * MOVE_SPEED * dt;
    camera.targetR += drInput * MOVE_SPEED * dt;
  }

  // Distance-adaptive easing for camera follow
  const dq = camera.targetQ - camera.q;
  const dr = camera.targetR - camera.r;
  const dist = Math.sqrt(dq * dq + dr * dr);
  const baseMin = 0.08;
  const baseMax = 0.55;
  const lerp = baseMin + (1 - Math.exp(-dist * 0.9)) * (baseMax - baseMin);
  if (Math.abs(dq) < 0.005) camera.q = camera.targetQ; else camera.q += dq * lerp;
  if (Math.abs(dr) < 0.005) camera.r = camera.targetR; else camera.r += dr * lerp;

  rafId = requestAnimationFrame(animateCamera);
}

onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  animateCamera();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
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
.hex-tile.opacity-50 { /* fog-of-war */
  background: linear-gradient(145deg,#334155,#1e293b);
  box-shadow: inset 0 0 4px #0f172a;
}
.hex-tile:hover { filter: brightness(1.15); }

</style>