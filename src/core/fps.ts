import { ref, onMounted, onUnmounted } from 'vue';

export function useFPS() {
  const fps = ref(0);
  const frameCount = ref(0);
  const lastTime = ref(performance.now());
  const animationId = ref<number | null>(null);

  const updateFPS = () => {
    const now = performance.now();
    frameCount.value++;

    // Update FPS every second
    if (now - lastTime.value >= 1000) {
      fps.value = Math.round(frameCount.value * 1000 / (now - lastTime.value));
      frameCount.value = 0;
      lastTime.value = now;
    }

    animationId.value = requestAnimationFrame(updateFPS);
  };

  const start = () => {
    if (!animationId.value) {
      lastTime.value = performance.now();
      frameCount.value = 0;
      updateFPS();
    }
  };

  const stop = () => {
    if (animationId.value) {
      cancelAnimationFrame(animationId.value);
      animationId.value = null;
    }
  };

  onMounted(() => {
    start();
  });

  onUnmounted(() => {
    stop();
  });

  return {
    fps: fps.value,
    start,
    stop
  };
}
