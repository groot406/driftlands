<template>
  <transition name="fade">
    <div v-if="primaryLoader"
         class="absolute inset-0 flex items-center justify-center bg-[#101827]/75 backdrop-blur-[2px] z-50">
      <div class="flex flex-col space-y-4 w-full max-w-[400px] px-4">
        <div
             :key="primaryLoader.id"
             class="loader-panel w-full space-y-5 p-6 border shadow-xl drop-shadow-md">
          <div class="flex items-center gap-4">
            <div class="hex-loader" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold tracking-wide uppercase text-[#f8e7c0]">{{ primaryLoader.title }}</div>
              <div class="mt-1 text-xs text-[#b9c2c4]" role="status">{{ primaryLoader.status }}</div>
            </div>
          </div>
          <div v-if="primaryLoader.total" class="flex items-center justify-between text-xs text-[#b9c2c4]">
            <div><template v-if="primaryLoader.unitLabel">{{ primaryLoader.unitLabel }}: </template>{{ primaryLoader.completed }} / {{ primaryLoader.total }}</div>
            <div>{{ (getProgress(primaryLoader) * 100).toFixed(0) }}%</div>
          </div>
          <div class="h-3 overflow-hidden loader-track">
            <div
                class="h-full loader-fill transition-all"
                :style="primaryLoader.infinite ? undefined : { width: (primaryLoader.progress * 100) + '%' }"
                :class="primaryLoader.infinite ? 'infinite-loader-bar' : ''"
            ></div>
          </div>
          <p v-if="hiddenPopupLoaderCount > 0" class="loader-panel__secondary">
            {{ hiddenPopupLoaderCount }} more loading step{{ hiddenPopupLoaderCount === 1 ? '' : 's' }} running
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import {getActiveLoaders, type Loader} from '../core/loader';
import {computed} from "vue";

const activeLoaders = getActiveLoaders();

function getProgress(loader: Loader): number {
  if (loader.infinite) {
    return 0.5;
  }
  if (loader.total && loader.total > 0) {
    return (loader.completed / loader.total);
  }

  return loader.progress || 0;
}

const popupLoaders = computed(() => activeLoaders.value.filter(loader => loader.popup));
const primaryLoader = computed(() => {
  const loaders = popupLoaders.value;
  return loaders.find((loader) => loader.id === 'world-sync')
    ?? loaders.find((loader) => loader.infinite)
    ?? loaders[0]
    ?? null;
});
const hiddenPopupLoaderCount = computed(() => Math.max(0, popupLoaders.value.length - 1));
</script>

<style scoped>
.loader-panel {
  border-color: rgba(216, 177, 103, 0.34);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(38, 50, 54, 0.93), rgba(22, 29, 38, 0.95)),
    rgba(20, 28, 36, 0.96);
  box-shadow:
    inset 0 0 0 1px rgba(255, 247, 221, 0.06),
    0 22px 48px rgba(0, 0, 0, 0.38);
}

.loader-track {
  border: 1px solid rgba(246, 231, 198, 0.24);
  border-radius: 3px;
  background: rgba(9, 14, 21, 0.62);
}

.loader-fill {
  border-radius: 2px;
  background: linear-gradient(90deg, #81b65f, #d8b167, #74a2bd);
  box-shadow: 0 0 16px rgba(216, 177, 103, 0.3);
}

.loader-panel__secondary {
  margin: -0.45rem 0 0;
  color: rgba(185, 194, 196, 0.72);
  font-size: 0.72rem;
  line-height: 1.25;
  text-align: center;
}

.hex-loader {
  position: relative;
  flex: 0 0 auto;
  width: 58px;
  height: 52px;
}

.hex-loader span {
  position: absolute;
  width: 18px;
  height: 20px;
  clip-path: polygon(50% 0, 100% 24%, 100% 76%, 50% 100%, 0 76%, 0 24%);
  background: #d8b167;
  box-shadow: inset 0 0 0 2px rgba(255, 248, 220, 0.18);
  animation: hex-loader-pulse 1.28s ease-in-out infinite;
}

.hex-loader span:nth-child(1) { left: 20px; top: 0; animation-delay: 0ms; }
.hex-loader span:nth-child(2) { left: 10px; top: 16px; animation-delay: 90ms; background: #81b65f; }
.hex-loader span:nth-child(3) { left: 30px; top: 16px; animation-delay: 180ms; background: #74a2bd; }
.hex-loader span:nth-child(4) { left: 0; top: 32px; animation-delay: 270ms; background: #8fb86d; }
.hex-loader span:nth-child(5) { left: 20px; top: 32px; animation-delay: 360ms; background: #cf9f60; }
.hex-loader span:nth-child(6) { left: 40px; top: 32px; animation-delay: 450ms; background: #668fa9; }
.hex-loader span:nth-child(7) { left: 20px; top: 16px; animation-delay: 540ms; background: #f0d69a; }

@keyframes hex-loader-pulse {
  0%, 100% {
    opacity: 0.42;
    transform: translateY(0) scale(0.88);
  }
  45% {
    opacity: 1;
    transform: translateY(-2px) scale(1);
  }
}

.infinite-loader-bar {
  width: 40%;
  min-width: 80px;
  max-width: 100%;
  animation: loader-infinite-move 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  position: relative;
  left: 0;
}

@keyframes loader-infinite-move {
  0% {
    left: -40%;
  }
  60% {
    left: 60%;
  }
  100% {
    left: 100%;
  }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hex-loader span,
  .infinite-loader-bar {
    animation: none;
  }
}
</style>
