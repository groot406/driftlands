<template>
  <div v-if="activeLoaders.length" class="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50">
    <div class="flex flex-col space-y-4 w-full max-w-[380px] px-4">
      <div v-for="loader in activeLoaders" :key="loader.id" class="w-full space-y-4 p-6 rounded-xl bg-slate-800 border border-slate-700 shadow-xl drop-shadow-md opacity-80 backdrop:blur-lg">
        <div class="text-sm font-semibold tracking-wide uppercase text-slate-300">{{ loader.title }}</div>
        <div class="text-xs text-slate-400" role="status">{{ loader.status }}</div>
        <div v-if="loader.total" class="flex items-center justify-between text-xs text-slate-400">
          <div>{{ loader.unitLabel }}: {{ loader.completed }} / {{ loader.total }}</div>
          <div>{{ (loader.progress * 100).toFixed(1) }}%</div>
        </div>
        <div class="h-3 rounded-md overflow-hidden bg-slate-700/60">
          <div class="h-full bg-emerald-500 transition-all" :style="{ width: (loader.progress * 100) + '%' }"></div>
        </div>
        <div v-if="loader.progress >= 1 && loader.active" class="text-emerald-300 text-xs">Finalizing...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getActiveLoaders } from '../core/loader';
const activeLoaders = getActiveLoaders();
</script>
