<template>
  <div ref="container" class="w-full h-full relative map-container">
    <canvas ref="canvas" class="absolute inset-0"/>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
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
import {TERRAIN_DEFS} from '../core/terrainDefs';
import {axialKey, tileIndex} from '../core/world';

// Removed Sprite overlay imports
import {isPaused} from '../store/uiStore';

const emit = defineEmits<{ (e: 'tile-click', tile: Tile): void; (e: 'tile-doubleclick', tile: Tile): void; (e: 'hero-click', hero: Hero): void }>();

// ---------------------------------------------------------------------------
// Render & animation configuration (grouped)
// ---------------------------------------------------------------------------
const TILE_DRAW_SIZE = (HEX_SIZE * 2) - HEX_SPACE; // unified tile draw size
const heroFrameSize = 32; // single frame size (square)
const heroFrames = 2; // number of frames in avatar spritesheet row
const heroAnimSpeed = 160; // ms per frame during active cycle
const heroAnimCooldown = 600; // ms pause holding last frame
const heroZoom = 2; // scale applied to hero rendering
const heroRow = 8; // spritesheet row used for avatars
const HERO_OFFSET_SPACING = 14; // fallback horizontal spacing (bugfix for undefined hSpacing)

// Helper: compute fade value (0..1) based on distance within camera radii
function computeFade(dist: number, inner: number, radius: number): number {
  const span = Math.max(3, (radius - inner));
  let fade = 1 - Math.max(0, (dist - inner) / span);
  fade = Math.min(1, Math.max(0, fade));
  return fade;
}

// Coordinate helpers
function getCanvasCenter(el: HTMLCanvasElement, dpr: number) {
  return {cx: el.width / dpr / 2, cy: el.height / dpr / 2};
}
function worldToScreen(q: number, r: number, el: HTMLCanvasElement, dpr: number) {
  const camPx = axialToPixel(camera.q, camera.r);
  const {cx, cy} = getCanvasCenter(el, dpr);
  const tilePx = axialToPixel(q, r);
  return {x: tilePx.x - camPx.x + cx, y: tilePx.y - camPx.y + cy};
}
function screenToWorld(x: number, y: number, el: HTMLCanvasElement, dpr: number) {
  const camPx = axialToPixel(camera.q, camera.r);
  const {cx, cy} = getCanvasCenter(el, dpr);
  const worldX = x - (cx - camPx.x);
  const worldY = y - (cy - camPx.y);
  return {worldX, worldY};
}

// Draw hex highlight (hover, path) with configurable styles
function drawHexHighlight(ctx: CanvasRenderingContext2D, q: number, r: number, fillStyle: string | null, strokeStyle: string | null, opacity: number) {
  const {x, y} = axialToPixel(q, r);
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  drawHexPath(ctx, x, y);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Cache of per-tile hero layout for current frame (key = axialKey)
let currentHeroLayouts: Map<string, Record<string, {x:number;y:number}>> = new Map();

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
const pathCoords = shallowRef<{q:number;r:number}[]>([]);

interface ImageMap {
  [k: string]: HTMLImageElement
}

const images: ImageMap = {};
const imgSources: Record<string, string> = {forest, plains, mountain, water, mine, ruin, towncenter};
let imagesLoaded = false;

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
  const span = count - 1;
  for (let i = 0; i < count; i++) {
    const offset = (i - span / 2) * HERO_OFFSET_SPACING;
    result[tileHeroes[i].id] = {x: offset, y: 0};
  }
  return result;
}

