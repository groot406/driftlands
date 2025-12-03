<template>
  <div class="flex flex-col items-end pointer-events-auto">
    <div><button class="mini-btn w-max" @click="open = !open">Debug {{ open ? '−' : '+' }}</button></div>
    <div v-if="open" class="gap-2 w-[200px] mt-4 flex flex-col space-y-1 text-[11px] text-white">
      <div class="flex justify-between"><span>Worldversion</span><span>{{ worldVersion }}</span></div>
      <div class="flex justify-between"><span>Tick</span><span>{{ store.tick }}</span></div>
      <div class="flex justify-between"><span>Tiles</span><span>{{ store.tiles.length }}</span></div>
      <div class="flex justify-between"><span>Camera</span><span>{{ camera.q.toFixed(1) }}, {{camera.r.toFixed(1) }}</span></div>
      <div class="flex justify-between"><span>Running</span><span>{{ store.running ? 'Yes' : 'No' }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue';
import {camera} from '../core/camera';
import {worldVersion} from '../core/world';
import {idleStore as store} from '../store/idleStore';

// FPS tracking
const fps = ref(0);
const frameCount = ref(0);
let lastTime = performance.now();
let animationId: number | null = null;

const updateFPS = () => {
  const now = performance.now();
  frameCount.value++;

  // Update FPS every second
  if (now - lastTime >= 1000) {
    fps.value = Math.round(frameCount.value * 1000 / (now - lastTime));
    frameCount.value = 0;
    lastTime = now;
  }

  animationId = requestAnimationFrame(updateFPS);
};

onMounted(() => {
  lastTime = performance.now();
  frameCount.value = 0;
  updateFPS();
});

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
});

const open = ref(false);
</script>

<style scoped>
.mini-btn {
  @apply px-2 py-1 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white shadow border border-slate-600;
}
</style>

