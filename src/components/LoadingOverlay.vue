<template>
  <transition name="fade">
    <div v-if="popupLoaders.length"
         class="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50">
      <div class="flex flex-col space-y-4 w-full max-w-[380px] px-4">
        <div v-for="loader in popupLoaders" :key="loader.id"
             class="w-full space-y-4 p-6 rounded-xl bg-slate-800 border border-slate-700 shadow-xl drop-shadow-md opacity-80 backdrop:blur-lg">
          <div class="text-sm font-semibold tracking-wide uppercase text-slate-300">{{ loader.title }}</div>
          <div class="text-xs text-slate-400" role="status">{{ loader.status }}</div>
          <div v-if="loader.total" class="flex items-center justify-between text-xs text-slate-400">
            <div><template v-if="loader.unitLabel">{{ loader.unitLabel }}: </template>{{ loader.completed }} / {{ loader.total }}</div>
            <div>{{ (getProgress(loader) * 100).toFixed(1) }}%</div>
          </div>
          <div class="h-3 rounded-md overflow-hidden bg-slate-700/60">
            <div
                class="h-full bg-emerald-500 transition-all rounded-full"
                :style="loader.infinite ? undefined : { width: (loader.progress * 100) + '%' }"
                :class="loader.infinite ? 'infinite-loader-bar' : ''"
            ></div>
          </div>
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

const popupLoaders = computed(() => activeLoaders.value.filter(loader => loader.popup))
</script>

<style scoped>
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
</style>
