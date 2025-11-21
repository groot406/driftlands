<template>
  <div ref="container" class="w-full h-full relative map-container">
    <canvas ref="canvas" class="absolute inset-0"/>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, shallowRef} from 'vue';
import type {Tile} from '../core/world';
import {getTilesInRadius} from '../core/world';
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
import {Hero, heroes, selectedHeroId, selectHero} from '../store/heroStore';

// Removed Sprite overlay imports
import {isPaused} from '../store/uiStore';

const emit = defineEmits<{ (e: 'tile-click', tile: Tile): void; (e: 'tile-doubleclick', tile: Tile): void; (e: 'hero-click', hero: Hero): void }>();

const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const ctxRef = shallowRef<CanvasRenderingContext2D | null>(null);
let dpr = window.devicePixelRatio || 1;
let lastClickTime = 0;
const mouseDown = ref(false);
const {pointerDown, pointerMove, pointerUp, pointerCancel} = createPointerHandlers(mouseDown);
// Hovered tile tracking
const hoveredTile = shallowRef<Tile | null>(null);
const hoveredHero = shallowRef<Hero | null>(null);

interface ImageMap {
  [k: string]: HTMLImageElement
}

const images: ImageMap = {};
const imgSources: Record<string, string> = {forest, plains, mountain, water, mine, ruin, towncenter};
let imagesLoaded = false;

const TILE_DRAW_SIZE = (HEX_SIZE * 2) - HEX_SPACE; // unified tile draw size

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

function computeTileHeroOffsets(tileHeroes: Hero[]): Record<string, {x: number; y: number}> {
  const result: Record<string, {x:number;y:number}> = {};
  const count = tileHeroes.length;
  if (count === 0) return result;

  if(count === 1) {
    result[tileHeroes[0].id] = {x: 12, y: 0};
    return result;
  }

  if(count === 2) {
    result[tileHeroes[0].id] = {x: -5, y: 0};
    result[tileHeroes[1].id] = {x: 32, y: 0};
    return result;
  }

  if(count === 3) {
    result[tileHeroes[0].id] = {x: -5, y: -2};
    result[tileHeroes[1].id] = {x: 12, y: 8};
    result[tileHeroes[2].id] = {x: 32, y: -2};
    return result;
  }

  if(count === 4) {
    result[tileHeroes[0].id] = {x: 12, y: -10};
    result[tileHeroes[1].id] = {x: -7, y: 4};
    result[tileHeroes[2].id] = {x: 32, y: 4};
    result[tileHeroes[3].id] = {x: 12, y: 18};
    return result;
  }

  if(count === 5) {
    result[tileHeroes[0].id] = {x: 16, y: -10};
    result[tileHeroes[1].id] = {x: -7, y: 4};
    result[tileHeroes[2].id] = {x: 32, y: 4};
    result[tileHeroes[3].id] = {x: 10, y: 8};
    result[tileHeroes[4].id] = {x: 16, y: 22};
    return result;
  }

  if (count === 6) {
    result[tileHeroes[0].id] = {x: 16, y: -12};
    result[tileHeroes[1].id] = {x: -10, y: 0};
    result[tileHeroes[2].id] = {x: 38, y: 0};
    result[tileHeroes[3].id] = {x: 0, y: 12};
    result[tileHeroes[4].id] = {x: 28, y: 16};
    result[tileHeroes[5].id] = {x: 16, y: 28};
    return result;
  }

  // Generic horizontal compression for other counts (previous behavior)
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * hSpacing;
    result[tileHeroes[i].id] = {x: offset, y: 0};
  }
  return result;
}

