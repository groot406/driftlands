<template>
  <div ref="container" class="w-full h-full relative map-container">
    <canvas ref="canvas" class="absolute inset-0"/>
    <!-- Hero sprites overlay -->
    <div v-for="entry in visibleHeroes" :key="entry.id" class="absolute" :style="entry.style"
         @click.stop="onHeroClick(entry.id)">
      <Sprite
          :key="worldVersion + '-' + entry.id"
          :sprite="entry.avatar"
          :zoom="heroZoom"
          :row="8"
          :size="heroFrameSize"
          :frames="heroFrames"
          :speed="heroAnimSpeed"
          :cooldown="heroAnimCooldown"/>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue';
import type {Tile} from '../core/world';
import {getTilesInRadius, worldVersion } from '../core/world';
import {
  animateCamera,
  axialToPixel,
  camera,
  createPointerHandlers,
  dragged,
  dragging,
  HEX_SIZE,
  HEX_SPACE,
  hexDistance,
  keyDown,
  keyUp,
  moveCamera,
  pixelToAxial,
  stopCameraAnimation,
  updateCameraRadius
} from '../core/camera';

import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountains.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';
import {Hero, heroes} from '../store/heroStore';
import Sprite from './Sprite.vue';
import { isPaused } from '../store/uiStore';

const emit = defineEmits<{ (e: 'tile-click', tile: Tile): void; (e: 'tile-doubleclick', tile: Tile): void }>();

const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const ctxRef = shallowRef<CanvasRenderingContext2D | null>(null);
let dpr = window.devicePixelRatio || 1;
let lastClickTime = 0;
const mouseDown = ref(false);
const {pointerDown, pointerMove, pointerUp, pointerCancel} = createPointerHandlers(mouseDown);
// Hovered tile tracking
const hoveredTile = shallowRef<Tile | null>(null);

interface ImageMap {
  [k: string]: HTMLImageElement
}

const images: ImageMap = {};
const imgSources: Record<string, string> = {forest, plains, mountain, water, mine, ruin, towncenter};
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
    img.onload = () => {
      images[key] = img;
      resolve();
    };
    img.src = src;
  }));
  return Promise.all(promises).then(() => {
    imagesLoaded = true;
    buildMaskedImages();
  });
}

let layerCanvas: HTMLCanvasElement | null = null;
let layerCtx: CanvasRenderingContext2D | null = null;

function resizeCanvas() {
  const el = canvas.value;
  const containerEl = container.value;
  if (!el || !containerEl) return;
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  dpr = window.devicePixelRatio || 1;
  el.width = w * dpr;
  el.height = h * dpr;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  const ctx = el.getContext('2d');
  if (ctx) {
    ctxRef.value = ctx;
    ctx.imageSmoothingEnabled = false;
  }
  // Allocate / resize offscreen layer for motion blur compositing
  if (!layerCanvas) layerCanvas = document.createElement('canvas');
  layerCanvas.width = el.width;
  layerCanvas.height = el.height;
  layerCtx = layerCanvas.getContext('2d');
  if (layerCtx) layerCtx.imageSmoothingEnabled = false;
  adaptiveCameraRadius();
}

function getTileImageKey(tile: Tile) {
  return tile.terrain;
}

