<template>
  <div class="h-screen flex bg-slate-900 text-slate-100">
    <div class="flex-1 overflow-hidden w-full h-full">
      <div ref="mapEl" class="w-full h-full relative select-none map-container">
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
            <!-- biome border overlay -->
            <svg v-if="showBiomeBorders && tile.discovered && tile.biome" class="hex-border" viewBox="0 0 100 100"
                 preserveAspectRatio="none">
              <g :stroke="biomeColor(tile.biome)" :stroke-width="BIOME_BORDER_SIZE" stroke-linejoin="round"
                 stroke-linecap="round" :fill="biomeColor(tile.biome)">
                <path v-for="edge in getBorderEdges(tile)" :key="edge" :d="edge"/>
              </g>
            </svg>
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
  </div>

  <div class="absolute z-10 top-4 left-4 opacity-80 text-white">
    <h1 class="text-2xl font-bold items-center">Nexus Hex – Idle Frontier (POC)</h1>
    <div class="gap-4 flex flex-row items-center mt-2">
      <button v-if="!store.running" class="btn" @click="startIdle()">Start</button>
      <button class="btn" @click="regenerateWorld()">Regenerate</button>
      <button class="btn" @click="regenerateWorld(200)">Generate large world</button>
    </div>
  </div>

  <!-- Minimap overlay -->
  <div class="absolute bottom-3 right-3 z-20 pointer-events-none" v-if="showMinimap">
    <Minimap :camera-q="camera.q" :camera-r="camera.r" :camera-radius="camera.radius"/>
  </div>
</template>

<script setup lang="ts">
import {computed, type CSSProperties, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch} from 'vue';
import {idleStore as store, startIdle} from '../store/idleStore';
import type {Tile} from '../core/world';
import {
  axialKey,
  discoverTile,
  generationCompleted,
  generationInProgress,
  generationProgress,
  generationStatus,
  generationTotal,
  getMaxRadiusFor,
  getTilesInRadius,
  startWorldGeneration,
  tileIndex,
  worldVersion
} from '../core/world';

import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';
import Minimap from './Minimap.vue';

const CAMERA_RADIUS = 20;
const CAMERA_INNER_RADIUS = 5;

const WORLD_SIZE = 6;
const HEX_SIZE = 35;
const HEX_SPACE = 3;
const BIOME_BORDER_SIZE = 6;
const baseTileSize = `${(HEX_SIZE * 2) - HEX_SPACE}px`;
const showBiomeBorders = false;
const showMinimap = false;

const mouseDown = ref(false);

// Precompute constants used in axialToPixel for speed
const SQRT3 = Math.sqrt(3);
const HEX_X_FACTOR = (HEX_SIZE + (HEX_SIZE * 0.155)) * SQRT3; // simplified reused factor
const HEX_Y_FACTOR = HEX_SIZE * 3 / 2;

// Camera state
const camera = reactive({
  q: 0,
  r: 0,
  targetQ: 0,
  targetR: 0,
  radius: CAMERA_RADIUS,
  innerRadius: CAMERA_INNER_RADIUS,
  velQ: 0,
  velR: 0
});

// Map container measurements
const mapEl = ref<HTMLElement | null>(null);
const viewport = reactive({w: 0, h: 0, cx: 0, cy: 0});

const visibleTiles = shallowRef<Tile[]>([]);

onMounted(() => {
  startWorldGeneration(WORLD_SIZE, store.tiles);
})

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

function axialToPixel(q: number, r: number) {
  const x = HEX_X_FACTOR * (q + r / 2);
  const y = HEX_Y_FACTOR * r;
  return {x, y};
}

function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

// Cache for pixel positions per tile id to avoid recalculation every frame
const pixelCache = new Map<string, { x: number; y: number }>();
const styleCache = new Map<string, CSSProperties>();
let lastCamKey = '';
const opacityCache = new Map<string, number>();

