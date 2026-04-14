<template>
  <Transition name="smooth-modal" appear>
    <div
      v-if="isOpen && run"
      class="smooth-modal-backdrop mission-log-backdrop fixed inset-0 z-50 overflow-y-auto p-2 text-white backdrop-blur-sm sm:p-4"
      @click.self="closeMissionCenter"
    >
      <section class="smooth-modal-surface mission-log-shell mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(94vw,72rem)]">
        <div class="mission-log-shell__glow mission-log-shell__glow--amber" />
        <div class="mission-log-shell__glow mission-log-shell__glow--moss" />
        <div class="mission-log-shell__grain" />

        <header class="mission-log-header sticky top-0 z-10 border-b px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="pixel-font text-[10px] uppercase tracking-[0.24em] text-amber-200/90">{{ run.modeLabel }}</p>
              <div class="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] sm:mt-3">
                <span class="mission-log-chip mission-log-chip--amber px-2.5 py-1 sm:px-3">{{ run.story.actLabel }}</span>
                <span class="mission-log-chip px-2.5 py-1 sm:px-3">{{ run.story.chapterLabel }}</span>
              </div>
              <h2 class="mission-log-title mt-3 text-lg font-semibold text-white sm:text-2xl">Mission {{ run.missionNumber }} · {{ run.story.title }}</h2>
              <p class="mt-2 max-w-2xl text-xs leading-relaxed text-slate-200/80 sm:text-sm">{{ run.story.kicker }}</p>
            </div>
            <button
              class="mission-log-close rounded-xl border px-3 py-2 text-xs transition-colors sm:text-sm"
              @click="closeMissionCenter"
            >
              Close
            </button>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div class="mission-stat mission-stat--amber rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-amber-100/70">Primary Goals</p>
              <p class="mt-2 font-mono text-xl font-semibold text-white sm:text-2xl">{{ primaryGoalProgress }}</p>
            </div>
            <div class="mission-stat mission-stat--ocean rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">Total Score</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ run.score }}</p>
            </div>
            <div class="mission-stat mission-stat--fern rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-emerald-100/70">Mission Score</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ run.missionScore }}</p>
            </div>
            <div class="mission-stat mission-stat--ember rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-rose-100/70">Mutator</p>
              <p class="mt-2 text-sm font-semibold text-white sm:text-lg">{{ run.mutator.name }}</p>
            </div>
          </div>

          <div class="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-4 sm:gap-3">
            <div class="mission-stat rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/65">Active / Owned</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ activeOwnedLabel }}</p>
            </div>
            <div class="mission-stat rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/65">Support Capacity</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ supportCapacity }}</p>
            </div>
            <div class="mission-stat rounded-[1.4rem] border px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/65">Inactive Tiles</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ inactiveTileCount }}</p>
            </div>
            <div class="mission-stat rounded-[1.4rem] border px-3 py-3 sm:px-4" :class="pressureClass">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-100/70">Pressure State</p>
              <p class="mt-2 text-sm font-semibold text-white sm:text-lg">{{ pressureLabel }}</p>
            </div>
          </div>

          <div class="mt-3 flex gap-2 overflow-x-auto pb-1 sm:hidden">
            <button
              v-for="tab in mobileTabs"
              :key="tab.key"
              class="mission-log-tab shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors"
              :class="mobileTab === tab.key ? 'mission-log-tab--active' : ''"
              @click="mobileTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-hidden sm:hidden">
          <div v-if="mobileTab === 'goals'" class="h-full overflow-y-auto px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold text-white">Current Charter</h3>
              <span class="mission-log-chip px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
                {{ completedRequired }}/{{ totalRequired }} primary
              </span>
            </div>

            <div class="mt-3 space-y-2.5">
              <article
                v-for="objective in run.objectives"
                :key="objective.id"
                class="mission-objective-card rounded-[1.4rem] border px-3 py-3"
                :class="objective.completed ? 'mission-objective-card--completed' : 'mission-objective-card--active'"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full"
                        :class="objective.completed ? 'bg-emerald-400' : 'bg-amber-300'"
                      />
                      <h4 class="text-sm font-semibold text-white">{{ objective.title }}</h4>
                    </div>
                    <p class="mt-1.5 text-xs leading-relaxed text-slate-300">{{ objective.description }}</p>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
                    :class="objective.required ? 'bg-slate-800 text-slate-200' : 'bg-amber-400/15 text-amber-200'"
                  >
                    {{ objective.required ? 'Primary' : 'Bonus' }}
                  </span>
                </div>

                <div class="mission-progress-track mt-3 h-2.5 overflow-hidden rounded-full">
                  <div
                    class="mission-progress-fill h-full rounded-full transition-all duration-500"
                    :class="objective.completed ? 'mission-progress-fill--completed' : 'mission-progress-fill--active'"
                    :style="{ width: `${objectiveProgressWidth(objective)}%` }"
                  />
                </div>

                <div class="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-300/70">
                  <span>{{ objective.progress }}/{{ objective.target }}</span>
                  <span v-if="objective.reward?.scoreBonus">{{ formatBonus(objective.reward.scoreBonus) }}</span>
                </div>
              </article>
            </div>
          </div>

          <div v-else-if="mobileTab === 'briefing'" class="h-full overflow-y-auto px-4 py-4">
            <div class="mission-panel mission-panel--briefing rounded-[1.6rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-amber-100/75">Story Briefing</p>
              <h3 class="mt-2 text-base font-semibold text-white">{{ run.story.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-100/80">{{ run.story.briefing }}</p>

              <div class="mission-panel mission-panel--subtle mt-4 rounded-xl border px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Why This Charter Matters</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-100/72">{{ run.story.stakes }}</p>
              </div>

              <div class="mission-panel mission-panel--subtle mt-3 rounded-xl border px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Field Guidance</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-100/72">{{ run.story.guidance }}</p>
              </div>
            </div>

            <div class="mission-panel mission-panel--subtle mt-4 rounded-[1.4rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/60">Current Mutator</p>
              <h3 class="mt-2 text-base font-semibold text-white">{{ run.mutator.name }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-100/72">{{ run.mutator.description }}</p>
            </div>

            <div class="mission-panel mission-panel--subtle mt-4 rounded-[1.4rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/60">Campaign Notes</p>
              <ul class="mt-3 space-y-2 text-sm text-slate-100/72">
                <li>Press <span class="rounded bg-slate-900/80 px-2 py-1 text-xs text-white">M</span> to reopen this log at any time.</li>
                <li>Press <span class="rounded bg-slate-900/80 px-2 py-1 text-xs text-white">V</span> to inspect stable, fragile, inactive, and uncontrolled territory.</li>
                <li>Primary objectives carry the colony forward. Bonus goals add score, but only primary goals advance the campaign.</li>
                <li>{{ run.story.nextHint }}</li>
              </ul>
            </div>
          </div>

          <div v-else class="h-full overflow-y-auto px-4 py-4">
            <div class="mission-panel mission-panel--subtle rounded-[1.4rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/60">Campaign Unlocks</p>

              <div class="mt-3 space-y-3">
                <div v-for="section in unlockSections" :key="section.title">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-white">{{ section.title }}</p>
                    <span class="mission-log-chip px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
                      {{ section.entries.length }}
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-for="entry in section.entries"
                      :key="entry.key"
                      class="mission-log-chip px-3 py-1 text-xs"
                      :title="entry.description"
                    >
                      {{ entry.label }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="newUnlocks.length" class="mission-panel mission-panel--unlock mt-4 rounded-xl border px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">New For Mission {{ run.missionNumber }}</p>
                <div class="mt-3 grid gap-2">
                  <article
                    v-for="unlock in newUnlocks"
                    :key="`${unlock.kind}:${unlock.key}`"
                    class="mission-panel mission-panel--subtle rounded-xl border px-3 py-3"
                  >
                    <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">{{ unlockKindLabel(unlock.kind) }}</p>
                    <p class="mt-1 text-sm font-semibold text-white">{{ unlock.label }}</p>
                    <p class="mt-1 text-xs leading-relaxed text-slate-100/72">{{ unlock.description }}</p>
                  </article>
                </div>
              </div>
            </div>

            <div v-if="run.lastCompletedMission" class="mission-panel mission-panel--unlock mt-4 rounded-[1.4rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-emerald-100/80">Last Mission</p>
              <h3 class="mt-2 text-base font-semibold text-white">{{ run.lastCompletedMission.story.completionTitle }}</h3>
              <p class="mt-2 text-sm text-slate-100/72">{{ run.lastCompletedMission.story.completionText }}</p>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div class="mission-panel mission-panel--subtle rounded-xl border px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Mission Score</p>
                  <p class="mt-1 text-lg font-semibold text-white">{{ run.lastCompletedMission.score }}</p>
                </div>
                <div class="mission-panel mission-panel--subtle rounded-xl border px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Total Score</p>
                  <p class="mt-1 text-lg font-semibold text-white">{{ run.lastCompletedMission.totalScore }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto sm:grid lg:grid-cols-[1.08fr_0.92fr]">
          <div class="min-h-0 overflow-visible border-b border-white/8 px-6 py-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-lg font-semibold text-white">Current Charter</h3>
              <span class="mission-log-chip px-3 py-1 text-[10px] uppercase tracking-[0.16em]">
                Completed {{ completedRequired }}/{{ totalRequired }} primary
              </span>
            </div>

            <div class="mt-4 space-y-3">
              <article
                v-for="objective in run.objectives"
                :key="objective.id"
                class="mission-objective-card rounded-[1.55rem] border px-4 py-4"
                :class="objective.completed ? 'mission-objective-card--completed' : 'mission-objective-card--active'"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full"
                        :class="objective.completed ? 'bg-emerald-400' : 'bg-amber-300'"
                      />
                      <h4 class="text-sm font-semibold text-white">{{ objective.title }}</h4>
                    </div>
                    <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ objective.description }}</p>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
                    :class="objective.required ? 'bg-slate-800 text-slate-200' : 'bg-amber-400/15 text-amber-200'"
                  >
                    {{ objective.required ? 'Primary' : 'Bonus' }}
                  </span>
                </div>

                <div class="mission-progress-track mt-4 h-2.5 overflow-hidden rounded-full">
                  <div
                    class="mission-progress-fill h-full rounded-full transition-all duration-500"
                    :class="objective.completed ? 'mission-progress-fill--completed' : 'mission-progress-fill--active'"
                    :style="{ width: `${objectiveProgressWidth(objective)}%` }"
                  />
                </div>

                <div class="mt-3 flex items-center justify-between gap-3 text-xs text-slate-300/70">
                  <span>{{ objective.progress }}/{{ objective.target }}</span>
                  <span v-if="objective.reward?.scoreBonus">{{ formatBonus(objective.reward.scoreBonus) }}</span>
                </div>
              </article>
            </div>
          </div>

          <div class="min-h-0 overflow-visible px-6 py-5 lg:overflow-y-auto">
            <div class="mission-panel mission-panel--briefing rounded-[1.7rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-amber-100/75">Story Briefing</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.story.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-100/82">{{ run.story.briefing }}</p>

              <div class="mission-panel mission-panel--subtle mt-4 rounded-xl border px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Why This Charter Matters</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-100/72">{{ run.story.stakes }}</p>
              </div>

              <div class="mission-panel mission-panel--subtle mt-3 rounded-xl border px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Field Guidance</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-100/72">{{ run.story.guidance }}</p>
              </div>
            </div>

            <div class="mission-panel mission-panel--subtle mt-4 rounded-[1.5rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/60">Current Mutator</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.mutator.name }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-100/72">{{ run.mutator.description }}</p>
            </div>

            <div class="mission-panel mission-panel--subtle mt-4 rounded-[1.5rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/60">Campaign Unlocks</p>

              <div class="mt-3 space-y-3">
                <div v-for="section in unlockSections" :key="section.title">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-white">{{ section.title }}</p>
                    <span class="mission-log-chip px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
                      {{ section.entries.length }}
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-for="entry in section.entries"
                      :key="entry.key"
                      class="mission-log-chip px-3 py-1 text-xs"
                      :title="entry.description"
                    >
                      {{ entry.label }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="newUnlocks.length" class="mission-panel mission-panel--unlock mt-4 rounded-xl border px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">New For Mission {{ run.missionNumber }}</p>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <article
                    v-for="unlock in newUnlocks"
                    :key="`${unlock.kind}:${unlock.key}`"
                    class="mission-panel mission-panel--subtle rounded-xl border px-3 py-3"
                  >
                    <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">{{ unlockKindLabel(unlock.kind) }}</p>
                    <p class="mt-1 text-sm font-semibold text-white">{{ unlock.label }}</p>
                    <p class="mt-1 text-xs leading-relaxed text-slate-100/72">{{ unlock.description }}</p>
                  </article>
                </div>
              </div>
            </div>

            <div v-if="run.lastCompletedMission" class="mission-panel mission-panel--unlock mt-4 rounded-[1.5rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-emerald-100/80">Last Mission</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.lastCompletedMission.story.completionTitle }}</h3>
              <p class="mt-2 text-sm text-slate-100/72">{{ run.lastCompletedMission.story.completionText }}</p>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div class="mission-panel mission-panel--subtle rounded-xl border px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Mission Score</p>
                  <p class="mt-1 text-xl font-semibold text-white">{{ run.lastCompletedMission.score }}</p>
                </div>
                <div class="mission-panel mission-panel--subtle rounded-xl border px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.16em] text-slate-200/60">Total Score</p>
                  <p class="mt-1 text-xl font-semibold text-white">{{ run.lastCompletedMission.totalScore }}</p>
                </div>
              </div>
            </div>

            <div class="mission-panel mission-panel--subtle mt-4 rounded-[1.5rem] border px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-200/60">Campaign Notes</p>
              <ul class="mt-3 space-y-2 text-sm text-slate-100/72">
                <li>Press <span class="rounded bg-slate-900/80 px-2 py-1 text-xs text-white">M</span> to reopen this log at any time.</li>
                <li>Press <span class="rounded bg-slate-900/80 px-2 py-1 text-xs text-white">V</span> to inspect stable, fragile, inactive, and uncontrolled territory.</li>
                <li>Primary objectives carry the colony forward. Bonus goals add score, but only primary goals advance the campaign.</li>
                <li>{{ run.story.nextHint }}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { closeWindow, isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager';
import { runSnapshot } from '../store/runStore.ts';
import { getNewlyUnlockedStoryDescriptors, getStoryProgressionCategoryDescriptors } from '../shared/story/progression.ts';
import { populationState } from '../store/clientPopulationStore';

const isOpen = computed(() => isWindowOpen(WINDOW_IDS.MISSION_CENTER));
const run = computed(() => runSnapshot.value);
const requiredObjectives = computed(() => run.value?.objectives.filter((objective) => objective.required) ?? []);
const totalRequired = computed(() => requiredObjectives.value.length);
const completedRequired = computed(() => requiredObjectives.value.filter((objective) => objective.completed).length);
const unlockSections = computed(() => {
  if (!run.value) {
    return [];
  }

  const descriptors = getStoryProgressionCategoryDescriptors(run.value.progression);
  return [
    { title: 'Heroes', entries: descriptors.heroes },
    { title: 'Buildings', entries: descriptors.buildings },
    { title: 'Tasks', entries: descriptors.tasks },
    { title: 'Terrains', entries: descriptors.terrains },
  ];
});
const newUnlocks = computed(() => run.value ? getNewlyUnlockedStoryDescriptors(run.value.progression) : []);
const primaryGoalProgress = computed(() => run.value ? `${completedRequired.value}/${totalRequired.value || 0}` : '--');
const mobileTab = ref<'goals' | 'briefing' | 'unlocks'>('goals');
const mobileTabs: Array<{ key: typeof mobileTab.value; label: string }> = [
  { key: 'goals', label: 'Goals' },
  { key: 'briefing', label: 'Briefing' },
  { key: 'unlocks', label: 'Unlocks' },
];
const activeTileCount = computed(() => run.value?.activeTiles ?? populationState.activeTileCount);
const inactiveTileCount = computed(() => run.value?.inactiveTiles ?? populationState.inactiveTileCount);
const ownedTileCount = computed(() => activeTileCount.value + inactiveTileCount.value);
const activeOwnedLabel = computed(() => `${activeTileCount.value}/${ownedTileCount.value || 0}`);
const supportCapacity = computed(() => populationState.supportCapacity);
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
const pressureClass = computed(() => {
  switch (populationState.pressureState) {
    case 'collapsing':
      return 'border-rose-500/30 bg-rose-500/10';
    case 'strained':
      return 'border-amber-400/30 bg-amber-400/10';
    case 'stable':
    default:
      return 'border-emerald-500/25 bg-emerald-500/10';
  }
});

function closeMissionCenter() {
  mobileTab.value = 'goals';
  closeWindow(WINDOW_IDS.MISSION_CENTER);
}

function objectiveProgressWidth(objective: NonNullable<typeof run.value>['objectives'][number]) {
  if (objective.target <= 0) return 100;
  if (objective.progress <= 0) return 0;
  return Math.max(4, Math.min(100, (objective.progress / objective.target) * 100));
}

function formatBonus(scoreBonus: number) {
  return `+${scoreBonus} score`;
}

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

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.MISSION_CENTER)) {
    event.preventDefault();
    event.stopPropagation();
    closeMissionCenter();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.mission-log-backdrop {
  background:
    radial-gradient(circle at 18% 16%, rgba(245, 158, 11, 0.12), transparent 24%),
    radial-gradient(circle at 78% 82%, rgba(34, 197, 94, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.72), rgba(3, 7, 18, 0.88));
}

.mission-log-shell {
  position: relative;
  border-color: rgba(245, 195, 92, 0.18);
  background:
    linear-gradient(180deg, rgba(7, 18, 22, 0.94), rgba(5, 14, 19, 0.97)),
    radial-gradient(circle at top left, rgba(255, 196, 84, 0.12), transparent 28%);
  box-shadow:
    0 30px 90px rgba(1, 5, 10, 0.62),
    inset 0 1px 0 rgba(255, 240, 194, 0.08);
}

.mission-log-shell__glow,
.mission-log-shell__grain {
  pointer-events: none;
  position: absolute;
  inset: 0;
}

.mission-log-shell__glow--amber {
  background: radial-gradient(circle at 22% 28%, rgba(250, 204, 21, 0.13), transparent 34%);
}

.mission-log-shell__glow--moss {
  background: radial-gradient(circle at 72% 58%, rgba(74, 222, 128, 0.1), transparent 38%);
}

.mission-log-shell__grain {
  opacity: 0.16;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 100% 26px, 26px 100%;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent 92%);
}

