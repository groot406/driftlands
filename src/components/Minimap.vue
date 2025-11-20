<template>
  <div class="minimap-wrapper" :style="{ width: width + 'px', height: height + 'px' }">
    <canvas ref="canvas" :width="width" :height="height" class="minimap-canvas" />
  </div>
</template>

<script setup lang="ts">
import { worldVersion, tiles } from '../core/world';
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

// Props for camera position & radius
const props = defineProps<{ cameraQ: number; cameraR: number; cameraRadius: number; width?: number; height?: number; maxRadius?: number }>();

const width = props.width ?? 200;
const height = props.height ?? 200;
const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let frameReq: number | null = null;
let needsRedraw = false;

function terrainColor(terrain: string | null): string {
  switch (terrain) {
    case 'forest': return '#173825';
    case 'mountain': return '#4b322a';
    case 'water': return '#36b9ef';
    case 'plains': return '#51a82f';
    case 'ruin': return '#6366f1';
    case 'mine': return '#fff4c2';
    case 'towncenter': return '#f97316';
    default: return '#242c3f';
  }
}

// Cap for camera radius in minimap (prevents excessive zoom-out)
const MAX_RADIUS = props.maxRadius ?? 50;

function computeHexSize(radius: number): number {
  const r = Math.max(1, radius);
  const sizeByWidth = (width * 0.9) / (2 * Math.sqrt(3) * r);
  const sizeByHeight = (height * 0.9) / (3 * r);
  return Math.min(sizeByWidth, sizeByHeight);
}

function axialToPixel(q: number, r: number, size: number) {
  const x = Math.sqrt(3) * size * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

function axialDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = Math.abs(q1 - q2);
  const dr = Math.abs(r1 - r2);
  const ds = Math.abs((-q1 - r1) - (-q2 - r2));
  return Math.max(dq, dr, ds);
}

function draw() {
  needsRedraw = false;
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const { cameraQ, cameraR } = props;
  const effectiveRadius = MAX_RADIUS;
  const hexSize = computeHexSize(effectiveRadius);
  const centerX = width / 2;
  const centerY = height / 2;

  // Draw tiles within camera view
  for (const t of tiles) {
    const dist = axialDistance(t.q, t.r, cameraQ, cameraR);
    if (dist > effectiveRadius + 1) continue; // small margin
    const relQ = t.q - cameraQ;
    const relR = t.r - cameraR;
    const { x, y } = axialToPixel(relQ, relR, hexSize);
    const px = centerX + x;
    const py = centerY + y;
    const color = terrainColor(t.terrain) + (t.discovered ? 'DD' : '44');
    drawHex(px, py, hexSize, color);
  }
}

function drawHex(cx: number, cy: number, size: number, fill: string) {
  if (!ctx) return;
  const verts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30); // pointy-top orientation
    verts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  ctx.beginPath();
  ctx.moveTo(verts[0]![0], verts[0]![1]);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i]![0], verts[i]![1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function scheduleRedraw() {
  if (needsRedraw) return; // already queued
  needsRedraw = true;
  if (frameReq) cancelAnimationFrame(frameReq);
  frameReq = requestAnimationFrame(draw);
}

watch(worldVersion, scheduleRedraw);
watch(() => [props.cameraQ, props.cameraR, props.cameraRadius], scheduleRedraw);

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null;
  scheduleRedraw();
});

onBeforeUnmount(() => {
  if (frameReq) cancelAnimationFrame(frameReq);
});
</script>

<style scoped>
.minimap-wrapper {
  position: relative;
  background: #0f172a77;
  backdrop-filter: blur(4px);
  border: 3px solid #33415566;
  border-radius: 100%;
  overflow: hidden;
  box-shadow: 0 2px 4px -2px #000 inset, 0 0 0 1px rgba(255,255,255,0.04);
}
.minimap-canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #94a3b8;
  background: rgba(15,23,42,0.4);
  backdrop-filter: blur(2px);
}
</style>
