<template>
  <div
    ref="rootEl"
    class="world-minimap"
    :class="{
      'world-minimap--compact': compact,
      'world-minimap--draggable': draggable,
      'world-minimap--dragging': isDragging,
    }"
    :aria-label="ariaLabel"
    :style="{ '--world-minimap-aspect': String(aspectRatio) }"
    @pointerdown="handlePointerDown"
  >
    <canvas ref="canvasEl" class="world-minimap__canvas" aria-hidden="true"></canvas>

    <button
      v-for="hotspot in positionedHotspots"
      :key="hotspot.id"
      class="world-minimap__hotspot"
      :class="[
        `world-minimap__hotspot--${hotspot.kind}`,
        hotspot.tone ? `world-minimap__hotspot--${hotspot.tone}` : null,
        hotspot.selected ? 'world-minimap__hotspot--selected' : null,
        hotspot.disabled ? 'world-minimap__hotspot--disabled' : null,
      ]"
      :style="hotspot.style"
      :title="hotspot.title"
      :disabled="hotspot.disabled || !hotspot.interactive"
      type="button"
      @click="emit('hotspot-click', hotspot)"
    >
      <span></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { TerrainKey } from '../core/terrainDefs.ts';

export interface MiniMapTerrainTile {
  id: string;
  q: number;
  r: number;
  terrain: TerrainKey;
}

export interface MiniMapHotspot {
  id: string;
  q: number;
  r: number;
  kind: 'candidate' | 'settlement' | 'hero';
  tone?: 'home' | 'near' | 'frontier' | 'remote' | 'hero' | 'settlement';
  title?: string;
  color?: string | null;
  interactive?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  terrainTiles: MiniMapTerrainTile[];
  hotspots?: MiniMapHotspot[];
  ariaLabel?: string;
  compact?: boolean;
  aspectRatio?: number;
  layoutMode?: 'content' | 'fixed';
  viewportCenter?: { q: number; r: number } | null;
  viewportWidthUnits?: number;
  draggable?: boolean;
}>(), {
  hotspots: () => [],
  ariaLabel: 'World minimap',
  compact: false,
  aspectRatio: 1,
  layoutMode: 'content',
  viewportCenter: null,
  viewportWidthUnits: 24,
  draggable: false,
});

const emit = defineEmits<{
  (event: 'hotspot-click', hotspot: MiniMapHotspot): void;
  (event: 'viewport-center-change', center: { q: number; r: number }): void;
}>();

const rootEl = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const isDragging = ref(false);
const dragState = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startCenterX: number;
  startCenterY: number;
  moved: boolean;
} | null>(null);

const projectedPoints = computed(() => {
  if (props.layoutMode === 'fixed') {
    const center = projectAxial(effectiveViewportCenter.value);
    const viewportWidthUnits = Math.max(4, props.viewportWidthUnits);
    const viewportHeightUnits = viewportWidthUnits / Math.max(0.25, props.aspectRatio);
    return {
      minX: center.x - (viewportWidthUnits / 2),
      maxX: center.x + (viewportWidthUnits / 2),
      minY: center.y - (viewportHeightUnits / 2),
      maxY: center.y + (viewportHeightUnits / 2),
    };
  }

  const points = [
    ...props.terrainTiles.map((tile) => ({ q: tile.q, r: tile.r })),
    ...props.hotspots.map((hotspot) => ({ q: hotspot.q, r: hotspot.r })),
  ];

  if (points.length === 0) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  }

  const projected = points.map(projectAxial);
  const padding = props.terrainTiles.length > 0 ? 0.6 : 4;
  return {
    minX: Math.min(...projected.map((point) => point.x)) - padding,
    maxX: Math.max(...projected.map((point) => point.x)) + padding,
    minY: Math.min(...projected.map((point) => point.y)) - padding,
    maxY: Math.max(...projected.map((point) => point.y)) + padding,
  };
});

const positionedHotspots = computed(() => props.hotspots.map((hotspot) => ({
  ...hotspot,
  style: {
    ...getPointStyle(hotspot.q, hotspot.r),
    '--hotspot-color': hotspot.color ?? defaultHotspotColor(hotspot),
  },
})));

