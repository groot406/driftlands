<template>
  <div ref="container" class="w-full h-full relative map-container">
    <canvas ref="canvas" class="absolute inset-0 pixel-art"/>
    <transition name="fade-menu" mode="out-in" v-show="showTaskMenu">
      <TaskMenu :containerSize="containerSize" :tile="taskMenuTile" :availableTasks="availableTasks"
                :visible="showTaskMenu"
                @close="showTaskMenu=false; taskMenuTile=null; closeWindow(WINDOW_IDS.TASK_MENU)"
                @hover="(task) => hoveredTask = task"
      />
    </transition>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import type {Tile} from '../core/world';
import {ensureTileExists, tileIndex} from '../core/world';
import type {Hero} from '../store/heroStore';
import {
  getSelectedHero,
  heroes,
  selectedHeroId,
  selectHero,
  startHeroMovement,
  updateHeroFacing,
  updateHeroMovements
} from '../store/heroStore';
import TaskMenu from './TaskMenu.vue';
import {
  createPointerHandlers,
  dragged,
  dragging,
  isKeyboardNavigating,
  keyDown,
  keyUp,
  stopCameraAnimation
} from '../core/camera';
import {isPaused} from '../store/uiStore';
import {HexMapService} from '../core/HexMapService';
import { openWindow, closeWindow, WINDOW_IDS } from '../core/windowManager';
import {detachHeroFromCurrentTask} from '../store/taskStore';
import {getAvailableTasks, type TaskDefinition} from "../core/tasks.ts";

const emit = defineEmits<{
  (e: 'tile-click', tile: Tile): void;
  (e: 'tile-doubleclick', tile: Tile): void;
  (e: 'hero-click', hero: Hero): void
}>();

const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const mouseDown = ref(false);
const {pointerDown, pointerMove, pointerUp, pointerCancel} = createPointerHandlers(mouseDown);

// Hover & path reactive state
const hoveredTile = shallowRef<Tile | null>(null);
const hoveredHero = shallowRef<Hero | null>(null);
const pathCoords = shallowRef<{ q: number; r: number }[]>([]);

const availableTasks = ref<TaskDefinition[]>([]);
const showTaskMenu = ref(false);
const taskMenuTile = ref<Tile | null>(null);
const containerSize = ref({width: 0, height: 0});
const clusterBoundaryTiles = ref<Tile[]>([]); // boundary tiles for same-terrain cluster highlighting
const clusterTiles = ref<Set<string>>(new Set()); // all tiles in cluster (id set)
const hoveredTask = ref<TaskDefinition | null>(null);

// Service instance
const service = new HexMapService();

function onWindowResize() {
  service.resize();
  updateContainerSize();
}

function onOrientationChange() {
  service.resize();
  updateContainerSize();
}

let rafId: number | null = null;
let lastClickTime = 0;
let lastMenuOpenTime = 0; // cooldown to avoid immediate close after open on mobile short taps

// Frame rate limiting for graphics performance
let lastDrawTime = 0;
const TARGET_FPS = 60; // Reduce from 60 FPS to 30 FPS to reduce graphics load
const FRAME_INTERVAL = 1000 / TARGET_FPS;

function animationLoop() {
  const now = performance.now();
  const deltaTime = now - lastDrawTime;

  // Always update hero movements (this is important for smooth movement)
  updateHeroMovements(now);

  // Limit drawing to 30 FPS to reduce graphics overhead
  if (deltaTime >= FRAME_INTERVAL) {
    lastDrawTime = now;

    if (isKeyboardNavigating()) {
      if (hoveredTile.value) hoveredTile.value = null;
      if (pathCoords.value.length) pathCoords.value = [];
    } else if (selectedHeroId.value && hoveredTile.value) {
      pathCoords.value = service.updatePath(selectedHeroId.value, hoveredTile.value);
    }

    service.draw({
      hoveredTile: hoveredTile.value,
      hoveredHero: hoveredHero.value,
      pathCoords: pathCoords.value,
      taskMenuTile: taskMenuTile.value,
      clusterBoundaryTiles: clusterBoundaryTiles.value,
      clusterTileIds: clusterTiles.value,
    });
  }

  rafId = requestAnimationFrame(animationLoop);
}

