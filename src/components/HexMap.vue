<template>
  <div ref="container" class="w-full h-full relative map-container" :class="{ 'map-container-lite': !useCanvasDropShadow }">
    <canvas ref="canvas" class="absolute inset-0 pixel-art"/>
    <transition name="fade-menu" mode="out-in" v-show="showTaskMenu">
      <TaskMenu :containerSize="containerSize" :tile="taskMenuTile" :availableTasks="availableTasks"
                :visible="showTaskMenu"
                @close="showTaskMenu=false; taskMenuTile=null; closeWindow(WINDOW_IDS.TASK_MENU)"
                @hover="handleTaskHover"
      />
    </transition>
    <div
      v-for="ping in renderedPings"
      :key="ping.id"
      class="coop-ping"
      :style="ping.style"
    >
      <div class="coop-ping-ring"></div>
      <div class="coop-ping-label">{{ ping.playerName }} · {{ ping.label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import {ensureTileExists, tileIndex} from '../core/world';
import {requestHeroMovement, updateHeroFacing, updateHeroMovements} from '../core/heroService';
import { heroes } from '../store/heroStore';
import TaskMenu from './TaskMenu.vue';
import {
  axialToPixel,
  camera,
  createPointerHandlers,
  dragged,
  dragging,
  isKeyboardNavigating,
  keyDown,
  keyUp,
  stopCameraAnimation
} from '../core/camera';
import {getSelectedHero, isPaused, selectedHeroId, selectHero,} from '../store/uiStore';
import {HexMapService} from '../core/HexMapService';
import {closeWindow, openWindow, WINDOW_IDS} from '../core/windowManager';
import {requestHeroClaim, sendCoopPing} from '../core/coopService';
import {currentPlayerId} from '../core/socket';
import {getAvailableTasks} from "../shared/tasks/tasks";
import {PathService} from "../core/PathService";
import type {Tile} from "../core/types/Tile.ts";
import type {Hero} from "../core/types/Hero.ts";
import type {TaskDefinition} from "../core/types/Task.ts";
import {isHitStopActive, resetGameFeelState, sampleGameFeelTime} from '../core/gameFeel';
import {addNotification} from '../store/notificationStore';
import {shouldUseCanvasDropShadow} from '../store/graphicsStore';
import {canControlHero, getActiveCoopPings, getHeroOwnerName, isHeroClaimedByOtherPlayer} from '../store/playerStore';

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
const pathPreviewHeroId = ref<string | null>(null);
const pathPreviewTargetKey = ref<string | null>(null);

const availableTasks = ref<TaskDefinition[]>([]);
const showTaskMenu = ref(false);
const taskMenuTile = ref<Tile | null>(null);
const containerSize = ref({width: 0, height: 0});
const clusterBoundaryTiles = ref<Tile[]>([]); // boundary tiles for same-terrain cluster highlighting
const clusterTiles = ref<Set<string>>(new Set()); // all tiles in cluster (id set)
const hoveredTask = ref<TaskDefinition | null>(null);

// Service instance
const service = new HexMapService();
const pathService = new PathService();
const useCanvasDropShadow = shouldUseCanvasDropShadow();
const renderedPings = computed(() => {
  const cameraPx = axialToPixel(camera.q, camera.r);
  const { width, height } = containerSize.value;

  return getActiveCoopPings.value.map((ping) => {
    const tilePx = axialToPixel(ping.q, ping.r);

    return {
      ...ping,
      style: {
        left: `${tilePx.x - cameraPx.x + (width / 2)}px`,
        top: `${tilePx.y - cameraPx.y + (height / 2)}px`,
      },
    };
  });
});

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

// Cap canvas rendering to the target FPS while movement simulation stays on real time.
let lastDrawTime = 0;
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

function clearPathPreview() {
  pathCoords.value = [];
  pathPreviewHeroId.value = null;
  pathPreviewTargetKey.value = null;
}

function handlePointerMoveEvent(ev: Event) {
  const pointerEvent = ev as PointerEvent;
  pointerMove(pointerEvent);
  updateHover(pointerEvent);
}

function handlePointerUpEvent(ev: Event) {
  const pointerEvent = ev as PointerEvent;
  pointerUp();
  handleClick(pointerEvent);
  if (!showTaskMenu.value) updateHover(pointerEvent);
}

function handlePointerCancelEvent() {
  pointerCancel();
}

function handlePointerLeaveEvent() {
  pointerUp();
}

function animationLoop() {
  const movementNowMs = Date.now();
  const effectNowMs = sampleGameFeelTime(movementNowMs);
  const deltaTime = movementNowMs - lastDrawTime;
  const hitStopActive = isHitStopActive(movementNowMs);

  // Movement must stay on wall-clock time; hit-stop only affects visual effects.
  updateHeroMovements(movementNowMs);

  // Cap rendering separately from movement updates.
  if (deltaTime >= FRAME_INTERVAL) {
    lastDrawTime = movementNowMs;

    if (!hitStopActive && isKeyboardNavigating()) {
      if (hoveredTile.value) hoveredTile.value = null;
      if (pathCoords.value.length) clearPathPreview();
    } else if (!hitStopActive && selectedHeroId.value && hoveredTile.value) {
      const selectedHero = getSelectedHero();
      if (selectedHero && canControlHero(selectedHero.id, currentPlayerId.value)) {
        pathCoords.value = service.updatePath(selectedHeroId.value, hoveredTile.value);
        pathPreviewHeroId.value = selectedHero.id;
        pathPreviewTargetKey.value = `${hoveredTile.value.q},${hoveredTile.value.r}`;
      } else {
        clearPathPreview();
      }
    }

    service.draw({
      hoveredTile: hoveredTile.value,
      hoveredHero: hoveredHero.value,
      pathCoords: pathCoords.value,
      taskMenuTile: taskMenuTile.value,
      clusterBoundaryTiles: clusterBoundaryTiles.value,
      clusterTileIds: clusterTiles.value,
    }, {
      effectNowMs,
      movementNowMs,
      perfNowMs: performance.now(),
    });
  }

  rafId = requestAnimationFrame(animationLoop);
}

function updatePath() {
  const hero = getSelectedHero();
  if (!hero || !canControlHero(hero.id, currentPlayerId.value)) {
    clearPathPreview();
    return;
  }

  pathCoords.value = service.updatePath(selectedHeroId.value, hoveredTile.value);
  pathPreviewHeroId.value = hero.id;
  pathPreviewTargetKey.value = hoveredTile.value ? `${hoveredTile.value.q},${hoveredTile.value.r}` : null;
}

function handleClick(e: PointerEvent) {
  if (e.type !== 'pointerup') return;

  // If menu just opened, ignore further taps briefly to avoid flicker-close
  const nowTs = Date.now();
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
    if (!isHeroClaimedByOtherPlayer(hero.id, currentPlayerId.value)) {
      requestHeroClaim(hero.id);
    }
    selectHero(hero, false);
    hoveredHero.value = hero;
    emit('hero-click', hero);
    return;
  }

  const tile = service.pickTile(e.clientX, e.clientY);
  if (!tile) return;
  const selHero = getSelectedHero();

  const now = Date.now();
  const doubleClick = (now - lastClickTime) < 300;
  lastClickTime = doubleClick ? 0 : now;
  hoveredTile.value = tile;
  if (doubleClick) emit('tile-doubleclick', tile); else emit('tile-click', tile);

  if (!selHero) {
    selectHero(null, false);
    return;
  }

  if (!canControlHero(selHero.id, currentPlayerId.value)) {
    addNotification({
      type: 'coop_state',
      title: `${selHero.name} is occupied`,
      message: `${getHeroOwnerName(selHero.id) ?? 'Another player'} has claimed this hero.`,
      duration: 3000,
    });
    clearPathPreview();
    return;
  }

  if (!tile.discovered) {
    const path = service.updatePath(selHero.id, tile).slice();
    pathCoords.value = path;
    pathPreviewHeroId.value = selHero.id;
    pathPreviewTargetKey.value = `${tile.q},${tile.r}`;

    if (path.length) {
      requestHeroMovement(selHero.id, path, tile, 'explore');
    }

    updatePath();
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
      lastMenuOpenTime = Date.now(); // start cooldown
    }

    // Skip movement logic while menu open
    return;
  } else if (showTaskMenu.value) {
    // Close if switching to a tile without tasks
    showTaskMenu.value = false;
    taskMenuTile.value = null;
    closeWindow(WINDOW_IDS.TASK_MENU);
  }

  const previewKey = `${tile.q},${tile.r}`;
  const canReusePreviewPath =
    pathPreviewHeroId.value === selHero.id &&
    pathPreviewTargetKey.value === previewKey &&
    pathCoords.value.length > 0 &&
    pathCoords.value[pathCoords.value.length - 1]?.q === tile.q &&
    pathCoords.value[pathCoords.value.length - 1]?.r === tile.r;

  const path = canReusePreviewPath
    ? pathCoords.value.slice()
    : pathService.findWalkablePath(selHero.q, selHero.r, tile.q, tile.r);

  if (path.length) {
    requestHeroMovement(selHero.id, path, tile, !tile.discovered ? 'explore' : undefined);
  }
  updatePath();
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  if (isPaused()) return;

  const tile = service.pickTile(e.clientX, e.clientY);
  if (!tile) return;

  const selectedHero = getSelectedHero();
  const heroId = selectedHero && canControlHero(selectedHero.id, currentPlayerId.value)
    ? selectedHero.id
    : undefined;
  const kind = e.shiftKey ? 'scout' : e.altKey ? 'gather' : 'assist';

  sendCoopPing(kind, { q: tile.q, r: tile.r }, heroId);
}

