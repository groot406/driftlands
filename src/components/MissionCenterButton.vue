<template>
  <button
    v-if="run"
    class="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/78 px-4 py-3 text-left text-white shadow-xl backdrop-blur-md transition-colors hover:border-amber-300/40 hover:bg-slate-900/90"
    @click="openMissionCenter"
  >
    <div class="pixel-font flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/15 text-[10px] uppercase tracking-[0.16em] text-amber-200">
      Msn
    </div>
    <div class="min-w-0">
      <p class="pixel-font text-[10px] uppercase tracking-[0.18em] text-amber-300/85">Mission Centre</p>
      <p class="mt-1 truncate text-sm font-semibold text-white">Mission {{ run.missionNumber }}</p>
      <p class="mt-1 text-[11px] text-slate-300">{{ statusSummary }}</p>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { openWindow, WINDOW_IDS, isKeyboardBlocked } from '../core/windowManager';
import { runSnapshot } from '../store/runStore.ts';

const run = computed(() => runSnapshot.value);
const requiredObjectives = computed(() => run.value?.objectives.filter((objective) => objective.required) ?? []);
const totalRequired = computed(() => requiredObjectives.value.length);
const completedRequired = computed(() => requiredObjectives.value.filter((objective) => objective.completed).length);
const statusSummary = computed(() => {
  if (!run.value) return '';

  const progress = `${completedRequired.value}/${totalRequired.value || 0} primary`;
  return `${progress} complete`;
});

function openMissionCenter() {
  openWindow(WINDOW_IDS.MISSION_CENTER);
}

function handleKeydown(event: KeyboardEvent) {
  if (isKeyboardBlocked.value) return;
  if (event.key.toLowerCase() !== 'm') return;

  event.preventDefault();
  openMissionCenter();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
