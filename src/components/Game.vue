<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <div class="flex-1 overflow-hidden w-full h-full">
      <HexMap />
      <LoadingOverlay />
    </div>
  </div>

  <div class="absolute z-10 top-4 left-4 text-white">
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
import { startWorldGeneration } from '../core/world';
import { centerCamera } from '../core/camera';
import HexMap from './HexMap.vue';
import LoadingOverlay from './LoadingOverlay.vue';

const WORLD_SIZE = 6;
const LARGE_WORLD_SIZE = 200;

function regenerateWorld(size?: number) {
  centerCamera();
  startWorldGeneration(size ?? WORLD_SIZE);
}

startWorldGeneration(WORLD_SIZE, store.tiles);
</script>