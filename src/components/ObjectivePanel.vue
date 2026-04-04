<template>
  <aside
    v-if="run"
    class="w-[min(92vw,30rem)] rounded-2xl border border-slate-700/70 bg-slate-950/78 backdrop-blur-md shadow-2xl pointer-events-auto overflow-hidden"
  >
    <div class="border-b border-slate-800/80 px-4 py-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="pixel-font text-[10px] uppercase tracking-[0.2em] text-amber-300/80">{{ run.modeLabel }}</p>
          <div class="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-300">
            <span class="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-100">{{ run.story.actLabel }}</span>
            <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">{{ run.story.chapterLabel }}</span>
            <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">Mission {{ run.missionNumber }}</span>
          </div>
          <h2 class="mt-3 text-base font-semibold text-white">{{ run.story.title }}</h2>
          <p class="mt-2 text-[11px] leading-relaxed text-slate-300">{{ run.story.kicker }}</p>
        </div>
        <div class="shrink-0 rounded-xl border px-3 py-2 text-right" :class="statusPanelClass">
          <p class="text-[10px] uppercase tracking-[0.16em] text-slate-300">{{ statusLabel }}</p>
          <p class="mt-1 font-mono text-sm font-semibold text-white">{{ statusValue }}</p>
        </div>
      </div>

      <div class="mt-3 rounded-xl border border-slate-800/90 bg-slate-900/65 px-3 py-3">
        <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Command Note</p>
        <p class="mt-2 text-[11px] leading-relaxed text-slate-300">{{ run.story.guidance }}</p>
      </div>

      <div class="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-300">
        <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">
          Primary {{ completedRequired }}/{{ totalRequired }}
        </span>
        <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">{{ run.mutator.name }}</span>
        <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">Seed {{ run.seed }}</span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-300">
        <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">Active / Owned {{ activeTileCount }}/{{ ownedTileCount || 0 }}</span>
        <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">Support {{ populationState.supportCapacity }}</span>
        <span class="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1">Inactive {{ inactiveTileCount }}</span>
        <span class="rounded-full border px-2 py-1" :class="pressureBadgeClass">Pressure {{ pressureLabel }}</span>
      </div>
    </div>

    <div class="max-h-[24rem] space-y-2 overflow-y-auto px-4 py-3">
      <article class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-3">
        <p class="text-[10px] uppercase tracking-[0.16em] text-amber-200/80">Stakes</p>
        <p class="mt-2 text-[11px] leading-relaxed text-slate-200">{{ run.story.stakes }}</p>
      </article>

      <article
        v-for="objective in run.objectives"
        :key="objective.id"
        class="rounded-xl border px-3 py-3"
        :class="objective.completed ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800/90 bg-slate-900/60'"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :class="objective.completed ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]' : 'bg-amber-300/80'"
            />
            <h3 class="truncate text-sm font-semibold" :class="objective.completed ? 'text-emerald-100' : 'text-white'">
              {{ objective.title }}
            </h3>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
            :class="objective.required ? 'bg-slate-800 text-slate-200' : 'bg-amber-400/15 text-amber-200'"
          >
            {{ objective.required ? 'Primary' : 'Bonus' }}
          </span>
        </div>

        <p class="mt-2 text-[11px] leading-relaxed text-slate-300">{{ objective.description }}</p>

        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="objective.completed ? 'bg-emerald-400' : 'bg-amber-300'"
            :style="{ width: `${objectiveProgressWidth(objective)}%` }"
          />
        </div>

        <div class="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          <span>{{ objective.progress }}/{{ objective.target }}</span>
          <span v-if="objective.reward?.scoreBonus">{{ formatBonus(objective.reward.scoreBonus) }}</span>
        </div>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { runSnapshot } from '../store/runStore.ts';
import { populationState } from '../store/clientPopulationStore';

const run = computed(() => runSnapshot.value);
const requiredObjectives = computed(() => run.value?.objectives.filter((objective) => objective.required) ?? []);
const totalRequired = computed(() => requiredObjectives.value.length);
const completedRequired = computed(() => requiredObjectives.value.filter((objective) => objective.completed).length);

const statusLabel = computed(() => run.value ? 'Primary Goals' : '');

const statusValue = computed(() => run.value ? `${completedRequired.value}/${totalRequired.value || 0}` : '');
const activeTileCount = computed(() => run.value?.activeTiles ?? populationState.activeTileCount);
const inactiveTileCount = computed(() => run.value?.inactiveTiles ?? populationState.inactiveTileCount);
const ownedTileCount = computed(() => activeTileCount.value + inactiveTileCount.value);
const pressureLabel = computed(() => {
  switch (populationState.pressureState) {
    case 'collapsing':
      return 'Collapsing';
    case 'strained':
      return 'Strained';
    case 'stable':
    default:
      return 'Stable';
  }
});
const pressureBadgeClass = computed(() => {
  switch (populationState.pressureState) {
    case 'collapsing':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
    case 'strained':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
    case 'stable':
    default:
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
  }
});

const statusPanelClass = computed(() => {
  if (!run.value) return 'border-slate-700/70 bg-slate-900/70';
  if (totalRequired.value > 0 && completedRequired.value >= totalRequired.value) {
    return 'border-emerald-500/40 bg-emerald-500/12';
  }
  return 'border-amber-400/30 bg-amber-400/10';
});

function objectiveProgressWidth(objective: NonNullable<typeof run.value>['objectives'][number]) {
  if (objective.target <= 0) {
    return 100;
  }

  if (objective.progress <= 0) {
    return 0;
  }

  return Math.max(6, Math.min(100, (objective.progress / objective.target) * 100));
}

function formatBonus(scoreBonus: number) {
  return `+${scoreBonus} score`;
}
</script>
