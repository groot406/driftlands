<template>
  <div ref="container" class="w-full h-full relative map-container">
    <canvas ref="canvas" class="absolute inset-0"/>
  </div>
</template>

<script setup lang="ts">
// pixelToAxial imported for coordinate picking
import {onMounted, onBeforeUnmount, ref, shallowRef} from 'vue';
import type {Tile} from '../core/world';
import {getTilesInRadius} from '../core/world';
import {camera, axialToPixel, pixelToAxial, createPointerHandlers, dragged, hexDistance, keyDown, keyUp, animateCamera, stopCameraAnimation, HEX_SIZE} from '../core/camera';

import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';

const emit = defineEmits<{(e:'tile-click', tile: Tile): void; (e:'tile-doubleclick', tile: Tile): void}>();

const container = ref<HTMLDivElement|null>(null);
const canvas = ref<HTMLCanvasElement|null>(null);
const ctxRef = shallowRef<CanvasRenderingContext2D|null>(null);
let dpr = window.devicePixelRatio || 1;
let lastClickTime = 0;
const mouseDown = ref(false);
const {pointerDown, pointerMove, pointerUp, pointerCancel} = createPointerHandlers(mouseDown);

interface ImageMap { [k: string]: HTMLImageElement }
const images: ImageMap = {};
const imgSources: Record<string, string> = { forest, plains, mountain, water, mine, ruin, towncenter };
let imagesLoaded = false;

const TILE_DRAW_SIZE = (HEX_SIZE * 2) - 3; // unified tile draw size
const maskedImages: Record<string, HTMLCanvasElement> = {};

function createMaskedImage(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_DRAW_SIZE;
  c.height = TILE_DRAW_SIZE;
  const g = c.getContext('2d')!;
  const w = TILE_DRAW_SIZE;
  const h = TILE_DRAW_SIZE;
  g.save();
  g.beginPath();
  // Hex path matching CSS clip-path polygon used previously (pointy-top)
  g.moveTo(0.5 * w, 0);
  g.lineTo(w, 0.25 * h);
  g.lineTo(w, 0.75 * h);
  g.lineTo(0.5 * w, h);
  g.lineTo(0, 0.75 * h);
  g.lineTo(0, 0.25 * h);
  g.closePath();
  g.clip();
  g.drawImage(img, 0, 0, w, h);
  g.restore();
  return c;
}

function buildMaskedImages() {
  for (const [key, img] of Object.entries(images)) {
    if (!maskedImages[key] && img.width > 0 && img.height > 0) {
      maskedImages[key] = createMaskedImage(img);
    }
  }
}

function loadImages(): Promise<void> {
  const promises = Object.entries(imgSources).map(([key, src]) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { images[key] = img; resolve(); };
    img.src = src;
  }));
  return Promise.all(promises).then(()=>{ imagesLoaded = true; buildMaskedImages(); });
}

function resizeCanvas() {
  const el = canvas.value; const containerEl = container.value; if(!el || !containerEl) return;
  const w = containerEl.clientWidth; const h = containerEl.clientHeight; dpr = window.devicePixelRatio||1;
  el.width = w * dpr; el.height = h * dpr; el.style.width = w+'px'; el.style.height = h+'px';
  const ctx = el.getContext('2d'); if(ctx) { ctxRef.value = ctx; ctx.imageSmoothingEnabled = false; }
}

function getTileImageKey(tile: Tile) {
  return tile.terrain || 'plains';
}

function draw() {
  const ctx = ctxRef.value; if(!ctx) return; if(!imagesLoaded) return;
  const el = canvas.value; if(!el) return;
  ctx.clearRect(0,0,el.width, el.height);
  ctx.save();
  ctx.scale(dpr,dpr);
  const camPx = axialToPixel(camera.q, camera.r);
  const cx = el.width / dpr / 2; const cy = el.height / dpr / 2;
  const translateX = cx - camPx.x; const translateY = cy - camPx.y;
  ctx.translate(translateX, translateY);

  const cq = Math.round(camera.q); const cr = Math.round(camera.r);
  const tiles = getTilesInRadius(cq, cr, camera.radius);
  const span = Math.max(3, (camera.radius - camera.innerRadius));

  for (const t of tiles) {
    const dist = hexDistance(camera, t);
    let fade = 1 - Math.max(0, (dist - camera.innerRadius) / span);
    fade = Math.min(1, Math.max(0, fade));
    const opacity = fade * fade;

    const {x, y} = axialToPixel(t.q, t.r);
    const imgKey = getTileImageKey(t);
    const masked = maskedImages[imgKey];
    if(!masked) continue; // masked image may not exist yet

    if (t.discovered) {
      ctx.globalAlpha = opacity;
      ctx.drawImage(masked, x - HEX_SIZE, y - HEX_SIZE);
    } else {
      ctx.globalAlpha = opacity * 0.5;
      ctx.drawImage(masked, x - HEX_SIZE, y - HEX_SIZE);
    }
  }
  ctx.restore();
}

let rafId: number|null = null;
function animationLoop() {
  draw();
  rafId = requestAnimationFrame(animationLoop);
}

function pickTile(clientX: number, clientY: number): Tile | null {
  const el = canvas.value; if(!el) return null;
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left; const y = clientY - rect.top;
  const camPx = axialToPixel(camera.q, camera.r);
  const cx = el.width / dpr / 2; const cy = el.height / dpr / 2;
  const worldX = (x) - (cx - camPx.x);
  const worldY = (y) - (cy - camPx.y);
  const {q, r} = pixelToAxial(worldX, worldY);
  // Use tile index directly (world.ts exports tileIndex indirectly via getTilesInRadius). We'll search radius 0.
  const results = getTilesInRadius(q, r, 0);
  return results.length ? results[0]! : null;
}

function handleClick(e: PointerEvent) {
  if (dragged) return;
  const tile = pickTile(e.clientX, e.clientY);
  if (!tile) return;
  const now = performance.now();
  if (now - lastClickTime < 300) {
    emit('tile-doubleclick', tile);
    lastClickTime = 0;
    return;
  }
  lastClickTime = now;
  emit('tile-click', tile);
}

onMounted(async ()=>{
  await loadImages();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const el = container.value;
  const c = canvas.value;
  if (el && c) {
    el.addEventListener('pointerdown', pointerDown, {passive:false});
    el.addEventListener('pointermove', pointerMove, {passive:false});
    el.addEventListener('pointerup', (ev)=>{ pointerUp(); handleClick(ev as PointerEvent); }, {passive:false});
    el.addEventListener('pointercancel', pointerCancel, {passive:false});
    el.addEventListener('pointerleave', pointerUp, {passive:false});
  }
  animateCamera();
  animationLoop();
});

onBeforeUnmount(()=>{
  if(rafId) cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  const el = container.value;
  if (el) {
    el.removeEventListener('pointerdown', pointerDown as any);
    el.removeEventListener('pointermove', pointerMove as any);
    el.removeEventListener('pointerup', pointerUp as any);
    el.removeEventListener('pointercancel', pointerCancel as any);
    el.removeEventListener('pointerleave', pointerUp as any);
  }
  stopCameraAnimation();
});

</script>

<style scoped>
.map-container { touch-action:none; -webkit-user-select:none; user-select:none; overscroll-behavior:contain; }
canvas { image-rendering: auto }
</style>
