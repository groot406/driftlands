<template>
  <div class="title-bg" ref="wrapper">
    <canvas ref="canvas" class="absolute inset-0 w-full h-full" />
  </div>
</template>

<script setup lang="ts">
// Non-interactive endlessly scrolling blurred hex background for Title Screen.
// Draws procedural colored hex tiles using deterministic noise to give subtle motion.
// Cleans up on unmount; hidden when title phase ends (via parent v-if).
import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { HEX_SIZE, HEX_X_FACTOR, HEX_Y_FACTOR } from '../core/camera';
// Removed pixelToAxial, hexDistance imports since per-tile fade is replaced by radial gradient overlay
import { getTileType, getCachedTile } from '../core/procGen';
// Asset imports for real tile imagery (masked to hex)
import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import ruin from '../assets/tiles/ruin.png';

const canvas = ref<HTMLCanvasElement | null>(null);
const wrapper = ref<HTMLDivElement | null>(null);
const ctxRef = shallowRef<CanvasRenderingContext2D | null>(null);
let dpr = window.devicePixelRatio || 1;

// Scroll configuration
const SCROLL_SPEED = 50; // reduced speed for subtle motion
const DIR_X = 0.6; // diagonal direction components (normalized below)
const DIR_Y = 0.8;
const BLUR_AMOUNT = 4; // base blur (px)
const EXTRA_MARGIN = HEX_SIZE * 3; // pixels beyond viewport to prefill

let scrollX = 0;
let scrollY = 0;
let lastTime = performance.now();
let rafId: number | null = null;

// Removed radial fade parameters & computeRadii function

function resizeCanvas() {
  const el = canvas.value; const wrap = wrapper.value;
  if (!el || !wrap) return;
  const w = wrap.clientWidth; const h = wrap.clientHeight;
  dpr = window.devicePixelRatio || 1;
  el.width = w * dpr; el.height = h * dpr;
  el.style.width = w + 'px'; el.style.height = h + 'px';
  const ctx = el.getContext('2d');
  if (ctx) { ctxRef.value = ctx; ctx.imageSmoothingEnabled = false; }
}

function axialToPixel(q: number, r: number) {
  const x = HEX_X_FACTOR * (q + r / 2);
  const y = HEX_Y_FACTOR * r;
  return { x, y };
}

// Image loading & masking state
const rawImages: Record<string, HTMLImageElement> = {};
const maskedImages: Record<string, HTMLCanvasElement> = {};
const imgSources: Record<string, string> = { forest, plains, mountain, water, ruin };

function createMaskedImage(img: HTMLImageElement): HTMLCanvasElement {
  const drawSize = (HEX_SIZE * 2) - 2; // similar sizing to game map tiles
  const c = document.createElement('canvas');
  c.width = drawSize;
  c.height = drawSize;
  const g = c.getContext('2d')!;
  const w = drawSize;
  const h = drawSize;
  g.imageSmoothingEnabled = false;
  g.save();
  g.beginPath();
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
  // Soft overlay for cohesion under blur
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.beginPath();
  g.moveTo(0.5 * w, 0);
  g.lineTo(w, 0.25 * h);
  g.lineTo(w, 0.75 * h);
  g.lineTo(0.5 * w, h);
  g.lineTo(0, 0.75 * h);
  g.lineTo(0, 0.25 * h);
  g.closePath();
  g.fill();
  return c;
}

function buildMaskedImages() {
  for (const [key, img] of Object.entries(rawImages)) {
    if (!maskedImages[key] && img.width > 0) {
      maskedImages[key] = createMaskedImage(img);
    }
  }
}

function loadImages(): Promise<void> {
  const promises = Object.entries(imgSources).map(([key, src]) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { rawImages[key] = img; resolve(); };
    img.src = src;
  }));
  return Promise.all(promises).then(() => {
    buildMaskedImages();
  });
}

function drawFrame(dt: number) {
  const ctx = ctxRef.value; const el = canvas.value; if (!ctx || !el) return;
  // Advance scroll
  const mag = Math.sqrt(DIR_X*DIR_X + DIR_Y*DIR_Y);
  const vx = (DIR_X / mag) * SCROLL_SPEED;
  const vy = (DIR_Y / mag) * SCROLL_SPEED;
  scrollX += vx * dt;
  scrollY += vy * dt;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, el.width / dpr, el.height / dpr);

  const viewW = el.width / dpr; const viewH = el.height / dpr;
  const minX = -scrollX - EXTRA_MARGIN;
  const maxX = viewW - scrollX + EXTRA_MARGIN;
  const minY = -scrollY - EXTRA_MARGIN;
  const maxY = viewH - scrollY + EXTRA_MARGIN;
  const rMin = Math.floor(minY / HEX_Y_FACTOR) - 2;
  const rMax = Math.ceil(maxY / HEX_Y_FACTOR) + 2;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor((minX / HEX_X_FACTOR) - r / 2) - 2;
    const qMax = Math.ceil((maxX / HEX_X_FACTOR) - r / 2) + 2;
    for (let q = qMin; q <= qMax; q++) {
      const { x, y } = axialToPixel(q, r);
      const px = x + scrollX; const py = y + scrollY;
      if (px < -EXTRA_MARGIN || px > viewW + EXTRA_MARGIN || py < -EXTRA_MARGIN || py > viewH + EXTRA_MARGIN) continue;
      const t = getTileType(q, r);
      let imgCanvas: HTMLCanvasElement | undefined = maskedImages[t];
      if (!imgCanvas) imgCanvas = getCachedTile(t, { HEX_SIZE });
      ctx.drawImage(imgCanvas, px - imgCanvas.width/2, py - imgCanvas.height/2);
    }
  }
  // Radial gradient overlay (single pass) to fade out tiles toward edges
  const cx = viewW / 2;
  const cy = viewH / 2;
  const innerR = Math.min(viewW, viewH) * 0.35; // full brightness center
  const outerR = Math.max(viewW, viewH) * 0.5; // fade extent
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.restore();
}

function loop() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  // Cap dt to avoid huge jumps after tab hide
  drawFrame(Math.min(dt, 0.033));
  rafId = requestAnimationFrame(loop);
}

function handleVisibility() {
  if (document.hidden) {
    // Pause progression (keep lastTime so jump suppressed)
    lastTime = performance.now();
  }
}

onMounted(() => {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', handleVisibility);
  // Apply blur & subtle saturation shift via CSS filter on the wrapper
  if (wrapper.value) {
    wrapper.value.style.filter = `blur(${BLUR_AMOUNT}px) saturate(110%) brightness(0.9)`;
  }
  // Load images then start loop for full fidelity
  loadImages().finally(() => loop());
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resizeCanvas);
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>

<style scoped>
.title-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none; /* ensure non-interactive */
  z-index: 0; /* behind title content */
}
canvas { display: block; }
</style>