const layout = computed(() => {
  const bounds = projectedPoints.value;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const containerWidth = Math.max(0.1, props.aspectRatio);
  const scale = Math.min(containerWidth / width, 1 / height);
  const usedWidth = width * scale;
  const usedHeight = height * scale;

  return {
    bounds,
    containerWidth,
    scale,
    offsetX: (containerWidth - usedWidth) / 2,
    offsetY: (1 - usedHeight) / 2,
  };
});

const dragBounds = computed(() => {
  const points = [
    ...props.terrainTiles.map((tile) => ({ q: tile.q, r: tile.r })),
    ...props.hotspots.map((hotspot) => ({ q: hotspot.q, r: hotspot.r })),
  ];

  if (points.length === 0) {
    return null;
  }

  const projected = points.map(projectAxial);
  const padding = props.terrainTiles.length > 0 ? 0.6 : 4;

  return {
    minX: Math.min(...projected.map((point) => point.x)) - padding,
    maxX: Math.max(...projected.map((point) => point.x)) + padding,
    minY: Math.min(...projected.map((point) => point.y)) - padding,
    maxY: Math.max(...projected.map((point) => point.y)) + padding,
  };
});

const effectiveViewportCenter = computed(() => {
  const center = props.viewportCenter ?? { q: 0, r: 0 };
  const bounds = dragBounds.value;
  if (!bounds || props.layoutMode !== 'fixed') {
    return center;
  }

  const projectedCenter = projectAxial(center);
  const viewportWidthUnits = Math.max(4, props.viewportWidthUnits);
  const viewportHeightUnits = viewportWidthUnits / Math.max(0.25, props.aspectRatio);
  const halfWidth = viewportWidthUnits / 2;
  const halfHeight = viewportHeightUnits / 2;

  return projectedToAxial({
    x: clamp(
      projectedCenter.x,
      Math.min(bounds.minX + halfWidth, bounds.maxX - halfWidth),
      Math.max(bounds.minX + halfWidth, bounds.maxX - halfWidth),
    ),
    y: clamp(
      projectedCenter.y,
      Math.min(bounds.minY + halfHeight, bounds.maxY - halfHeight),
      Math.max(bounds.minY + halfHeight, bounds.maxY - halfHeight),
    ),
  });
});

function projectAxial(point: { q: number; r: number }) {
  return {
    x: point.q + point.r * 0.5,
    y: point.r * 0.866,
  };
}

function getPointStyle(q: number, r: number) {
  const currentLayout = layout.value;
  const bounds = currentLayout.bounds;
  const projected = projectAxial({ q, r });
  const x = currentLayout.offsetX + ((projected.x - bounds.minX) * currentLayout.scale);
  const y = currentLayout.offsetY + ((projected.y - bounds.minY) * currentLayout.scale);

  return {
    left: `${(x / currentLayout.containerWidth) * 100}%`,
    top: `${y * 100}%`,
  };
}

function defaultHotspotColor(hotspot: MiniMapHotspot) {
  switch (hotspot.kind) {
    case 'hero':
      return '#f8fafc';
    case 'settlement':
      return '#b98a35';
    case 'candidate':
    default:
      return '#4ade80';
  }
}

function projectedToAxial(point: { x: number; y: number }) {
  const r = point.y / 0.866;
  const q = point.x - (r * 0.5);
  return { q, r };
}

function handlePointerDown(event: PointerEvent) {
  if (!props.draggable || !rootEl.value) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (target?.closest('.world-minimap__hotspot')) {
    return;
  }

  const center = projectAxial(effectiveViewportCenter.value);
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startCenterX: center.x,
    startCenterY: center.y,
    moved: false,
  };
  isDragging.value = true;
  rootEl.value.setPointerCapture(event.pointerId);
  rootEl.value.addEventListener('pointermove', handlePointerMove);
  rootEl.value.addEventListener('pointerup', handlePointerUp);
  rootEl.value.addEventListener('pointercancel', handlePointerUp);
}

