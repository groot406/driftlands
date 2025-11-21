<template>
  <div class="title-screen w-full h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100">
    <div class="flex flex-col items-center gap-8 p-6 rounded-lg">
      <h1 class="text-5xl font-bold tracking-wide">Driftlands</h1>
      <p class="text-slate-400 max-w-md text-center">Windswept hexes. Hidden secrets. This is only the beginning.</p>
      <div class="flex flex-col gap-3 min-w-[240px]">
        <button class="menu-btn" @click="startNewGame">New Game</button>
        <button class="menu-btn" :disabled="!uiStore.canContinue" @click="continueGame">Continue</button>
        <button class="menu-btn" @click="showSettings" disabled>Settings</button>
        <button class="menu-btn" @click="showCredits" disabled>Credits</button>
      </div>
      <p class="text-xs text-slate-500">Early prototype</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { uiStore, startNewGame, continueGame } from '../store/uiStore';

function showSettings() {}
function showCredits() {}
</script>

<style scoped>
.menu-btn {
  @apply px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left;
}
.title-screen {
  background: radial-gradient(circle at center, #1e293b, #0f172a);
}
</style>