.mission-log-header {
  position: relative;
  border-color: rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(11, 24, 30, 0.9), rgba(8, 18, 25, 0.86)),
    radial-gradient(circle at top left, rgba(250, 204, 21, 0.08), transparent 26%);
}

.mission-log-title {
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}

.mission-log-close {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(11, 22, 30, 0.74);
  color: rgba(241, 245, 249, 0.92);
}

.mission-log-close:hover {
  background: rgba(23, 37, 45, 0.9);
  border-color: rgba(251, 191, 36, 0.34);
}

.mission-log-chip {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(10, 21, 28, 0.74);
  color: rgba(226, 232, 240, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.mission-log-chip--amber {
  border-color: rgba(245, 195, 92, 0.26);
  background: rgba(104, 72, 18, 0.28);
  color: rgba(254, 243, 199, 0.98);
}

.mission-log-tab {
  border-color: rgba(255, 255, 255, 0.09);
  background: rgba(8, 18, 25, 0.72);
  color: rgba(203, 213, 225, 0.78);
}

.mission-log-tab--active {
  border-color: rgba(245, 195, 92, 0.32);
  background: linear-gradient(180deg, rgba(110, 77, 20, 0.56), rgba(66, 49, 19, 0.42));
  color: rgba(255, 247, 214, 0.98);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.22);
}

.mission-stat,
.mission-panel,
.mission-objective-card {
  position: relative;
  overflow: hidden;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.mission-stat::before,
.mission-panel::before,
.mission-objective-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 45%);
}

