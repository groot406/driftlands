<template>
  <div v-if="visible" class="absolute z-30" :style="style" @pointerdown.stop @click.stop>
    <div class="flex flex-col gap-2 backdrop-blur-md rounded-lg bg-slate-800/70 border border-slate-500 shadow-lg p-2 min-w-[140px]">
      <div class="text-xs font-semibold text-slate-200 flex items-center gap-2">
        <span v-if="terrain==='forest'" class="px-2 py-0.5 rounded bg-green-700/40 text-green-200">Forest</span>
        <span v-else class="px-2 py-0.5 rounded bg-slate-600/50">{{ terrain }}</span>
        <button class="ml-auto text-slate-400 hover:text-slate-200" @click="close">✕</button>
      </div>
      <div class="flex flex-col gap-1">
        <div v-if="carryingBlocked" class="text-[11px] text-amber-300 font-medium">Unload wood first (plains or towncenter)</div>
        <button v-else-if="canChop" @click="startChop" class="task-btn">
          Chop Wood
        </button>
        <button v-else-if="canPlant" @click="startPlant" class="task-btn bg-emerald-600 hover:bg-emerald-500 border-emerald-700">
          Plant Trees
        </button>
        <div v-else-if="!canChop && !canPlant" class="text-[11px] text-slate-400 italic">No actions available</div>
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

interface Props {
  tile: Tile | null;
  show: boolean;
  containerBounds: {left:number;top:number};
}
const props = defineProps<Props>();
const emit = defineEmits<{(e:'close'):void;(e:'started', type:string, tile:Tile):void}>();

const service = new HexMapService();

const terrain = computed(() => props.tile?.terrain || 'unknown');
const visible = computed(() => props.show && !!props.tile);
const canChop = computed(() => props.tile?.terrain === 'forest');
const canPlant = computed(() => props.tile?.terrain === 'chopped_forest');
const carryingBlocked = computed(() => {
  const hero = getSelectedHero();
  return !!hero?.carryingWood;
});

function startChop() {
  const tile = props.tile;
  if (!tile) return;
  const hero = getSelectedHero();
  if (!hero) return;
  // If hero already stands on tile, start or join task immediately.
  if (hero.q === tile.q && hero.r === tile.r) {
    detachHeroFromCurrentTask(hero);
    const existing = getTaskByTile(tile.id, 'chopWood');
    if (!existing) {
      startTask(tile, 'chopWood', hero);
    } else if (existing.active && !existing.completedMs) {
      joinTask(existing.id, hero);
    }
    emit('started', 'chopWood', tile);
    emit('close');
    return;
  }
  const path = service.findWalkablePath(hero.q, hero.r, tile.q, tile.r);
  if (!path.length) return; // keep guard for unreachable tiles
  detachHeroFromCurrentTask(hero);
  startHeroMovement(hero.id, path, {q: tile.q, r: tile.r}, 'chopWood');
  emit('started', 'chopWood', tile);
  emit('close');
}
function startPlant() {
  const tile = props.tile;
  if (!tile) return;
  const hero = getSelectedHero();
  if (!hero) return;
  if (hero.q === tile.q && hero.r === tile.r) {
    detachHeroFromCurrentTask(hero);
    const existing = getTaskByTile(tile.id, 'plantTrees');
    if (!existing) {
      startTask(tile, 'plantTrees', hero);
    } else if (existing.active && !existing.completedMs) {
      joinTask(existing.id, hero);
    }
    emit('started', 'plantTrees', tile);
    emit('close');
    return;
  }
  const path = service.findWalkablePath(hero.q, hero.r, tile.q, tile.r);
  if (!path.length) return;
  detachHeroFromCurrentTask(hero);
  startHeroMovement(hero.id, path, {q: tile.q, r: tile.r}, 'plantTrees');
  emit('started', 'plantTrees', tile);
  emit('close');
}
function close() { emit('close'); }

// Position bubble near tile center (convert axial to pixel via camera math indirectly by letting parent compute; here just offset placeholder)
const style = computed(() => {
  // Parent passes containerBounds; we rely on absolute positioning set by parent with transform style injection
  return {
    pointerEvents: 'auto'
  } as Record<string,string>;
});
</script>
<style scoped>
.task-btn { @apply text-xs font-medium px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white shadow border border-green-700 transition; }
</style>