function drawHeroes(targetCtx: CanvasRenderingContext2D) {
  if (!heroImagesLoaded) return; // skip until loaded
  const radius = camera.radius + 1; // margin similar to overlay logic
  const now = performance.now();
  let frameIndex = lastHeroFrame;
  if (!isPaused()) {
    frameIndex = computeHeroFrame(now);
    lastHeroFrame = frameIndex;
  }

  // Rebuild tile hero layouts cache for current frame using grouping (O(n))
  const tileHeroesMap = new Map<string, Hero[]>();
  for (const h of heroes) {
    const key = axialKey(h.q, h.r);
    let list = tileHeroesMap.get(key);
    if (!list) { list = []; tileHeroesMap.set(key, list); }
    list.push(h);
  }
  currentHeroLayouts = new Map();
  for (const [key, list] of tileHeroesMap) {
    currentHeroLayouts.set(key, computeTileHeroOffsets(list));
  }

  for (const h of heroes) {
    const dist = hexDistance(camera, h);
    if (dist > radius) continue;
    const img = heroImages[h.avatar];
    if (!img) continue;

    const layout = currentHeroLayouts.get(axialKey(h.q, h.r)) || {};
    const pos = layout[h.id] || {x:0,y:0};
    const fade = computeFade(dist, camera.innerRadius, camera.radius);
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
        targetCtx.globalAlpha = opacity;
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
  const {cx, cy} = getCanvasCenter(el, dpr);
  const translateX = cx - camPx.x;
  const translateY = cy - camPx.y;
  targetCtx.save();
  targetCtx.scale(dpr, dpr);
  targetCtx.translate(translateX, translateY);
  const cq = Math.round(camera.q);
  const cr = Math.round(camera.r);
  const tiles = getTilesInRadius(cq, cr, camera.radius);
  for (const t of tiles) {
    const dist = hexDistance(camera, t);
    const fade = computeFade(dist, camera.innerRadius, camera.radius);
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

  // Path highlight
  if (pathCoords.value.length) {
    for (let i = 0; i < pathCoords.value.length; i++) {
      const pc = pathCoords.value[i];
      const dist = hexDistance(camera, pc);
      const fade = computeFade(dist, camera.innerRadius, camera.radius);
      const opacity = fade * fade;
      if (hexDistance(camera, pc) > camera.radius + 1) continue;
      const isLast = i === pathCoords.value.length - 1;
      drawHexHighlight(targetCtx, pc.q, pc.r,
        isLast ? 'rgba(216,244,255,0.18)' : 'rgba(250,253,255,0.5)',
        isLast ? '#dbedff' : '#daf0ff',
        opacity);
    }
  }

  // Hover highlight
  if (hoveredTile.value) {
    const ht = hoveredTile.value;
    if (hexDistance(camera, ht) <= camera.radius + 1) {
      const dist = hexDistance(camera, ht);
      const fade = computeFade(dist, camera.innerRadius, camera.radius);
      const opacity = fade * fade;
      drawHexHighlight(targetCtx, ht.q, ht.r, 'rgba(255, 227, 122, 0.15)', '#d0b23d', opacity);
    }
  }

  // Draw heroes
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
    drawTiles(ctx);
    return;
  }

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
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const {worldX, worldY} = screenToWorld(sx, sy, el, dpr);
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
  for (let i = heroes.length - 1; i >= 0; i--) {
    const h = heroes[i]!;
    const {x: sx, y: sy} = worldToScreen(h.q, h.r, el, dpr);
    const layout = currentHeroLayouts.get(axialKey(h.q, h.r)) || computeTileHeroOffsets(heroes.filter(o => o.q === h.q && o.r === h.r));
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
    pathCoords.value = [];
    return;
  }
  if (dragging) {
    if (hoveredTile.value) hoveredTile.value = null;
    if (hoveredHero.value) hoveredHero.value = null;
    pathCoords.value = [];
    return;
  }
  const hero = pickHero(e.clientX, e.clientY);
  if (hero) {
    if (hoveredTile.value) hoveredTile.value = null;
    hoveredHero.value = hero;
    pathCoords.value = [];
    return;
  }
  hoveredHero.value = null;
  const tile = pickTile(e.clientX, e.clientY);
  if (tile !== hoveredTile.value) hoveredTile.value = tile;
  updatePath();
}

function adaptiveCameraRadius() {
  const el = container.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  const diag = Math.min(w, h);
  const tilePixelSpan = HEX_SIZE * 2; // approximate diameter
  const targetRadius = Math.max(8, Math.min(64, Math.round(diag / tilePixelSpan * 1.25)));
  const inner = Math.max(3, Math.round(targetRadius * 0.33));
  updateCameraRadius(targetRadius, inner);
}

function axialDistance(aQ:number,aR:number,bQ:number,bR:number){
  const dq = Math.abs(aQ - bQ);
  const dr = Math.abs(aR - bR);
  const ds = Math.abs((-aQ - aR) - (-bQ - bR));
  return Math.max(dq, dr, ds);
}

const AXIAL_DELTAS: Array<[number, number]> = [ [0,-1],[1,-1],[1,0],[0,1],[-1,1],[-1,0] ];
function isWalkable(q:number,r:number): boolean {
  const t = tileIndex[axialKey(q,r)];
  if (!t) return false;
  if (!t.terrain) return true;
  const def = (TERRAIN_DEFS as any)[t.terrain];
  return !!(def && def.walkable);
}
interface PathNode { q:number; r:number; g:number; f:number; parent?: PathNode }
function findWalkablePath(startQ:number,startR:number,goalQ:number,goalR:number, maxNodes=9999): {q:number;r:number}[] {
  if (startQ===goalQ && startR===goalR) return [];
  if (!isWalkable(goalQ, goalR)) return [];
  if (!isWalkable(startQ, startR)) return [];
  const open: PathNode[] = [];
  const openMap = new Map<string, PathNode>();
  const closed = new Set<string>();
  const startNode: PathNode = {q:startQ, r:startR, g:0, f:axialDistance(startQ,startR,goalQ,goalR)};
  open.push(startNode);
  openMap.set(axialKey(startQ,startR), startNode);
  let iterations = 0;
  while (open.length && iterations < maxNodes) {
    iterations++;
    let bestIndex = 0; let best = open[0];
    for (let i=1;i<open.length;i++){ if (open[i].f < best.f){ best = open[i]; bestIndex = i; } }
    const current = best; open.splice(bestIndex,1); openMap.delete(axialKey(current.q,current.r));
    const curKey = axialKey(current.q,current.r);
    closed.add(curKey);
    if (current.q === goalQ && current.r === goalR) {
      const rev: {q:number;r:number}[] = [];
      let n: PathNode | undefined = current;
      while (n && !(n.q === startQ && n.r === startR)) { rev.push({q:n.q,r:n.r}); n = n.parent; }
      rev.reverse();
      return rev;
    }
    for (const [dq,dr] of AXIAL_DELTAS) {
      const nq = current.q + dq; const nr = current.r + dr;
      const key = axialKey(nq,nr);
      if (closed.has(key)) continue;
      if (!isWalkable(nq,nr) && !(nq===goalQ && nr===goalR)) continue;
      const tentativeG = current.g + 1;
      let node = openMap.get(key);
      if (!node) {
        node = {q:nq, r:nr, g:tentativeG, f: tentativeG + axialDistance(nq,nr,goalQ,goalR), parent: current};
        open.push(node); openMap.set(key,node);
      } else if (tentativeG < node.g) {
        node.g = tentativeG;
        node.f = tentativeG + axialDistance(nq,nr,goalQ,goalR);
        node.parent = current;
      }
    }
  }
  return [];
}

function updatePath() {
  pathCoords.value = [];
  if (!selectedHeroId.value || !hoveredTile.value) return;
  const hero = heroes.find(h => h.id === selectedHeroId.value);
  if (!hero) return;
  const target = hoveredTile.value;
  if (!target) return;
  if (!isWalkable(target.q, target.r)) return;
  const path = findWalkablePath(hero.q, hero.r, target.q, target.r);
  if (path.length) pathCoords.value = path;
}

watch(selectedHeroId, () => updatePath());

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
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

// Hero animation state
let lastHeroFrame = 0; // persist frame while paused
let heroAnimStart = performance.now();

const heroImages: Record<string, HTMLImageElement> = {};
let heroImagesLoaded = false;
const heroMasks: Record<string, Uint8Array[]> = {};
const heroEdgePixels: Record<string, {x:number;y:number}[][]> = {};

function buildHeroMasks(img: HTMLImageElement, avatar: string) {
  if (heroMasks[avatar]) return;
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
        if (alpha > 20) {
          mask[y * heroFrameSize + x] = 1;
        }
      }
    }
    for (let y = 0; y < heroFrameSize; y++) {
      for (let x = 0; x < heroFrameSize; x++) {
        if (!mask[y * heroFrameSize + x]) continue;
        let isEdge = false;
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]] as const;
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
  const unique = Array.from(new Set(heroes.map(h => h.avatar)));
  const promises = unique.map(src => new Promise<void>(resolve => {
    if (heroImages[src]) { buildHeroMasks(heroImages[src], src); resolve(); return; }
    const img = new Image();
    img.onload = () => { heroImages[src] = img; buildHeroMasks(img, src); resolve(); };
    img.src = src;
  }));
  return Promise.all(promises).then(() => { heroImagesLoaded = true; });
}

function heroWorldToScreen(hero: Hero) {
  const el = canvas.value;
  if (!el) return {x: 0, y: 0, off: true};
  const pos = worldToScreen(hero.q, hero.r, el, dpr);
  return {x: pos.x, y: pos.y, off: false};
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
    }, {passive: false});
    el.addEventListener('pointerleave', () => {
      pointerUp();
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
