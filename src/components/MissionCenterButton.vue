<template>
  <button
    v-if="run"
    class="mission-btn pointer-events-auto"
    :title="`Mission ${run.missionNumber} — ${statusSummary}`"
    @click="openMissionCenter"
  >
    <!-- Flag icon -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M3 2.25a.75.75 0 01.75.75v.54l1.838-.46a9.75 9.75 0 016.725.738l.108.054a8.25 8.25 0 005.58.652l.71-.178a.75.75 0 01.947.727v7.653a.75.75 0 01-.53.72l-.964.24a9.75 9.75 0 01-6.591-.77l-.108-.054a8.25 8.25 0 00-5.693-.625L3 13.07v8.68a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75z" clip-rule="evenodd" />
    </svg>
    <!-- Progress badge -->
    <span class="mission-badge">{{ completedRequired }}/{{ totalRequired }}</span>
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

<style scoped>
.mission-btn {
  @apply relative flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-2.5 py-2 text-amber-200/80 shadow-lg backdrop-blur-sm transition-all hover:border-amber-300/50 hover:text-amber-200 cursor-pointer;
  background: rgba(2, 6, 23, 0.82);
}
.mission-btn:hover {
  background: rgba(15, 23, 42, 0.92);
}

.mission-badge {
  @apply text-[11px] font-mono leading-none text-amber-200;
}
</style>