function handlePointerMove(event: PointerEvent) {
  if (!rootEl.value || !dragState.value || event.pointerId !== dragState.value.pointerId) {
    return;
  }

  const rect = rootEl.value.getBoundingClientRect();
  const deltaX = event.clientX - dragState.value.startX;
  const deltaY = event.clientY - dragState.value.startY;
  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    dragState.value.moved = true;
  }

  const viewportWidthUnits = Math.max(4, props.viewportWidthUnits);
  const viewportHeightUnits = viewportWidthUnits / Math.max(0.25, props.aspectRatio);
  const unclampedCenter = {
    x: dragState.value.startCenterX - ((deltaX / Math.max(1, rect.width)) * viewportWidthUnits),
    y: dragState.value.startCenterY - ((deltaY / Math.max(1, rect.height)) * viewportHeightUnits),
  };
  const bounds = dragBounds.value;
  const halfWidth = viewportWidthUnits / 2;
  const halfHeight = viewportHeightUnits / 2;
  const clampedProjectedCenter = bounds
    ? {
        x: clamp(
          unclampedCenter.x,
          Math.min(bounds.minX + halfWidth, bounds.maxX - halfWidth),
          Math.max(bounds.minX + halfWidth, bounds.maxX - halfWidth),
        ),
        y: clamp(
          unclampedCenter.y,
          Math.min(bounds.minY + halfHeight, bounds.maxY - halfHeight),
          Math.max(bounds.minY + halfHeight, bounds.maxY - halfHeight),
        ),
      }
    : unclampedCenter;
  const nextCenter = projectedToAxial(clampedProjectedCenter);

  emit('viewport-center-change', nextCenter);
}

function handlePointerUp(event: PointerEvent) {
  if (!rootEl.value || !dragState.value || event.pointerId !== dragState.value.pointerId) {
    return;
  }

  rootEl.value.releasePointerCapture(event.pointerId);
  rootEl.value.removeEventListener('pointermove', handlePointerMove);
  rootEl.value.removeEventListener('pointerup', handlePointerUp);
  rootEl.value.removeEventListener('pointercancel', handlePointerUp);
  dragState.value = null;
  isDragging.value = false;
}

const TERRAIN_COLORS: Record<TerrainKey, string> = {
  plains: '#67a94a',
  forest: '#2f7138',
  grain: '#b8b85b',
  dirt: '#9b6a40',
  snow: '#d8eaf0',
  dessert: '#d5ae5e',
  water: '#49abc9',
  mountain: '#68727f',
  vulcano: '#5a3840',
  towncenter: '#d79842',
};

let resizeObserver: ResizeObserver | null = null;
let drawFrame = 0;

function scheduleDraw() {
  if (drawFrame) {
    cancelAnimationFrame(drawFrame);
  }

  drawFrame = requestAnimationFrame(() => {
    drawFrame = 0;
    drawTerrain();
  });
}

function getHexMetrics() {
  const currentLayout = layout.value;
  const hexWidthUnits = 1.03 * currentLayout.scale;
  const hexHeightUnits = hexWidthUnits / 0.8660254037844386;
  return { hexWidthUnits, hexHeightUnits };
}

function getCanvasPoint(q: number, r: number, widthPx: number, heightPx: number) {
  const currentLayout = layout.value;
  const bounds = currentLayout.bounds;
  const projected = projectAxial({ q, r });
  const xUnits = currentLayout.offsetX + ((projected.x - bounds.minX) * currentLayout.scale);
  const yUnits = currentLayout.offsetY + ((projected.y - bounds.minY) * currentLayout.scale);

  return {
    x: (xUnits / currentLayout.containerWidth) * widthPx,
    y: yUnits * heightPx,
  };
}

