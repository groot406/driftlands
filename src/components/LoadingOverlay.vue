<template>
  <div v-if="store.generationInProgress" class="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50">
    <div class="w-[320px] space-y-4 p-6 rounded-lg bg-slate-800 border border-slate-700 shadow-xl drop-shadow-md opacity-80 backdrop:blur-lg">
      <div class="text-sm font-semibold tracking-wide uppercase text-slate-300">World Generation</div>
      <div class="text-xs text-slate-400" role="status">{{ store.generationStatus }}</div>
      <div class="flex items-center justify-between text-xs text-slate-400">
        <div>Tiles: {{ store.generationCompleted }} / {{ store.generationTotal }}</div>
        <div>{{ (store.generationProgress * 100).toFixed(1) }}%</div>
      </div>
      <div class="h-3 rounded-md overflow-hidden bg-slate-700/60">
        <div class="h-full bg-emerald-500 transition-all" :style="{ width: (store.generationProgress * 100) + '%' }"></div>
      </div>
      <div v-if="store.generationProgress >= 1" class="text-emerald-300 text-xs">Finalizing world...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { idleStore as store } from '../store/idleStore';
</script>

