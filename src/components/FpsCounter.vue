<template>
  <div class="fps-counter">
    <span>{{ fps }} FPS</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

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
</script>

<style scoped>
.fps-counter {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  z-index: 1000;
  pointer-events: none;
  user-select: none;
}
</style>
