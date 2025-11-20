<template>
  <div class="flex flex-col gap-2">
    <div class="flex gap-2 flex-wrap justify-end">
      <button class="mini-btn" @click="regenerateWorld()" title="Regenerate small world">Regen</button>
      <button class="mini-btn" @click="regenerateWorld(LARGE_WORLD_SIZE)" title="Generate large world">Large</button>
      <button class="mini-btn" @click="centerCamera()" title="Center camera on world">Center Camera</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { centerCamera } from '../core/camera';
import { startWorldGeneration } from '../core/world';

const WORLD_SIZE = 1;
const LARGE_WORLD_SIZE = 200;

function regenerateWorld(size?: number) {
  centerCamera();
  startWorldGeneration(size ?? WORLD_SIZE);
}
</script>

<style scoped>
.mini-btn { @apply px-2 py-1 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white shadow border border-slate-600; }
</style>