function updatePath() {
  pathCoords.value = service.updatePath(selectedHeroId.value, hoveredTile.value);
}

function handleClick(e: PointerEvent) {
  if (e.type !== 'pointerup') return;

  // If menu just opened, ignore further taps briefly to avoid flicker-close
  const nowTs = performance.now();
  if (showTaskMenu.value && (nowTs - lastMenuOpenTime) < 250) {
    return;
  } else if (showTaskMenu.value) {
    // If menu is open, close it on any click outside
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
    return;
  }

  if (isPaused()) return;
  if (dragged) return;

  const hero = service.pickHero(e.clientX, e.clientY);
  if (hero) {
    selectHero(hero, false);
    hoveredHero.value = hero;
    emit('hero-click', hero);
    return;
  }

  const tile = service.pickTile(e.clientX, e.clientY);
  if (!tile) return;

  console.log('Clicked tile', tile);

  const selHero = getSelectedHero();

  const now = performance.now();
  const doubleClick = (now - lastClickTime) < 300;
  lastClickTime = doubleClick ? 0 : now;
  hoveredTile.value = tile;
  if (doubleClick) emit('tile-doubleclick', tile); else emit('tile-click', tile);

  if (!selHero) {
    selectHero(null, false);
    return;
  }

  // Refresh available tasks for this tile & hero
  availableTasks.value = getAvailableTasks(tile, selHero);

  // Task menu opening logic (no toggle auto-close; only explicit close or selecting other tile without tasks)
  if (tile.discovered && availableTasks.value.length > 0) {
    // If menu already open on this tile, keep it open (do nothing)
    if (!(showTaskMenu.value && taskMenuTile.value === tile)) {
      taskMenuTile.value = tile;
      showTaskMenu.value = true;
      openWindow(WINDOW_IDS.TASK_MENU);
      lastMenuOpenTime = performance.now(); // start cooldown
    }

    // Skip movement logic while menu open
    return;
  } else if (showTaskMenu.value) {
    // Close if switching to a tile without tasks
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
  }

  let path = service.findWalkablePath(selHero.q, selHero.r, tile.q, tile.r);
  if (path.length) {
    detachHeroFromCurrentTask(selHero);
    startHeroMovement(selHero.id, path, {q: tile.q, r: tile.r}, !tile.discovered ? 'explore' : undefined);
    pathCoords.value = path;
  }
  updatePath();
}

function updateHover(e: PointerEvent) {
  if (isPaused() || dragging || showTaskMenu.value) {
    hoveredTile.value = null;
    hoveredHero.value = null;
    pathCoords.value = [];
    return;
  }
  const hero = service.pickHero(e.clientX, e.clientY);
  if (hero) {
    hoveredHero.value = hero;
    hoveredTile.value = null;
    pathCoords.value = [];
    return;
  }
  hoveredHero.value = null;
  const tile = service.pickTile(e.clientX, e.clientY);
  if (tile !== hoveredTile.value) hoveredTile.value = tile;
  updatePath();
}

watch(selectedHeroId, () => updatePath());

// Adjust facing: look towards first step in current path preview (if any), rather than final hovered tile.
watch([pathCoords, selectedHeroId], () => {
  if (!selectedHeroId.value) return;
  const hero = heroes.find(h => h.id === selectedHeroId.value);
  if (!hero || hero.movement) return; // do not override while moving
  const first = pathCoords.value[0];
  if (!first) return; // no path -> keep current facing
  const dq = first.q - hero.q;
  const dr = first.r - hero.r;
  if (dq === 0 && dr === 0) return;
  let facing: 'up' | 'down' | 'left' | 'right' = hero.facing;
  if (dr < 0) facing = 'up';
  else if (dr > 0) facing = 'down';
  else if (dq > 0) facing = 'right';
  else if (dq < 0) facing = 'left';
  if (facing !== hero.facing) updateHeroFacing(hero.id, facing);
});

