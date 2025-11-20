<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <div class="flex-1 overflow-hidden w-full h-full">
      <!-- Extracted map component -->
      <HexMap />

      <!-- Loading overlay -->
      <div v-if="generationInProgress"
           class="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50">
        <div
            class="w-[320px] space-y-4 p-6 rounded-lg bg-slate-800 border border-slate-700 shadow-xl drop-shadow-md opacity-80 backdrop:blur-lg">
          <div class="text-sm font-semibold tracking-wide uppercase text-slate-300">World Generation</div>
          <div class="text-xs text-slate-400" role="status">{{ generationStatus }}</div>
          <div class="flex items-center justify-between text-xs text-slate-400">
            <div>Tiles: {{ generationCompleted }} / {{ generationTotal }}</div>
            <div>{{ (generationProgress * 100).toFixed(1) }}%</div>
          </div>
          <div class="h-3 rounded-md overflow-hidden bg-slate-700/60">
            <div class="h-full bg-emerald-500 transition-all"
                 :style="{ width: (generationProgress * 100) + '%' }"></div>
          </div>
          <div v-if="generationProgress >= 1" class="text-emerald-300 text-xs">Finalizing world...</div>
        </div>
      </div>

    </div>
  </div>

  <div class="absolute z-10 top-4 left-4 opacity-80 text-white">
    <h1 class="text-2xl font-bold items-center">Nexus Hex – Idle Frontier (POC)</h1>
    <div class="gap-4 flex flex-row items-center mt-2">
      <button v-if="!store.running" class="btn" @click="startIdle()">Start</button>
      <button class="btn" @click="regenerateWorld()">Regenerate</button>
      <button class="btn" @click="regenerateWorld(LARGE_WORLD_SIZE)">Generate large world</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { startIdle, idleStore as store } from '../store/idleStore';
import { startWorldGeneration, generationInProgress, generationStatus, generationCompleted, generationTotal, generationProgress } from '../core/world';
import { centerCamera } from '../core/camera';
import HexMap from './HexMap.vue';

const WORLD_SIZE = 6;
const LARGE_WORLD_SIZE = 200;

function regenerateWorld(size?: number) {
  centerCamera();
  startWorldGeneration(size ?? WORLD_SIZE);
}

// Initial world generation
startWorldGeneration(WORLD_SIZE, store.tiles);

</script>

<style scoped>
/* Map tile styles moved to HexMap.vue */
</style>