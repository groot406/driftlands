<template>
  <div class="title-bg" ref="wrapper">
    <div
      v-if="backgroundImage"
      class="title-bg__image"
      :style="{ backgroundImage: `url(${backgroundImage})` }"
    />
    <canvas v-else ref="canvas" class="absolute inset-0 w-full h-full" />
    <div v-if="backgroundImage" class="title-bg__vignette" />
  </div>
</template>

<script setup lang="ts">
// Non-interactive endlessly scrolling blurred hex background for Title Screen.
// Draws procedural colored hex tiles using deterministic noise to give subtle motion.
// Cleans up on unmount; hidden when title phase ends (via parent v-if).
import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { HEX_SIZE, HEX_X_FACTOR, HEX_Y_FACTOR } from '../core/camera';
import { getTileSelection, getTileSpriteKey, getCachedTile } from '../core/procGen';
import type { TerrainKey } from '../core/terrainDefs';

const canvas = ref<HTMLCanvasElement | null>(null);
const wrapper = ref<HTMLDivElement | null>(null);
const ctxRef = shallowRef<CanvasRenderingContext2D | null>(null);
let dpr = window.devicePixelRatio || 1;

const tileImageModules = import.meta.glob('../assets/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const tileImageSources: Record<string, string> = {};
for (const [path, url] of Object.entries(tileImageModules)) {
  const nameMatch = path.match(/([^/]+)\.png$/);
  if (!nameMatch) continue;
  tileImageSources[nameMatch[1]!] = url;
}

const props = defineProps<{
  move: boolean
  speed?: number;
  blur?: number
  backgroundImage?: string
}>();

const backgroundImage = props.backgroundImage;

// Scroll configuration
const SCROLL_SPEED = props.speed ?? (props.move ? 50 : 0); // reduced speed for subtle motion
const DIR_X = props.move ? 0.6 : 0.01; // diagonal direction components (normalized below)
const DIR_Y = props.move ? 0.8 : 0.01;
const BLUR_AMOUNT = props.blur ?? 4; // base blur (px)
const EXTRA_MARGIN = HEX_SIZE * 3; // pixels beyond viewport to prefill

let scrollX = 0;
let scrollY = 0;
let lastTime = performance.now();
let rafId: number | null = null;

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

// Dynamic sprite image cache keyed by sprite names (terrain or variant asset keys)
const spriteRaw: Record<string, HTMLImageElement> = {};
const spriteMasked: Record<string, HTMLCanvasElement> = {};
const spriteLoading = new Set<string>();
const spriteMissing = new Set<string>();

function createMaskedImage(img: HTMLImageElement): HTMLCanvasElement {
  const drawSize = (HEX_SIZE * 2) - 2;
  const c = document.createElement('canvas');
  c.width = drawSize; c.height = drawSize;
  const g = c.getContext('2d')!;
  const w = drawSize; const h = drawSize;
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

function ensureSpriteLoaded(key: string) {
  if (!key || spriteMasked[key] || spriteLoading.has(key) || spriteMissing.has(key)) return;
  const img = spriteRaw[key];
  if (img && img.naturalWidth > 0) {
    spriteMasked[key] = createMaskedImage(img);
    return;
  }

  const url = tileImageSources[key];
  if (!url) {
    spriteMissing.add(key);
    return;
  }

  spriteLoading.add(key);
  const image = new Image();
  image.onload = () => {
    spriteLoading.delete(key);
    spriteRaw[key] = image;
    spriteMasked[key] = createMaskedImage(image);
  };
  image.onerror = () => {
    spriteLoading.delete(key);
    spriteMissing.add(key);
  };
  image.src = url;
}

function drawFrame(dt: number) {
  const ctx = ctxRef.value; const el = canvas.value; if (!ctx || !el) return;
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
      const sel = getTileSelection(q, r);
      const spriteKey = getTileSpriteKey(q, r);
      ensureSpriteLoaded(spriteKey);
      let imgCanvas = spriteMasked[spriteKey];
      if (!imgCanvas) imgCanvas = getCachedTile(sel.terrain as TerrainKey, { HEX_SIZE });
      ctx.drawImage(imgCanvas, px - imgCanvas.width/2, py - imgCanvas.height/2);
    }
  }
  const cx = viewW / 2; const cy = viewH / 2;
  const innerR = Math.min(viewW, viewH) * 0.35;
  const outerR = Math.max(viewW, viewH) * 0.5;
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
  drawFrame(Math.min(dt, 0.033));
  rafId = requestAnimationFrame(loop);
}

function handleVisibility() {
  if (document.hidden) {
    lastTime = performance.now();
  }
}

onMounted(() => {
  if (backgroundImage) {
    return;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', handleVisibility);
  // Apply blur & subtle saturation shift via CSS filter on the wrapper
  if (wrapper.value) {
    wrapper.value.style.filter = `blur(${BLUR_AMOUNT}px) saturate(110%) brightness(${1 - (BLUR_AMOUNT/100)})`;
  }
  loop();
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
  pointer-events: none;
  z-index: 0;
}
canvas { display: block; }

.title-bg__image,
.title-bg__vignette {
  position: absolute;
  inset: 0;
}

.title-bg__image {
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: saturate(112%) contrast(112%) brightness(54%);
  transform: scale(1.02);
}

.title-bg__vignette {
  background:
    radial-gradient(ellipse at center, rgba(2, 20, 50, 0.08) 0%, rgba(2, 20, 50, 0.2) 60%, rgba(1, 10, 40, 0.52) 86%, rgba(0, 10, 30, 0.92) 100%),
    linear-gradient(180deg, rgba(0, 5, 6, 0.48) 0%, rgba(0, 5, 6, 0.06) 28%, rgba(0, 5, 6, 0.36) 100%);

  background-blend-mode: overlay;
  opacity: 0.9;
}
</style>