function updateHover(e: PointerEvent) {
  if (isPaused() || dragging || showTaskMenu.value) {
    hoveredTile.value = null;
    hoveredHero.value = null;
    clearPathPreview();
    return;
  }
  const hero = service.pickHero(e.clientX, e.clientY);
  if (hero) {
    hoveredHero.value = hero;
    hoveredTile.value = null;
    clearPathPreview();
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

function handleTaskHover(task: TaskDefinition | null) {
  hoveredTask.value = task;
}

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
    el.addEventListener('pointermove', handlePointerMoveEvent, {passive: false});
    el.addEventListener('pointerup', handlePointerUpEvent, {passive: false});
    el.addEventListener('pointercancel', handlePointerCancelEvent, {passive: false});
    el.addEventListener('pointerleave', handlePointerLeaveEvent, {passive: false});
    el.addEventListener('contextmenu', handleContextMenu, {passive: false});
  }
  if (rafId) cancelAnimationFrame(rafId);
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
    el.removeEventListener('pointermove', handlePointerMoveEvent as any);
    el.removeEventListener('pointerup', handlePointerUpEvent as any);
    el.removeEventListener('pointercancel', handlePointerCancelEvent as any);
    el.removeEventListener('pointerleave', handlePointerLeaveEvent as any);
    el.removeEventListener('contextmenu', handleContextMenu as any);
  }
  resetGameFeelState();
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

.map-container-lite canvas {
  filter: none;
}

.coop-ping {
  position: absolute;
  transform: translate(-50%, -130%);
  pointer-events: none;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.coop-ping-ring {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid rgba(103, 232, 249, 0.95);
  background: rgba(12, 74, 110, 0.45);
  box-shadow: 0 0 0 0 rgba(103, 232, 249, 0.55);
  animation: coop-ping-pulse 1.1s ease-out infinite;
}

.coop-ping-label {
  white-space: nowrap;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(103, 232, 249, 0.28);
  color: rgb(207, 250, 254);
  font-size: 0.67rem;
  letter-spacing: 0.04em;
}

@keyframes coop-ping-pulse {
  0% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 rgba(103, 232, 249, 0.55);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 16px rgba(103, 232, 249, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(103, 232, 249, 0);
  }
}
</style>
