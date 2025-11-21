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
import {
  camera,
  axialToPixel,
  pixelToAxial,
  createPointerHandlers,
  dragged,
  hexDistance,
  keyDown,
  keyUp,
  animateCamera,
  stopCameraAnimation,
  HEX_SIZE,
  updateCameraRadius,
  HEX_SPACE
} from '../core/camera';

import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';

// Canvas filter support detection cached in closure
const hasCanvasFilter = (() => {
  let cached: boolean | undefined;
  return () => {
    if (cached !== undefined) return cached;
    try {
      const test = document.createElement('canvas').getContext('2d');
      if (test) {
        test.filter = 'blur(2px)';
        cached = test.filter === 'blur(2px)';
        return cached;
      }
    } catch {}
    cached = false;
    return cached;
  };
})();

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

const TILE_SPACE = HEX_SPACE;
const TILE_DRAW_SIZE = (HEX_SIZE * 2) - TILE_SPACE; // unified tile draw size

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

let layerCanvas: HTMLCanvasElement | null = null;
let layerCtx: CanvasRenderingContext2D | null = null;

function resizeCanvas() {
  const el = canvas.value; const containerEl = container.value; if(!el || !containerEl) return;
  const w = containerEl.clientWidth; const h = containerEl.clientHeight; dpr = window.devicePixelRatio||1;
  el.width = w * dpr; el.height = h * dpr; el.style.width = w+'px'; el.style.height = h+'px';
  const ctx = el.getContext('2d'); if(ctx) { ctxRef.value = ctx; ctx.imageSmoothingEnabled = false; }
  // Allocate / resize offscreen layer for motion blur compositing
  if (!layerCanvas) layerCanvas = document.createElement('canvas');
  layerCanvas.width = el.width; layerCanvas.height = el.height;
  layerCtx = layerCanvas.getContext('2d');
  if (layerCtx) layerCtx.imageSmoothingEnabled = false;
  adaptiveCameraRadius();
}

function getTileImageKey(tile: Tile) {
  return tile.terrain;
}

function drawTiles(targetCtx: CanvasRenderingContext2D) {
  const camPx = axialToPixel(camera.q, camera.r);
  const el = canvas.value!;
  const cx = el.width / dpr / 2; const cy = el.height / dpr / 2;
  const translateX = cx - camPx.x; const translateY = cy - camPx.y;
  targetCtx.save();
  targetCtx.scale(dpr,dpr);
  targetCtx.translate(translateX, translateY);
  const cq = Math.round(camera.q); const cr = Math.round(camera.r);
  const tiles = getTilesInRadius(cq, cr, camera.radius);
  const span = Math.max(3, (camera.radius - camera.innerRadius));
  for (const t of tiles) {
    const dist = hexDistance(camera, t);
    let fade = 1 - Math.max(0, (dist - camera.innerRadius) / span);
    fade = Math.min(1, Math.max(0, fade));
    const opacity = fade * fade;
    const {x, y} = axialToPixel(t.q, t.r);
    if(t.discovered) {
      const imgKey = getTileImageKey(t);
      const masked = maskedImages[imgKey ?? 'plains'];
      if (!masked) continue;
      targetCtx.globalAlpha = opacity;
      targetCtx.drawImage(masked, x - HEX_SIZE, y - HEX_SIZE);
    } else {
      targetCtx.globalAlpha = opacity * 0.5;
      targetCtx.fillStyle = '#242c3f';
      targetCtx.beginPath();
      const w = TILE_DRAW_SIZE;
      const h = TILE_DRAW_SIZE;
      targetCtx.moveTo(x + 0.5 * w - HEX_SIZE, y - HEX_SIZE);
      targetCtx.lineTo(x + w - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
      targetCtx.lineTo(x + w - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
      targetCtx.lineTo(x + 0.5 * w - HEX_SIZE, y + h - HEX_SIZE);
      targetCtx.lineTo(x - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
      targetCtx.lineTo(x - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
      targetCtx.closePath();
      targetCtx.fill();
    }
  }
  targetCtx.restore();
}

function draw() {
  const ctx = ctxRef.value; if(!ctx) return; if(!imagesLoaded) return;
  const el = canvas.value; if(!el) return;
  ctx.clearRect(0,0,el.width, el.height);

  const pixelSpeed = camera.speed * (HEX_SIZE * 0.9);
  let blurStrength = Math.min(12, Math.max(0, (pixelSpeed - 100) * 0.005));
  const brightness = blurStrength > 0 ? 1 - Math.min(0.15, blurStrength * 0.02) : 1;

  if (blurStrength < 0.4 || !layerCtx) {
    // Fast path: draw directly without offscreen compositing
    drawTiles(ctx);
    return;
  }

  // Offscreen compositing for smoother global blur
  layerCtx!.clearRect(0,0,layerCanvas!.width, layerCanvas!.height);
  drawTiles(layerCtx!);

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  // Safari path: use CSS filter for whole canvas (better support there)
  if (isSafari) {
    // Draw layer onto main then apply CSS filter (hardware accelerated in Safari)
    ctx.drawImage(layerCanvas!, 0, 0);
    el.style.filter = `blur(${blurStrength.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
    return;
  }

  // Non-Safari: context filter if supported
  if (hasCanvasFilter()) {
    el.style.filter = ''; // ensure CSS filter cleared
    ctx.save();
    ctx.filter = `blur(${blurStrength.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
    ctx.drawImage(layerCanvas!, 0, 0);
    ctx.restore();
  } else {
    el.style.filter = ''; // ensure CSS filter cleared
    // Directional multi-pass fallback
    const passes = Math.min(10, Math.ceil(blurStrength * 1.2));
    const offsetBase = blurStrength * 0.5;
    ctx.save();
    ctx.globalAlpha = 1 / passes;
    // Approximate direction using velocity; if nearly zero, do radial small offsets
    let vx = camera.velQ; let vy = camera.velR;
    const mag = Math.sqrt(vx*vx + vy*vy);
    if (mag < 0.001) { vx = 1; vy = 0; }
    const nx = vx / (mag || 1); const ny = vy / (mag || 1);
    for (let i = 0; i < passes; i++) {
      const t = (i / (passes - 1)) - 0.5; // -0.5..0.5
      const dx = nx * offsetBase * t;
      const dy = ny * offsetBase * t;
      ctx.drawImage(layerCanvas!, dx, dy);
    }
    ctx.globalAlpha = 1;
    if (brightness !== 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${(1-brightness).toFixed(3)})`;
      ctx.fillRect(0,0,layerCanvas!.width, layerCanvas!.height);
    }
    ctx.restore();
  }
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

function adaptiveCameraRadius() {
  const el = container.value; if(!el) return;
  const w = el.clientWidth; const h = el.clientHeight;
  // Heuristic: radius ~ proportional to diagonal / tile pixel span
  const diag = Math.min(w, h);
  const tilePixelSpan = HEX_SIZE * 2; // approximate diameter
  const targetRadius = Math.max(8, Math.min(64, Math.round(diag / tilePixelSpan * 1.25)));
  const inner = Math.max(3, Math.round(targetRadius * 0.33));
  updateCameraRadius(targetRadius, inner);
}

onMounted(async ()=>{
  await loadImages();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
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
  window.removeEventListener('orientationchange', resizeCanvas);
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