function drawHexPath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  widthPx: number,
) {
  const radius = widthPx / Math.sqrt(3);
  ctx.beginPath();
  for (let index = 0; index < 6; index++) {
    const angle = ((60 * index) - 30) * (Math.PI / 180);
    const x = centerX + (radius * Math.cos(angle));
    const y = centerY + (radius * Math.sin(angle));
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function drawTerrain() {
  const canvas = canvasEl.value;
  const root = rootEl.value;
  if (!canvas || !root) {
    return;
  }

  const rect = root.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const { hexWidthUnits } = getHexMetrics();
  const hexWidthPx = (hexWidthUnits / layout.value.containerWidth) * width;

  for (const tile of props.terrainTiles) {
    const point = getCanvasPoint(tile.q, tile.r, width, height);
    drawHexPath(ctx, point.x, point.y, hexWidthPx);
    ctx.fillStyle = TERRAIN_COLORS[tile.terrain] ?? '#67a94a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(7, 23, 27, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

onMounted(() => {
  nextTick(() => {
    scheduleDraw();
    if (rootEl.value && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        scheduleDraw();
      });
      resizeObserver.observe(rootEl.value);
    }
  });
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (drawFrame) {
    cancelAnimationFrame(drawFrame);
    drawFrame = 0;
  }
});

watch(
  () => [
    props.terrainTiles,
    props.aspectRatio,
    props.layoutMode,
    props.viewportCenter?.q ?? null,
    props.viewportCenter?.r ?? null,
    props.viewportWidthUnits,
    layout.value.scale,
    layout.value.offsetX,
    layout.value.offsetY,
  ],
  () => {
    scheduleDraw();
  },
  { deep: true },
);
</script>

<style scoped>
.world-minimap {
  position: relative;
  aspect-ratio: var(--world-minimap-aspect, 1);
  min-height: 24rem;
  overflow: hidden;
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.04), transparent 52%),
    linear-gradient(135deg, rgba(10, 55, 68, 0.96), rgba(14, 47, 45, 0.92)),
    #11353a;
  box-shadow: inset 0 0 0 1px rgba(255, 244, 207, 0.04);
}

.world-minimap--draggable {
  cursor: grab;
}

.world-minimap--dragging {
  cursor: grabbing;
}

.world-minimap--compact {
  min-height: auto;
}

.world-minimap::before,
.world-minimap::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.world-minimap::before {
  z-index: 1;
  background:
    linear-gradient(rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    radial-gradient(circle at center, transparent 58%, rgba(7, 22, 27, 0.18) 100%);
}

.world-minimap::after {
  z-index: 3;
  box-shadow: inset 0 0 42px rgba(5, 18, 22, 0.22);
}

.world-minimap__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.world-minimap__hotspot {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
}

.world-minimap__hotspot span {
  border-radius: 999px;
  background: var(--hotspot-color, #4ade80);
  border: 2px solid rgba(255, 255, 255, 0.95);
}

.world-minimap__hotspot--candidate {
  width: 1.55rem;
  height: 1.55rem;
}

.world-minimap__hotspot--candidate span {
  width: 0.9rem;
  height: 0.9rem;
  box-shadow:
    0 0 0 7px color-mix(in srgb, var(--hotspot-color, #4ade80) 18%, transparent),
    0 4px 10px rgba(0, 0, 0, 0.28);
}

.world-minimap__hotspot--settlement {
  width: 1rem;
  height: 1rem;
}

.world-minimap__hotspot--settlement span {
  width: 0.88rem;
  height: 0.88rem;
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--hotspot-color, #b98a35) 30%, transparent),
    0 2px 8px rgba(0, 0, 0, 0.28);
}

.world-minimap__hotspot--hero {
  width: 1.15rem;
  height: 1.15rem;
}

.world-minimap__hotspot--hero span {
  width: 0.62rem;
  height: 0.62rem;
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--hotspot-color, #f8fafc) 18%, transparent),
    0 3px 8px rgba(0, 0, 0, 0.26);
}

.world-minimap__hotspot--home { --hotspot-color: #fb923c; }
.world-minimap__hotspot--near { --hotspot-color: #4ade80; }
.world-minimap__hotspot--frontier { --hotspot-color: #38bdf8; }
.world-minimap__hotspot--remote { --hotspot-color: #facc15; }
.world-minimap__hotspot--settlement { --hotspot-color: #b98a35; }
.world-minimap__hotspot--hero { --hotspot-color: #f8fafc; }

.world-minimap__hotspot--selected span {
  outline: 3px solid rgba(255, 255, 255, 0.94);
  outline-offset: 3px;
}

.world-minimap__hotspot--disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
