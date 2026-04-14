<template>
  <Transition name="run-outcome">
    <div v-if="visible && overlay" class="fixed inset-0 z-50 overflow-y-auto p-4 text-white">
      <div class="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />

      <section class="relative mx-auto my-4 flex max-h-[calc(100dvh-2rem)] w-[min(92vw,36rem)] flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/92 shadow-2xl">
        <div class="h-2 bg-emerald-400" />

        <div class="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <p class="pixel-font text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                Chapter Complete
              </p>
              <span
                class="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200"
              >
                {{ completedChapter?.chapter.chapterLabel }}
              </span>
            </div>
            <span
              class="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200"
            >
              {{ completedChapter?.chapter.actLabel }}
            </span>
          </div>

          <div v-if="completedChapter">
            <p class="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">{{ completedChapter.chapter.completionTitle }}</p>
            <h2 class="mt-2 text-2xl font-semibold text-white">Chapter {{ completedChapter.chapterNumber }} Archived</h2>
            <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ completedChapter.chapter.completionText }}</p>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Chapter Score</p>
              <p class="mt-2 text-2xl font-semibold text-white">{{ chapterScore }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Total Score</p>
              <p class="mt-2 text-2xl font-semibold text-white">{{ totalScore }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Next Chapter</p>
              <p class="mt-2 text-2xl font-semibold text-white">
                {{ `#${nextChapterNumber}` }}
              </p>
            </div>
          </div>

          <div v-if="nextRun" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
            <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">Next Chapter</p>
            <h3 class="mt-2 text-lg font-semibold text-white">Chapter {{ nextRun.chapterNumber }} · {{ nextRun.chapter.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ nextRun.chapter.briefing }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <span class="rounded-full border border-slate-800 bg-slate-950/65 px-3 py-1 text-xs text-slate-200">{{ nextRun.mutator.name }}</span>
              <span class="rounded-full border border-slate-800 bg-slate-950/65 px-3 py-1 text-xs text-slate-200">{{ nextRun.objectives.length }} objectives</span>
            </div>
            <p class="mt-3 text-xs leading-relaxed text-emerald-100/80">{{ nextRun.chapter.nextHint }}</p>
          </div>

          <div v-if="nextUnlocks.length" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
            <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">New Unlocks</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <article
                v-for="unlock in nextUnlocks"
                :key="`${unlock.kind}:${unlock.key}`"
                class="rounded-xl border border-emerald-500/15 bg-slate-950/55 px-3 py-3"
              >
                <p class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">{{ unlockKindLabel(unlock.kind) }}</p>
                <p class="mt-1 text-sm font-semibold text-white">{{ unlock.label }}</p>
                <p class="mt-1 text-xs leading-relaxed text-slate-300">{{ unlock.description }}</p>
              </article>
            </div>
          </div>

          <div v-if="completedChapter" class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4">
            <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Why It Mattered</p>
            <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ completedChapter.chapter.stakes }}</p>
          </div>

          <div class="space-y-2">
            <article
              v-for="objective in objectiveList"
              :key="objective.id"
              class="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
              :class="objective.completed ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/70'"
            >
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white">{{ objective.title }}</p>
                <p class="mt-1 text-xs text-slate-300">{{ objective.progress }}/{{ objective.target }}</p>
              </div>
              <span
                class="shrink-0 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
                :class="objective.completed ? 'bg-emerald-400/15 text-emerald-200' : 'bg-slate-800 text-slate-300'"
              >
                {{ objective.completed ? 'Done' : 'Pending' }}
              </span>
            </article>
          </div>

        </div>

        <div class="flex flex-wrap gap-3 border-t border-slate-800 bg-slate-900/95 px-6 py-4 backdrop-blur-sm">
          <button class="primary-btn" @click="openMissionCenter">Open Chronicle</button>
          <button class="secondary-btn" @click="dismissMissionOverlay">Continue Expedition</button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { dismissMissionOverlay, missionOverlay, showMissionOverlay } from '../store/runStore.ts';
import { openWindow, WINDOW_IDS } from '../core/windowManager';
import { getNewlyUnlockedStoryDescriptors } from '../shared/story/progression.ts';

const visible = showMissionOverlay;
const overlay = missionOverlay;

const completedChapter = computed(() => overlay.value?.chapter ?? null);
const nextRun = computed(() => overlay.value?.nextRun ?? null);

const chapterScore = computed(() => overlay.value?.chapter.score ?? 0);
const totalScore = computed(() => overlay.value?.chapter.totalScore ?? 0);

const nextChapterNumber = computed(() => nextRun.value?.chapterNumber ?? '--');
const nextUnlocks = computed(() => nextRun.value ? getNewlyUnlockedStoryDescriptors(nextRun.value.progression) : []);
const objectiveList = computed(() => overlay.value?.chapter.objectives ?? []);

function unlockKindLabel(kind: string) {
  switch (kind) {
    case 'hero':
      return 'Hero';
    case 'building':
      return 'Building';
    case 'task':
      return 'Task';
    case 'terrain':
      return 'Terrain';
    default:
      return kind;
  }
}

function openMissionCenter() {
  openWindow(WINDOW_IDS.MISSION_CENTER);
  dismissMissionOverlay();
}
</script>

<style scoped>
.primary-btn {
  @apply rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-300;
}

.secondary-btn {
  @apply rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-700;
}

.run-outcome-enter-active,
.run-outcome-leave-active {
  transition: opacity 0.25s ease;
}

.run-outcome-enter-from,
.run-outcome-leave-to {
  opacity: 0;
}
</style>