// Single world transform keeps camera centered
const worldStyle = computed(() => {
  const camPx = axialToPixel(camera.q, camera.r);
  return {transform: `translate(${viewport.cx - camPx.x}px, ${viewport.cy - camPx.y}px)`};
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

function getTileBackground(tile: Tile) {
  return `url(${getTileImage(tile)}) center/cover`;
}

function getTileImage(tile: Tile) {
  switch (tile.terrain) {
    case 'towncenter':
      return towncenter;
    case 'forest':
      return forest;
    case 'mountain':
      return mountain;
    case 'water':
      return water;
    case 'mine':
      return mine;
    case 'ruin':
      return ruin;
    case 'plains':
    default:
      return plains;
  }
}

function clampCameraTargets() {
  // Improved: use per-axis maximum radius to restrict movement more naturally
  const maxRad = getMaxRadiusFor(camera.targetQ, camera.targetR, camera.radius / 2);
  const q = camera.targetQ;
  const r = camera.targetR;
  const s = -q - r;
  const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  if (dist > maxRad) {
    const scale = maxRad / dist;
    camera.targetQ = q * scale;
    camera.targetR = r * scale;
  }
}

// ---------------- Pointer drag / throw camera navigation ----------------
const DRAG_THRESHOLD = 4; // px before we treat as drag
const VELOCITY_SAMPLE_WINDOW_MS = 120; // recent movement window for throw velocity
const FRICTION = 8; // exponential friction factor (larger => quicker stop)
const MAX_THROW_SPEED = 100; // axial units per second cap
let dragging = false;

//let activePointerId: number | null = null;
let dragStartX = 0, dragStartY = 0, lastX = 0, lastY = 0;
const samples: { t: number; x: number; y: number }[] = [];

function pixelDeltaToAxial(dx: number, dy: number) {
  const dr = dy / HEX_Y_FACTOR;
  const dq = (dx / HEX_X_FACTOR) - dr / 2; // derived from x = factor*(q + r/2)
  return {dq, dr};
}

function pointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return; // only left button
  mouseDown.value = true;
  dragging = false;
  dragStartX = lastX = e.clientX;
  dragStartY = lastY = e.clientY;

  samples.length = 0;
  samples.push({t: performance.now(), x: e.clientX, y: e.clientY});
}

function pointerMove(e: PointerEvent) {
  if (!mouseDown.value) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  if (!dragging) {
    const dist2 = (e.clientX - dragStartX) ** 2 + (e.clientY - dragStartY) ** 2;
    if (dist2 > DRAG_THRESHOLD * DRAG_THRESHOLD) dragging = true;
  }
  if (dragging) {
    const {dq, dr} = pixelDeltaToAxial(dx, dy);
    camera.targetQ -= dq; // subtract so map moves with pointer
    camera.targetR -= dr;

    camera.q = camera.targetQ;
    camera.r = camera.targetR;
    clampCameraTargets();
  }
  lastX = e.clientX;
  lastY = e.clientY;
  const now = performance.now();
  samples.push({t: now, x: e.clientX, y: e.clientY});
  while (samples.length > 0 && now - samples[0]!.t > VELOCITY_SAMPLE_WINDOW_MS) samples.shift();
  e.preventDefault();
}

function computeThrowVelocity() {
  if (samples.length < 2) return;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const {dq, dr} = pixelDeltaToAxial(dx, dy);
  let vq = -dq / dt; // negative to continue map motion
  let vr = -dr / dt;
  const speed = Math.sqrt(vq * vq + vr * vr);
  if (speed < 15) return; // too small
  const max = MAX_THROW_SPEED;
  if (speed > max) {
    const s = max / speed;
    vq *= s;
    vr *= s;
  }
  camera.velQ = vq;
  camera.velR = vr;
}

function pointerUp() {
  if (dragging) computeThrowVelocity();
  dragging = false;
  samples.length = 0;
  mouseDown.value = false;
}

function pointerCancel() {
  dragging = false;
  samples.length = 0;
  camera.velQ = 0;
  camera.velR = 0;
  mouseDown.value = false;
}

let lastClickTime = 0;

function clickTile(tile: Tile) {
  if (dragging) return; // ignore clicks if we were dragging
  if (!tile.discovered) {
    discoverTile(tile);
    return;
  }

  // double click
  if (performance.now() - lastClickTime < 300) {
    camera.targetQ = tile.q;
    camera.targetR = tile.r;
  }

  lastClickTime = performance.now();
}

// Movement/input state declarations (placed before animateCamera usage)
let lastTime = performance.now();
const heldKeys = new Set<string>();
const MOVE_SPEED = 35;
let rafId: number | null = null;

function keyDown(e: KeyboardEvent) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
    heldKeys.add(e.key);
    e.preventDefault();
  } else if (e.key === '+' || e.key === '=') {
    camera.radius = Math.min(40, camera.radius + 1);
  } else if (e.key === '-' || e.key === '_') {
    camera.radius = Math.max(camera.innerRadius + 2, camera.radius - 1);
  }
}

function keyUp(e: KeyboardEvent) {
  if (heldKeys.delete(e.key)) e.preventDefault();
}

function getPixel(tile: Tile) {
  let cached = pixelCache.get(tile.id);
  if (!cached) {
    cached = axialToPixel(tile.q, tile.r);
    pixelCache.set(tile.id, cached);
  }
  return cached;
}

