<template>
  <div ref="container" class="w-full h-full relative map-container">
    <canvas ref="canvas" class="absolute inset-0"/>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import type {Tile} from '../core/world';
import type {Hero} from '../store/heroStore';
import {selectHero, selectedHeroId, heroes, updateHeroFacing, startHeroMovement, updateHeroMovements, getSelectedHero} from '../store/heroStore';
import {createPointerHandlers, dragged, dragging, keyDown, keyUp, stopCameraAnimation} from '../core/camera';
import {isPaused} from '../store/uiStore';
import {HexMapService} from '../core/HexMapService';
import {detachHeroFromCurrentTask} from "../store/taskStore.ts";

const emit = defineEmits<{ (e: 'tile-click', tile: Tile): void; (e: 'tile-doubleclick', tile: Tile): void; (e: 'hero-click', hero: Hero): void }>();

const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const mouseDown = ref(false);
const {pointerDown, pointerMove, pointerUp, pointerCancel} = createPointerHandlers(mouseDown);

// Hover & path reactive state
const hoveredTile = shallowRef<Tile | null>(null);
const hoveredHero = shallowRef<Hero | null>(null);
const pathCoords = shallowRef<{q:number;r:number}[]>([]);

// Service instance
const service = new HexMapService();
let rafId: number | null = null;
let lastClickTime = 0;

function animationLoop() {
  const now = performance.now();
  // advance hero movements
  updateHeroMovements(now);
  // recompute path preview for selected hero (if moving use remaining path from movement state)
  if (selectedHeroId.value && hoveredTile.value) {
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
  } else {
    lastClickTime = now;
    hoveredTile.value = tile;
    emit('tile-click', tile);
    // If a hero is selected, start movement along path to tile
    const sel = getSelectedHero();
    if (sel) {
      const path = service.findWalkablePath(sel.q, sel.r, tile.q, tile.r);
      if (path.length) {
        detachHeroFromCurrentTask(sel);
        startHeroMovement(sel.id, path, {q: tile.q, r: tile.r}, !tile.discovered ? 'explore' : null);
        // path preview should show planned path until movement starts
        pathCoords.value = path;
      }
    } else {
      // No hero selected -> deselect explicitly
      selectHero(null, false);
    }
  }
  updatePath();
}

function updateHover(e: PointerEvent) {
  if (isPaused() || dragging) {
    hoveredTile.value = null; hoveredHero.value = null; pathCoords.value = [];
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
  let facing: 'up'|'down'|'left'|'right' = hero.facing;
  if (dr < 0) facing = 'up';
  else if (dr > 0) facing = 'down';
  else if (dq > 0) facing = 'right';
  else if (dq < 0) facing = 'left';
  if (facing !== hero.facing) updateHeroFacing(hero.id, facing);
});

onMounted(async () => {
  if (!canvas.value || !container.value) return;
  await service.init(canvas.value, container.value);
  window.addEventListener('resize', () => service.resize());
  window.addEventListener('orientationchange', () => service.resize());
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  const el = container.value;
  if (el) {
    el.addEventListener('pointerdown', pointerDown, {passive:false});
    el.addEventListener('pointermove', (ev) => { pointerMove(ev); updateHover(ev as PointerEvent); }, {passive:false});
    el.addEventListener('pointerup', (ev) => { pointerUp(); handleClick(ev as PointerEvent); updateHover(ev as PointerEvent); }, {passive:false});
    el.addEventListener('pointercancel', () => { pointerCancel(); }, {passive:false});
    el.addEventListener('pointerleave', () => { pointerUp(); }, {passive:false});
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
</script>

<style scoped>
.map-container { touch-action: none; -webkit-user-select: none; user-select: none; overscroll-behavior: contain; }
</style>