.mission-stat {
  background:
    linear-gradient(180deg, rgba(10, 20, 26, 0.88), rgba(7, 15, 20, 0.92)),
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.05), transparent 34%);
}

.mission-stat--amber {
  background:
    linear-gradient(180deg, rgba(57, 44, 14, 0.7), rgba(19, 24, 22, 0.94)),
    radial-gradient(circle at top left, rgba(250, 204, 21, 0.16), transparent 34%);
}

.mission-stat--ocean {
  background:
    linear-gradient(180deg, rgba(12, 45, 63, 0.58), rgba(10, 20, 26, 0.93)),
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 34%);
}

.mission-stat--fern {
  background:
    linear-gradient(180deg, rgba(16, 62, 39, 0.56), rgba(10, 20, 26, 0.93)),
    radial-gradient(circle at top left, rgba(74, 222, 128, 0.14), transparent 34%);
}

.mission-stat--ember {
  background:
    linear-gradient(180deg, rgba(71, 27, 31, 0.58), rgba(10, 20, 26, 0.93)),
    radial-gradient(circle at top left, rgba(251, 113, 133, 0.14), transparent 34%);
}

.mission-panel--briefing {
  background:
    linear-gradient(180deg, rgba(68, 52, 18, 0.46), rgba(15, 24, 28, 0.93)),
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 34%);
}