// Helper to build hex path at world pixel center (x,y) matching tile draw
function drawHexPath(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE_DRAW_SIZE;
  const h = TILE_DRAW_SIZE;
  ctx.moveTo(x + 0.5 * w - HEX_SIZE, y - HEX_SIZE);
  ctx.lineTo(x + w - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
  ctx.lineTo(x + w - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
  ctx.lineTo(x + 0.5 * w - HEX_SIZE, y + h - HEX_SIZE);
  ctx.lineTo(x - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
  ctx.lineTo(x - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
  ctx.closePath();
}

function drawTiles(targetCtx: CanvasRenderingContext2D) {
  const camPx = axialToPixel(camera.q, camera.r);
  const el = canvas.value!;
  const cx = el.width / dpr / 2;
  const cy = el.height / dpr / 2;
  const translateX = cx - camPx.x;
  const translateY = cy - camPx.y;
  targetCtx.save();
  targetCtx.scale(dpr, dpr);
  targetCtx.translate(translateX, translateY);
  const cq = Math.round(camera.q);
  const cr = Math.round(camera.r);
  const tiles = getTilesInRadius(cq, cr, camera.radius);
  const span = Math.max(3, (camera.radius - camera.innerRadius));
  for (const t of tiles) {
    const dist = hexDistance(camera, t);
    let fade = 1 - Math.max(0, (dist - camera.innerRadius) / span);
    fade = Math.min(1, Math.max(0, fade));
    const opacity = fade * fade;
    const {x, y} = axialToPixel(t.q, t.r);
    if (t.discovered) {
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
  // Hover highlight (draw last so it sits above tile visuals)
  if (hoveredTile.value) {
    const ht = hoveredTile.value;
    // Only highlight if within current camera radius (avoid stale refs)
    if (hexDistance(camera, ht) <= camera.radius + 1) {
      const {x, y} = axialToPixel(ht.q, ht.r);
      targetCtx.globalAlpha = 1; // ensure full opacity
      targetCtx.lineWidth = 2; // stroke thickness in CSS px units (scaled by dpr earlier)
      targetCtx.strokeStyle = '#d0b23d'; // highlight outline color
      targetCtx.fillStyle = 'rgba(255, 227, 122, 0.15)'; // translucent fill
      targetCtx.beginPath();
      drawHexPath(targetCtx, x, y);
      targetCtx.fill();
      targetCtx.stroke();
    }
  }
  targetCtx.restore();
}

function draw() {
  const ctx = ctxRef.value;
  if (!ctx) return;
  if (!imagesLoaded) return;
  const el = canvas.value;
  if (!el) return;
  ctx.clearRect(0, 0, el.width, el.height);

  const pixelSpeed = camera.speed * (HEX_SIZE * 0.9);
  let blurStrength = Math.min(12, Math.max(0, (pixelSpeed - 100) * 0.005));
  const brightness = blurStrength > 0 ? 1 - Math.min(0.15, blurStrength * 0.02) : 1;

  if (blurStrength < 0.4 || !layerCtx) {
    // Fast path: draw directly without offscreen compositing
    drawTiles(ctx);
    return;
  }

  // Offscreen compositing for smoother global blur
  layerCtx!.clearRect(0, 0, layerCanvas!.width, layerCanvas!.height);
  drawTiles(layerCtx!);

  ctx.drawImage(layerCanvas!, 0, 0);
  container.value.style.filter = `blur(${blurStrength.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
  return;
}

let rafId: number | null = null;

function animationLoop() {
  draw();
  rafId = requestAnimationFrame(animationLoop);
}

function pickTile(clientX: number, clientY: number): Tile | null {
  const el = canvas.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const camPx = axialToPixel(camera.q, camera.r);
  const cx = el.width / dpr / 2;
  const cy = el.height / dpr / 2;
  const worldX = (x) - (cx - camPx.x);
  const worldY = (y) - (cy - camPx.y);
  const {q, r} = pixelToAxial(worldX, worldY);

  const results = getTilesInRadius(q, r, 0);
  return results.length ? results[0]! : null;
}

function handleClick(e: PointerEvent) {
  if (isPaused()) return; // ignore clicks while paused
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
  if (tile !== hoveredTile.value) hoveredTile.value = tile;

  emit('tile-click', tile);
}

// Update hovered tile based on pointer event
function updateHover(e: PointerEvent) {
  if (isPaused()) { // clear hover while paused
    if (hoveredTile.value) hoveredTile.value = null;
    return;
  }
  if (dragging) {
    if (hoveredTile.value) hoveredTile.value = null;
    return;
  }
  const tile = pickTile(e.clientX, e.clientY);
  if (tile !== hoveredTile.value) hoveredTile.value = tile;
}

function adaptiveCameraRadius() {
  const el = container.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  // Heuristic: radius ~ proportional to diagonal / tile pixel span
  const diag = Math.min(w, h);
  const tilePixelSpan = HEX_SIZE * 2; // approximate diameter
  const targetRadius = Math.max(8, Math.min(64, Math.round(diag / tilePixelSpan * 1.25)));
  const inner = Math.max(3, Math.round(targetRadius * 0.33));
  updateCameraRadius(targetRadius, inner);
}

onMounted(async () => {
  await loadImages();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const el = container.value;
  const c = canvas.value;
  if (el && c) {
    el.addEventListener('pointerdown', pointerDown, {passive: false});
    el.addEventListener('pointermove', (ev) => {
      pointerMove(ev);
      updateHover(ev as PointerEvent);
    }, {passive: false});
    el.addEventListener('pointerup', (ev) => {
      pointerUp();
      handleClick(ev as PointerEvent);
      updateHover(ev as PointerEvent);
    }, {passive: false});
    el.addEventListener('pointercancel', () => {
      pointerCancel();
      //hoveredTile.value = null;
    }, {passive: false});
    el.addEventListener('pointerleave', () => {
      pointerUp();
      //hoveredTile.value = null;
    }, {passive: false});
  }
  animateCamera();
  animationLoop();
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('orientationchange', resizeCanvas);
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  const el = container.value;
  if (el) {
    el.removeEventListener('pointerdown', pointerDown as any);
    // Remove wrapped pointermove handler (cannot reference original directly, so clear all by cloning?)
    // Simplicity: replace with nullifying hoveredTile; not critical for unmount but ensure pointer events cease.
    el.removeEventListener('pointermove', pointerMove as any);
    el.removeEventListener('pointerup', pointerUp as any);
    el.removeEventListener('pointercancel', pointerCancel as any);
    el.removeEventListener('pointerleave', pointerUp as any);
  }
  stopCameraAnimation();
});

// Hero rendering configuration (could move to config later)
const heroFrameSize = 32; // single frame size (assuming square)
const heroFrames = 2; // placeholder number of frames in santa spritesheet
const heroAnimSpeed = 160; // ms per frame
const heroAnimCooldown = 600; // cooldown at loop end
const heroZoom = 2; // scale heroes relative to tile size

function heroWorldToScreen(hero: Hero) {
  const el = canvas.value;
  if (!el) return {x: 0, y: 0, off: true};
  const camPx = axialToPixel(camera.q, camera.r);
  const cx = el.width / dpr / 2;
  const cy = el.height / dpr / 2;
  const heroPx = axialToPixel(hero.q, hero.r);
  const screenX = heroPx.x - camPx.x + cx;
  const screenY = heroPx.y - camPx.y + cy;
  return {x: screenX, y: screenY, off: false};
}

const visibleHeroes = computed(() => {
  const list: { id: string; style: Record<string, string>; avatar: string; hero: Hero }[] = [];
  const radius = camera.radius + 1; // small margin
  for (const h of heroes) {
    const dist = hexDistance(camera, h);
    if(h.q === 0 && h.r === 0) continue; // skip hero's at town center (idle)
    if (dist > radius) continue;
    const {x, y, off} = heroWorldToScreen(h);
    if (off) continue;
    const sameTileHeroes = heroes.filter(o => o.q === h.q && o.r === h.r);
    const indexInTile = sameTileHeroes.findIndex(o => o.id === h.id);
    const stackOffsetX = (indexInTile - (sameTileHeroes.length - 1) / 2) * (heroFrameSize * heroZoom * 0.4);
    const style: Record<string, string> = {
      left: (x - (heroFrameSize * heroZoom) / 2 + stackOffsetX) - (heroFrameSize / 2) + 'px',
      top: y - (heroFrameSize * 2) + 'px',
      zIndex: '50',
      pointerEvents: 'auto',
      // opacity based on distance fade
      opacity: (1 - Math.max(0, (dist - camera.innerRadius) / (radius - camera.innerRadius))).toString()
    };
    list.push({id: h.id, style, avatar: h.avatar, hero: h});
  }
  return list;
});

function onHeroClick(heroId: string) {
  if (isPaused()) return; // no camera jump while paused
  const h = heroes.find(h => h.id === heroId);
  if (!h) return;
  moveCamera(h.q, h.r);
}

</script>

<style scoped>
.map-container {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain;
}
</style>