function updateContainerSize() {
  const el = container.value;
  if (!el) return;
  containerSize.value = {width: el.clientWidth, height: el.clientHeight};
}

function computeTerrainCluster(base: Tile | null) {

  clusterBoundaryTiles.value = [];
  clusterTiles.value.clear();

  if (!base || !base.discovered || !base.terrain) return;

  // only if hoveredTask has chainAdjacentSameTerrain
  if (!hoveredTask.value) return;
  if (!hoveredTask.value.chainAdjacentSameTerrain) return;

  if (typeof hoveredTask.value.chainAdjacentSameTerrain === 'function') {
    if (!hoveredTask.value.chainAdjacentSameTerrain(base)) return;
  }

  const terrain = base.terrain;
  const maxSize = 500; // safety cap
  const queue: Tile[] = [base];
  const visited = new Set<string>();
  while (queue.length && visited.size < maxSize) {
    const t = queue.shift()!;
    if (!t.discovered || t.terrain !== terrain) continue;
    if (visited.has(t.id)) continue;
    visited.add(t.id);
    clusterTiles.value.add(t.id);
    const nm = t.neighbors ?? ensureTileExists(t.q, t.r).neighbors ?? undefined;
    if (nm) {
      for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        const nt = nm[side];
        if (nt.discovered && nt.terrain === terrain && !visited.has(nt.id)) queue.push(nt);
      }
    }
  }
  for (const id of clusterTiles.value) {
    const baseTile = tileIndex[id];
    if (!baseTile) continue;
    const nm = baseTile.neighbors ?? ensureTileExists(baseTile.q, baseTile.r).neighbors!;
    let isBoundary = false;
    for (const side of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
      const nt = nm[side];
      if (!nt.discovered || nt.terrain !== terrain || !clusterTiles.value.has(nt.id)) {
        isBoundary = true;
        break;
      }
    }
    if (isBoundary) clusterBoundaryTiles.value.push(baseTile);
  }
}

watch([taskMenuTile, hoveredTask], () => {
  // Recompute cluster when task menu tile changes
  computeTerrainCluster(taskMenuTile.value);
});

onMounted(async () => {
  if (!canvas.value || !container.value) return;

    // Pre-capture size so menus position correctly immediately
  updateContainerSize();
  await service.init(canvas.value, container.value);
  // Re-capture after init & next frame (handles potential layout shifts)
  updateContainerSize();
  requestAnimationFrame(updateContainerSize);
  // Ignore if modifier keys pressed to avoid interfering with shortcuts
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const el = container.value;

  if (el) {
    el.addEventListener('pointerdown', pointerDown, {passive: false});
    el.addEventListener('pointermove', (ev) => {
      pointerMove(ev);
      updateHover(ev as PointerEvent);
    }, {passive: false});
    el.addEventListener('pointerup', (ev) => {
      pointerUp();
      handleClick(ev as PointerEvent);
      // Skip hover update right after opening menu to avoid interfering state changes
      if (!showTaskMenu.value) updateHover(ev as PointerEvent);
    }, {passive: false});
    el.addEventListener('pointercancel', () => {
      pointerCancel();
    }, {passive: false});
    el.addEventListener('pointerleave', () => {
      pointerUp();
    }, {passive: false});
  }
  animationLoop();
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('orientationchange', onOrientationChange);
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
  service.destroy();
  stopCameraAnimation();
});

</script>

<style scoped>
.map-container {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain; /* existing */
}

.map-container canvas {
  filter: drop-shadow(0px 2px 5px rgba(0, 0, 0, 0.8)) drop-shadow(15px 35px 25px rgba(0, 0, 0, 0.4));
}
</style>