.mission-panel--subtle {
  background:
    linear-gradient(180deg, rgba(10, 20, 26, 0.84), rgba(7, 15, 20, 0.92)),
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.04), transparent 34%);
}

.mission-panel--unlock {
  background:
    linear-gradient(180deg, rgba(14, 54, 41, 0.56), rgba(8, 18, 24, 0.92)),
    radial-gradient(circle at top left, rgba(52, 211, 153, 0.16), transparent 34%);
}

.mission-objective-card--active {
  background:
    linear-gradient(180deg, rgba(10, 20, 26, 0.86), rgba(8, 18, 23, 0.94)),
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.08), transparent 34%);
}

.mission-objective-card--completed {
  background:
    linear-gradient(180deg, rgba(13, 54, 39, 0.58), rgba(8, 18, 23, 0.94)),
    radial-gradient(circle at top left, rgba(74, 222, 128, 0.16), transparent 34%);
  border-color: rgba(52, 211, 153, 0.24);
}

.mission-progress-track {
  background:
    linear-gradient(180deg, rgba(7, 15, 20, 0.95), rgba(11, 24, 30, 0.82));
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.42);
}

.mission-progress-fill {
  position: relative;
}

.mission-progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0 12%, transparent 12% 24%, rgba(255, 255, 255, 0.4) 24% 36%, transparent 36% 48%);
  background-size: 28px 100%;
}

.mission-progress-fill--active {
  background: linear-gradient(90deg, rgba(250, 204, 21, 0.95), rgba(253, 186, 116, 0.98));
  box-shadow: 0 0 18px rgba(245, 158, 11, 0.26);
}

.mission-progress-fill--completed {
  background: linear-gradient(90deg, rgba(52, 211, 153, 0.98), rgba(110, 231, 183, 0.98));
  box-shadow: 0 0 18px rgba(16, 185, 129, 0.28);
}
</style>