function drawHeroes(targetCtx: CanvasRenderingContext2D) {
  if (!heroImagesLoaded) return; // skip until loaded
  const radius = camera.radius + 1; // margin similar to overlay logic
  const span = Math.max(3, (camera.radius - camera.innerRadius));
  const now = performance.now();
  let frameIndex = lastHeroFrame;
  if (!isPaused()) {
    frameIndex = computeHeroFrame(now);
    lastHeroFrame = frameIndex;
  }
  for (const h of heroes) {
    const dist = hexDistance(camera, h);
    if (dist > radius) continue;
    const img = heroImages[h.avatar];
    if (!img) continue;

    // Build layout offsets for this tile once per hero (small tile sizes so acceptable; could cache if needed)
    const sameTile = heroes.filter(o => o.q === h.q && o.r === h.r);
    const layout = computeTileHeroOffsets(sameTile);
    const pos = layout[h.id] || {x:0,y:0};
    let fade = 1 - Math.max(0, (dist - camera.innerRadius) / span);
    fade = Math.min(1, Math.max(0, fade));
    const opacity = fade;
    const {x, y} = axialToPixel(h.q, h.r);
    const dw = heroFrameSize * heroZoom;
    const dh = heroFrameSize * heroZoom;
    const destX = x - (heroFrameSize * heroZoom) / 2 + pos.x - (heroFrameSize / 2);
    const destY = y - (heroFrameSize * 2) + (heroFrameSize/2) + pos.y;
    const sx = frameIndex * heroFrameSize;
    const sy = heroRow * heroFrameSize;
    targetCtx.globalAlpha = opacity;
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(img, sx, sy, heroFrameSize, heroFrameSize, destX, destY, dw, dh);
    const isSelected = selectedHeroId.value === h.id;
    const isHovered = hoveredHero.value && hoveredHero.value.id === h.id;
    if ((isSelected || isHovered) && heroEdgePixels[h.avatar]) {
      const edgePixels = heroEdgePixels[h.avatar][frameIndex];
      if (edgePixels && edgePixels.length) {
        targetCtx.save();
        targetCtx.globalAlpha = 1;
        targetCtx.fillStyle = isSelected ? '#ffe080' : '#ffffff';
        targetCtx.shadowColor = isSelected ? 'rgba(255,224,128,0.9)' : 'rgba(255,255,255,0.6)';
        targetCtx.shadowBlur = isSelected ? 12 : 8;
        targetCtx.translate(destX, destY);
        targetCtx.scale(heroZoom, heroZoom);
        for (const p of edgePixels) targetCtx.fillRect(p.x, p.y, 1, 1);
        targetCtx.restore();
      }
    }
  }
  targetCtx.globalAlpha = 1; // restore
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

  // Hover highlight (draw last so it sits above hero visuals)
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

  // Draw heroes within same transformed context so world coords align
  drawHeroes(targetCtx);

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
  el.style.filter = `blur(${blurStrength.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
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

function computeHeroFrame(now: number): number {
  const cycleActive = heroFrames * heroAnimSpeed;
  const totalCycle = cycleActive + heroAnimCooldown;
  const t = (now - heroAnimStart) % totalCycle;
  if (t >= cycleActive) return heroFrames - 1; // hold last frame during cooldown
  return Math.min(heroFrames - 1, Math.floor(t / heroAnimSpeed));
}

function pickHero(clientX: number, clientY: number): Hero | null {
  const el = canvas.value; if (!el) return null;
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  // Iterate heroes in reverse draw order for hit priority (later heroes potentially visually above)
  for (let i = heroes.length - 1; i >= 0; i--) {
    const h = heroes[i]!;
    const {x: sx, y: sy} = heroWorldToScreen(h);
    const sameTile = heroes.filter(o => o.q === h.q && o.r === h.r);
    const layout = computeTileHeroOffsets(sameTile);
    const pos = layout[h.id] || {x:0,y:0};
    const left = sx - (heroFrameSize * heroZoom)/2 + pos.x - (heroFrameSize / 2);
    const top = sy - (heroFrameSize * 2) + (heroFrameSize/2) + pos.y;
    const w = heroFrameSize * heroZoom;
    const hH = heroFrameSize * heroZoom;
    if (x < left || x > left + w || y < top || y > top + hH) continue;
    const localX = Math.floor((x - left) / heroZoom);
    const localY = Math.floor((y - top) / heroZoom);
    if (localX < 0 || localX >= heroFrameSize || localY < 0 || localY >= heroFrameSize) continue;
    const frameIndex = lastHeroFrame;
    const masks = heroMasks[h.avatar];
    if (!masks) continue;
    const mask = masks[frameIndex];
    if (!mask) continue;
    if (mask[localY * heroFrameSize + localX]) return h;
  }
  return null;
}

function handleClick(e: PointerEvent) {
  if (isPaused()) return; // ignore clicks while paused
  if (dragged) return;
  const hero = pickHero(e.clientX, e.clientY);
  if (hero) {
    selectHero(hero, false); // focus & select
    hoveredHero.value = hero; // ensure hover state matches after click
    emit('hero-click', hero);
    return;
  }

  // ...existing tile picking logic...
  const tile = pickTile(e.clientX, e.clientY);
  if (!tile) return;
  const now = performance.now();
  if ((now - lastClickTime) < 300) {
    emit('tile-doubleclick', tile);
    lastClickTime = 0;
    return;
  }
  lastClickTime = now;
  if (tile !== hoveredTile.value) hoveredTile.value = tile;

  emit('tile-click', tile);

  // deselect any selected hero on tile click
  selectHero(null, false);
}

// Update hovered tile based on pointer event
function updateHover(e: PointerEvent) {
  if (isPaused()) {
    if (hoveredTile.value) hoveredTile.value = null;
    if (hoveredHero.value) hoveredHero.value = null;
    return;
  }
  if (dragging) {
    if (hoveredTile.value) hoveredTile.value = null;
    if (hoveredHero.value) hoveredHero.value = null;
    return;
  }
  const hero = pickHero(e.clientX, e.clientY);
  if (hero) {
    if (hoveredTile.value) hoveredTile.value = null;
    hoveredHero.value = hero;
    return;
  }
  hoveredHero.value = null;
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
const heroRow = 8; // spritesheet row used previously in <Sprite :row="8"/>
let lastHeroFrame = 0; // persist frame while paused
let heroAnimStart = performance.now();

// Hero image cache
const heroImages: Record<string, HTMLImageElement> = {};
let heroImagesLoaded = false;
// Per-avatar frame alpha masks (Uint8Array width*height with 1=opaque,0=transparent)
const heroMasks: Record<string, Uint8Array[]> = {};
// Edge pixel coordinate lists per frame for fast outline drawing
const heroEdgePixels: Record<string, {x:number;y:number}[][]> = {};

function buildHeroMasks(img: HTMLImageElement, avatar: string) {
  if (heroMasks[avatar]) return; // already built
  const frames = heroFrames;
  const masks: Uint8Array[] = [];
  const edges: {x:number;y:number}[][] = [];
  for (let f = 0; f < frames; f++) {
    const sx = f * heroFrameSize;
    const sy = heroRow * heroFrameSize;
    const c = document.createElement('canvas');
    c.width = heroFrameSize;
    c.height = heroFrameSize;
    const g = c.getContext('2d')!;
    g.drawImage(img, sx, sy, heroFrameSize, heroFrameSize, 0, 0, heroFrameSize, heroFrameSize);
    const data = g.getImageData(0, 0, heroFrameSize, heroFrameSize);
    const mask = new Uint8Array(heroFrameSize * heroFrameSize);
    const edgeList: {x:number;y:number}[] = [];
    for (let y = 0; y < heroFrameSize; y++) {
      for (let x = 0; x < heroFrameSize; x++) {
        const idx = (y * heroFrameSize + x) * 4;
        const alpha = data.data[idx + 3];
        if (alpha > 20) { // threshold
          mask[y * heroFrameSize + x] = 1;
        }
      }
    }
    // Build edge pixels (if opaque and any 4-neighbor is transparent)
    for (let y = 0; y < heroFrameSize; y++) {
      for (let x = 0; x < heroFrameSize; x++) {
        if (!mask[y * heroFrameSize + x]) continue;
        let isEdge = false;
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx, dy] of dirs) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || nx >= heroFrameSize || ny < 0 || ny >= heroFrameSize || !mask[ny * heroFrameSize + nx]) { isEdge = true; break; }
        }
        if (isEdge) edgeList.push({x,y});
      }
    }
    masks.push(mask);
    edges.push(edgeList);
  }
  heroMasks[avatar] = masks;
  heroEdgePixels[avatar] = edges;
}

function loadHeroImages(): Promise<void> {
  // Collect unique avatar sources
  const unique = Array.from(new Set(heroes.map(h => h.avatar)));
  const promises = unique.map(src => new Promise<void>(resolve => {
    if (heroImages[src]) { buildHeroMasks(heroImages[src], src); resolve(); return; }
    const img = new Image();
    img.onload = () => { heroImages[src] = img; buildHeroMasks(img, src); resolve(); };
    img.src = src;
  }));
  return Promise.all(promises).then(() => { heroImagesLoaded = true; });
}

function heroWorldToScreen(hero: Hero) { // retained for click hit-testing
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

onMounted(async () => {
  await loadImages();
  await loadHeroImages();
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

</script>

<style scoped>
.map-container {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain;
}
</style>
