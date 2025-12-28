<template>
  <!-- Only render when visible and tile provided -->
  <div v-if="tile" class="task-overlay" @pointerdown.stop.prevent @pointerup.stop :style="menuStyle">
    <div class="task-container flex flex-row items-center justify-center gap-6">
      <!-- Center hex (close) -->
      <div class="hex-btn hex-center opacity-70 hover:opacity-100" @click.stop.prevent="close" title="Close">
        ✕
      </div>
      <!-- Task options around -->
      <div class="relative left-16">
        <transition-group name="fade-task" tag="div">
          <div v-for="(t, idx) in availableTasks"
               class="bg-slate-800/50 backdrop-blur-sm  px-3 mb-1.5  hover:bg-slate-900/60 shadow-md rounded-full  w-max  text-white drop-shadow-md left-4 pointer-events-auto cursor-pointer relative text-sm p-1.5  text-center flex items-center"
               :key="idx"
               @click="selectTask(t)"
               @mouseover="hoverTask(t)"
               @mouseleave="unHoverTask(t)"
               :title="t.label">
            <span class="label">{{ t.label }}</span>
          </div>
        </transition-group>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import {ref, computed, onUnmounted, watch} from 'vue';
import type {Tile} from '../core/world';
import {getSelectedHero, persistHeroes, requestHeroMovement} from '../store/heroStore';
import {detachHeroFromCurrentTask, getTaskByTile, joinTask, startTask} from '../store/taskStore';
import {PathService} from '../core/PathService';
import type {TaskDefinition} from '../core/tasks';
import {axialToPixel, camera} from '../core/camera';
import { isWindowActive, WINDOW_IDS } from '../core/windowManager';

interface Props {
  tile: Tile | null;
  availableTasks: TaskDefinition[];
  containerSize?: { width: number; height: number };
  visible?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'started', type: string, tile: Tile): void;
  (e: 'hover', task: null|TaskDefinition ): void;
}>();

const pathService = new PathService();

function close() {
  emit('close');
}

function selectTask(def: TaskDefinition) {
  if (!props.tile) return;
  const hero = getSelectedHero();
  if (!hero) return;

  if (hero.q === props.tile.q && hero.r === props.tile.r) {
    const existing = getTaskByTile(props.tile.id, def.key);
    if (!existing) {
      const created = startTask(props.tile, def.key, hero);
      if (created) emit('started', def.key, props.tile);
    } else {
      joinTask(existing.id, hero);
      emit('started', def.key, props.tile);
    }
  } else {
    const path = pathService.findWalkablePath(hero.q, hero.r, props.tile.q, props.tile.r);
    if (path.length) {
      detachHeroFromCurrentTask(hero);
      requestHeroMovement(hero.id, path, props.tile, def.key);
      emit('started', def.key, props.tile);
    }
  }
  persistHeroes()
  close();
}

// Accurate menu positioning using camera + container center (reactive)
const menuStyle = computed(() => {
  if (!props.tile) return {};
  const camPx = axialToPixel(camera.q, camera.r);
  const tilePx = axialToPixel(props.tile.q, props.tile.r);
  const w = props.containerSize?.width ?? 0;
  const h = props.containerSize?.height ?? 0;

  // Fallback: if width/height not yet known, defer centering by using 0 (will correct next tick) and add safe translation only after non-zero.
  const cx = w > 0 ? w / 2 : 0;
  const cy = h > 0 ? h / 2 : 0;
  const x = tilePx.x - camPx.x + cx;
  const y = tilePx.y - camPx.y + cy;
  return {
    position: 'absolute',
    left: x + 'px',
    top: y + 'px',
    transform: 'translate(-50%, -50%)'
  } as const;
});

const hoveredTask = ref<TaskDefinition | null>(null);

function hoverTask(t: TaskDefinition) {
  hoveredTask.value = t;
  emit('hover', hoveredTask.value);
}

function unHoverTask(t: TaskDefinition) {
  if (hoveredTask.value === t) {
    hoveredTask.value = null;
    emit('hover', hoveredTask.value);
  }
}

// Handle Escape key to close task menu
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isWindowActive(WINDOW_IDS.TASK_MENU)) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

// Track if event listener is currently active
let listenerActive = false;

// Watch visibility and manage event listener accordingly
watch(() => props.visible, (isVisible) => {
  if (isVisible && !listenerActive) {
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
  } else if (!isVisible && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
}, { immediate: true });

// Cleanup on unmount
onUnmounted(() => {
  if (listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
  }
});

</script>

<style scoped>
.task-overlay {
  position: absolute;
  /* removed inset:0 so left/top from style can position correctly */
  pointer-events: none; /* allow map events except on ring */
  z-index: 40; /* above canvas */
}

.task-container {
  position: relative; /* now children positioned relative to center */
  width: 0; /* size determined by children */
  height: 0;
  pointer-events: none;
}

.hex-btn {
  position: absolute;
  width: 79px;
  height: 70px;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  pointer-events: auto; /* re-enable interaction */
  transition: background .15s, transform .15s, border-color .15s;
}

.hex-center {
  width: 79px;
  height: 70px;
  left: -41px; /* center at 0,0 */
  top: -36px;
}

</style>
