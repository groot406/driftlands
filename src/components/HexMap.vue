<template>
  <div ref="container" class="w-full h-full relative map-container" @pointerdown="hideTaskBubble">
    <canvas ref="canvas" class="absolute inset-0"/>
    <transition name="fade-menu" mode="out-in">
      <TaskBubble :tile="taskBubbleTile" :show="showTaskBubble" :container-bounds="containerBounds" @close="hideTaskBubble" @started="onTaskStarted" :style="taskBubbleStyle" />
    </transition>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, shallowRef, watch, computed} from 'vue';
import type {Tile} from '../core/world';
import {ensureTileExists} from '../core/world';
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
import {
  createPointerHandlers,
  dragged,
  dragging,
  hexDistance,
  isKeyboardNavigating,
  keyDown,
  keyUp,
  stopCameraAnimation
} from '../core/camera';
import {isPaused} from '../store/uiStore';
import {HexMapService} from '../core/HexMapService';
import {detachHeroFromCurrentTask} from "../store/taskStore.ts";
import TaskBubble from './TaskBubble.vue';

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

const showTaskBubble = ref(false);
const taskBubbleTile = ref<Tile | null>(null);

const containerBounds = ref<{left:number;top:number}>({left:0,top:0});
const bubbleScreen = ref<{x:number;y:number}>({x:0,y:0});

// Service instance
const service = new HexMapService();
let rafId: number | null = null;
let lastClickTime = 0;

function animationLoop() {
  const now = performance.now();
  updateHeroMovements(now);

  if (isKeyboardNavigating()) {
    if (hoveredTile.value) hoveredTile.value = null;
    if (pathCoords.value.length) pathCoords.value = [];
  } else if (selectedHeroId.value && hoveredTile.value) {
    pathCoords.value = service.updatePath(selectedHeroId.value, hoveredTile.value);
  }
  service.draw({hoveredTile: hoveredTile.value, hoveredHero: hoveredHero.value, pathCoords: pathCoords.value});
  rafId = requestAnimationFrame(animationLoop);
}

function updatePath() {
  pathCoords.value = service.updatePath(selectedHeroId.value, hoveredTile.value);
}

function handleClick(e: PointerEvent) {
  if (isPaused()) return;
  if (dragged) return;
  if(showTaskBubble.value) return;

  const hero = service.pickHero(e.clientX, e.clientY);
  if (hero) {
    selectHero(hero, false);
    hoveredHero.value = hero;
    emit('hero-click', hero);
    return;
  }
  const tile = service.pickTile(e.clientX, e.clientY);
  if (!tile) return;
  const now = performance.now();
  if ((now - lastClickTime) < 300) {
    emit('tile-doubleclick', tile);
    lastClickTime = 0;
    // retain direct double-click chop option
    const sel = getSelectedHero();
    if (sel && tile.discovered) {
      if (tile.terrain === 'forest') {
        const path = service.findWalkablePath(sel.q, sel.r, tile.q, tile.r);
        if (path.length) {
          detachHeroFromCurrentTask(sel);
          startHeroMovement(sel.id, path, {q: tile.q, r: tile.r}, 'chopWood');
          hideTaskBubble();
        }
      } else if (tile.terrain === 'chopped_forest') {
        const path = service.findWalkablePath(sel.q, sel.r, tile.q, tile.r);
        if (path.length) {
          detachHeroFromCurrentTask(sel);
          startHeroMovement(sel.id, path, {q: tile.q, r: tile.r}, 'plantTrees');
          hideTaskBubble();
        }
      }
    }
  } else {
    lastClickTime = now;
    hoveredTile.value = tile;
    emit('tile-click', tile);
    // Show task bubble if forest OR chopped_forest tile discovered
    if (tile.discovered && (tile.terrain === 'forest' || tile.terrain === 'chopped_forest')) {
      taskBubbleTile.value = tile;
      showTaskBubble.value = true;
      // compute screen position
      if (container.value) {
        const rect = container.value.getBoundingClientRect();
        containerBounds.value = {left: rect.left, top: rect.top};
      }
      const center = service.getTileScreenCenter(tile.q, tile.r);
      bubbleScreen.value = center;
    } else {
      hideTaskBubble();
    }
    // movement logic (unchanged) if hero selected and not forest OR chopped_forest OR if bubble hidden
    const sel = getSelectedHero();
    if (sel && (!tile.discovered || (tile.terrain !== 'forest' && tile.terrain !== 'chopped_forest'))) {
      const path = service.findWalkablePath(sel.q, sel.r, tile.q, tile.r);
      if (path.length) {
        const originTile = ensureTileExists(sel.q, sel.r);
        const targetTile = ensureTileExists(tile.q, tile.r);
        if (!(originTile.discovered === false && targetTile.discovered === false) || (sel.prevPos && hexDistance(sel.prevPos, {q: tile.q, r: tile.r}) === 1)) {
          detachHeroFromCurrentTask(sel);
          startHeroMovement(sel.id, path, {q: tile.q, r: tile.r}, !tile.discovered ? 'explore' : undefined);
          pathCoords.value = path;
        }
      }
    }
    if (!sel) {
      selectHero(null, false);
    }
  }
  updatePath();
}

function updateHover(e: PointerEvent) {
  if (isPaused() || dragging) {
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

onMounted(async () => {
  if (!canvas.value || !container.value) return;
  await service.init(canvas.value, container.value);
  // Ignore if modifier keys pressed to avoid interfering with shortcuts
  window.addEventListener('orientationchange', () => service.resize());
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
      updateHover(ev as PointerEvent);
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
  window.removeEventListener('resize', () => service.resize());
  window.removeEventListener('orientationchange', () => service.resize());
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

function hideTaskBubble() {
  showTaskBubble.value = false;
  taskBubbleTile.value = null;
}

const taskBubbleStyle = computed(() => {
  return {
    position: 'absolute',
    left: `${bubbleScreen.value.x}px`,
    top: `${bubbleScreen.value.y}px`,
    transform: 'translate(-50%, -100%)'
  };
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
