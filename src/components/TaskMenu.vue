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
          <div v-for="t in availableTasks" class="bg-slate-800/50 backdrop-blur-sm  px-3 mb-1.5  hover:bg-slate-900/60 shadow-md rounded-full  w-max  text-white drop-shadow-md left-4 pointer-events-auto cursor-pointer relative text-sm p-1.5  text-center flex items-center"
               @click="selectTask(t)"
               :title="t.label">
            <span class="label">{{ t.label }}</span>
          </div>
        </transition-group>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import type {Tile} from '../core/world';
import {getSelectedHero, startHeroMovement} from '../store/heroStore';
import {detachHeroFromCurrentTask} from '../store/taskStore';
import {startTask, getTaskByTile, joinTask} from '../store/taskStore';
import {HexMapService} from '../core/HexMapService';
import type {TaskDefinition} from '../core/tasks';
import {camera, axialToPixel} from '../core/camera';

interface Props {
  tile: Tile | null;
  availableTasks: TaskDefinition[];
  containerSize?: { width: number; height: number };
}
const props = defineProps<Props>();
const emit = defineEmits<{(e:'close'):void;(e:'started', type:string, tile:Tile):void}>();

const service = new HexMapService();

function close() { emit('close'); }

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
    const path = service.findWalkablePath(hero.q, hero.r, props.tile.q, props.tile.r);
    if (path.length) {
      detachHeroFromCurrentTask(hero);
      startHeroMovement(hero.id, path, {q: props.tile.q, r: props.tile.r}, def.key);
      emit('started', def.key, props.tile);
    }
  }
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