function animateCamera() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000; // seconds
  lastTime = now;
  let dqInput = 0, drInput = 0;
  for (const k of heldKeys) {
    if (k === 'ArrowUp' || k === 'w') {
      drInput += -1;
      dqInput += 0.5;
    } else if (k === 'ArrowDown' || k === 's') {
      drInput += 1;
      dqInput += -0.5;
    } else if (k === 'ArrowLeft' || k === 'a') {
      dqInput += -1;
    } else if (k === 'ArrowRight' || k === 'd') {
      dqInput += 1;
    }
  }
  if (dqInput !== 0 || drInput !== 0) {
    const mag = Math.sqrt(dqInput * dqInput + drInput * drInput);
    if (mag > 0) {
      dqInput /= mag;
      drInput /= mag;
    }
    camera.targetQ += dqInput * MOVE_SPEED * dt;
    camera.targetR += drInput * MOVE_SPEED * dt;
    clampCameraTargets();
    // Cancel inertial velocity when actively using keyboard (optional)
    camera.velQ = 0;
    camera.velR = 0;
  }
  // Apply inertial velocity
  if (camera.velQ !== 0 || camera.velR !== 0) {
    camera.targetQ += camera.velQ * dt;
    camera.targetR += camera.velR * dt;
    clampCameraTargets();
    const decay = Math.exp(-FRICTION * dt);
    camera.velQ *= decay;
    camera.velR *= decay;
    if (Math.abs(camera.velQ) < 0.02) camera.velQ = 0;
    if (Math.abs(camera.velR) < 0.02) camera.velR = 0;
  }
  const dq = camera.targetQ - camera.q;
  const dr = camera.targetR - camera.r;
  const dist = Math.sqrt(dq * dq + dr * dr);
  const baseMin = 0.05;
  const baseMax = 0.1;
  const lerp = baseMin + (1 - Math.exp(-dist * 0.9)) * (baseMax - baseMin);
  if (Math.abs(dq) < 0.05) camera.q = camera.targetQ; else camera.q += dq * lerp;
  if (Math.abs(dr) < 0.05) camera.r = camera.targetR; else camera.r += dr * lerp;
  clampCameraTargets();
  rafId = requestAnimationFrame(animateCamera);
}

// ---------------- Biome cluster border helpers ----------------
// Hex vertices (pointy-top) normalized to 0..100
const HEX_VERTS: [number, number][] = [
  [50, 0],   // v0 top
  [100, 25], // v1 top-right
  [100, 75], // v2 bottom-right
  [50, 100], // v3 bottom
  [0, 75],   // v4 bottom-left
  [0, 25]    // v5 top-left
];

// Each direction mapping to axial offset and edge between vertex indices
interface HexEdgeDef {
  dq: number;
  dr: number;
  verts: [number, number];
}

// Direction order chosen to match axial: NE(+1,-1), E(+1,0), SE(0,+1), SW(-1,+1), W(-1,0), NW(0,-1)
// Mapped to edges: 0: v0-v1 (NE), 1: v1-v2 (E), 2: v2-v3 (SE), 3: v3-v4 (SW), 4: v4-v5 (W), 5: v5-v0 (NW)
const EDGE_DEFS: HexEdgeDef[] = [
  {dq: 1, dr: -1, verts: [0, 1]},
  {dq: 1, dr: 0, verts: [1, 2]},
  {dq: 0, dr: 1, verts: [2, 3]},
  {dq: -1, dr: 1, verts: [3, 4]},
  {dq: -1, dr: 0, verts: [4, 5]},
  {dq: 0, dr: -1, verts: [5, 0]}
];

function biomeColor(biome: string | null): string {
  switch (biome) {
    case 'forest':
      return '#16a34a';
    case 'mountain':
      return '#64748b';
    case 'lake':
      return '#0055a8';
    case 'coast':
      return '#14b8a6';
    case 'plains':
      return '#facc15';
    default:
      return '#94a3b8';
  }
}

function getBorderEdges(tile: Tile): string[] {
  if (!tile.biome) return [];
  const result: string[] = [];
  for (const edge of EDGE_DEFS) {
    const nq = tile.q + edge.dq;
    const nr = tile.r + edge.dr;
    const neighbor = tileIndex[axialKey(nq, nr)];
    const sameBiome = neighbor && neighbor.discovered && neighbor.biome === tile.biome;
    if (!sameBiome) {
      const [aIndex, bIndex] = edge.verts;
      const [ax, ay] = HEX_VERTS[aIndex]!;
      const [bx, by] = HEX_VERTS[bIndex]!;
      result.push(`M${ax},${ay} L${bx},${by}`);
    }
  }
  return result;
}

function regenerateWorld(size?: number) {
  camera.targetQ = 0;
  camera.targetR = 0;
  startWorldGeneration(size ?? WORLD_SIZE);
}

onMounted(() => {
  measure();
  updateVisibleTiles();
  window.addEventListener('resize', measure);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const el = mapEl.value;
  if (el) {
    el.addEventListener('pointerdown', pointerDown, {passive: false});
    el.addEventListener('pointermove', pointerMove, {passive: false});
    el.addEventListener('pointerup', pointerUp, {passive: false});
    el.addEventListener('pointercancel', pointerCancel, {passive: false});
    el.addEventListener('pointerleave', pointerUp, {passive: false}); // treat leave as up
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

body {
  image-rendering: high-quality;
}

.hex-tile.opacity-50 {
  background: #334155;
}

.hex-tile:hover {
  filter: brightness(1.25);
}

.hex-border {
  position: absolute;
  inset: -2px;
  pointer-events: none;
}

.map-container {
  touch-action: none; /* prevent browser panning/zoom gestures */
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain;
}

.map-container:active {
  cursor: grabbing;
}

.minimap-wrapper { /* allow pointer events pass-through except internal */
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.minimap {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 150px;
  height: 150px;
  border: 2px solid white;
  border-radius: 8px;
  overflow: hidden;
  pointer-events: auto;
}

</style>