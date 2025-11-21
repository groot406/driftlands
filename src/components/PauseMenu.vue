<template>
  <Transition name="fade-menu" appear>
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center text-white">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="relative bg-slate-800/90 border border-slate-700 rounded-lg p-6 flex flex-col gap-4 min-w-[260px]">
        <h2 class="text-xl font-semibold">Paused</h2>
        <div class="flex flex-col gap-2">
          <button class="menu-btn" @click="resumeGame">Resume</button>
          <button class="menu-btn" @click="pauseSettings" disabled>Settings</button>
          <button class="menu-btn" @click="returnToTitle">Return to Title</button>
        </div>
        <p class="text-xs text-slate-500">ESC to resume</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { uiStore, resumeGame, returnToTitle } from '../store/uiStore';
import { computed } from 'vue';

const visible = computed(() => uiStore.phase === 'paused');

function pauseSettings() {}
</script>

<style scoped>
.menu-btn {
  @apply px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left;
}
</style>
