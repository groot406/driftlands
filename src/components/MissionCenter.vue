<template>
  <Transition name="smooth-modal" appear>
    <div
      v-if="isOpen && run"
      class="smooth-modal-backdrop fixed inset-0 z-50 overflow-y-auto bg-black/55 p-2 text-white backdrop-blur-sm sm:p-4"
      @click.self="closeMissionCenter"
    >
      <section class="smooth-modal-surface mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/94 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(94vw,72rem)]">
        <header class="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/96 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="pixel-font text-[10px] uppercase tracking-[0.2em] text-amber-300/80">{{ run.modeLabel }}</p>
              <div class="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] sm:mt-3">
                <span class="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-amber-100 sm:px-3">{{ run.story.actLabel }}</span>
                <span class="rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-slate-200 sm:px-3">{{ run.story.chapterLabel }}</span>
              </div>
              <h2 class="mt-3 text-lg font-semibold text-white sm:text-2xl">Mission {{ run.missionNumber }} · {{ run.story.title }}</h2>
              <p class="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">{{ run.story.kicker }}</p>
            </div>
            <button
              class="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-slate-700 sm:text-sm"
              @click="closeMissionCenter"
            >
              Close
            </button>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Primary Goals</p>
              <p class="mt-2 font-mono text-xl font-semibold text-white sm:text-2xl">{{ primaryGoalProgress }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Total Score</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ run.score }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Mission Score</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ run.missionScore }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Mutator</p>
              <p class="mt-2 text-sm font-semibold text-white sm:text-lg">{{ run.mutator.name }}</p>
            </div>
          </div>

          <div class="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-4 sm:gap-3">
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Active / Owned</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ activeOwnedLabel }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Support Capacity</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ supportCapacity }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/65 px-3 py-3 sm:px-4">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Inactive Tiles</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">{{ inactiveTileCount }}</p>
            </div>
            <div class="rounded-2xl border px-3 py-3 sm:px-4" :class="pressureClass">
              <p class="text-[10px] uppercase tracking-[0.14em] text-slate-300">Pressure State</p>
              <p class="mt-2 text-sm font-semibold text-white sm:text-lg">{{ pressureLabel }}</p>
            </div>
          </div>

          <div class="mt-3 flex gap-2 overflow-x-auto pb-1 sm:hidden">
            <button
              v-for="tab in mobileTabs"
              :key="tab.key"
              class="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors"
              :class="mobileTab === tab.key ? 'border-amber-300/40 bg-amber-400/12 text-amber-100' : 'border-slate-700 bg-slate-950/70 text-slate-300'"
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
              <span class="rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                {{ completedRequired }}/{{ totalRequired }} primary
              </span>
            </div>

            <div class="mt-3 space-y-2.5">
              <article
                v-for="objective in run.objectives"
                :key="objective.id"
                class="rounded-2xl border px-3 py-3"
                :class="objective.completed ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'"
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

                <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="objective.completed ? 'bg-emerald-400' : 'bg-amber-300'"
                    :style="{ width: `${objectiveProgressWidth(objective)}%` }"
                  />
                </div>

                <div class="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                  <span>{{ objective.progress }}/{{ objective.target }}</span>
                  <span v-if="objective.reward?.scoreBonus">{{ formatBonus(objective.reward.scoreBonus) }}</span>
                </div>
              </article>
            </div>
          </div>

          <div v-else-if="mobileTab === 'briefing'" class="h-full overflow-y-auto px-4 py-4">
            <div class="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-amber-200/80">Story Briefing</p>
              <h3 class="mt-2 text-base font-semibold text-white">{{ run.story.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-200">{{ run.story.briefing }}</p>

              <div class="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Why This Charter Matters</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.story.stakes }}</p>
              </div>

              <div class="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Field Guidance</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.story.guidance }}</p>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Current Mutator</p>
              <h3 class="mt-2 text-base font-semibold text-white">{{ run.mutator.name }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.mutator.description }}</p>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Campaign Notes</p>
              <ul class="mt-3 space-y-2 text-sm text-slate-300">
                <li>Press <span class="rounded bg-slate-800 px-2 py-1 text-xs text-white">M</span> to reopen this log at any time.</li>
                <li>Press <span class="rounded bg-slate-800 px-2 py-1 text-xs text-white">V</span> to inspect stable, fragile, inactive, and uncontrolled territory.</li>
                <li>Primary objectives carry the colony forward. Bonus goals add score, but only primary goals advance the campaign.</li>
                <li>{{ run.story.nextHint }}</li>
              </ul>
            </div>
          </div>

          <div v-else class="h-full overflow-y-auto px-4 py-4">
            <div class="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Campaign Unlocks</p>

              <div class="mt-3 space-y-3">
                <div v-for="section in unlockSections" :key="section.title">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-white">{{ section.title }}</p>
                    <span class="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                      {{ section.entries.length }}
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-for="entry in section.entries"
                      :key="entry.key"
                      class="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-200"
                      :title="entry.description"
                    >
                      {{ entry.label }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="newUnlocks.length" class="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">New For Mission {{ run.missionNumber }}</p>
                <div class="mt-3 grid gap-2">
                  <article
                    v-for="unlock in newUnlocks"
                    :key="`${unlock.kind}:${unlock.key}`"
                    class="rounded-xl border border-emerald-500/15 bg-slate-950/55 px-3 py-3"
                  >
                    <p class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">{{ unlockKindLabel(unlock.kind) }}</p>
                    <p class="mt-1 text-sm font-semibold text-white">{{ unlock.label }}</p>
                    <p class="mt-1 text-xs leading-relaxed text-slate-300">{{ unlock.description }}</p>
                  </article>
                </div>
              </div>
            </div>

            <div v-if="run.lastCompletedMission" class="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">Last Mission</p>
              <h3 class="mt-2 text-base font-semibold text-white">{{ run.lastCompletedMission.story.completionTitle }}</h3>
              <p class="mt-2 text-sm text-slate-300">{{ run.lastCompletedMission.story.completionText }}</p>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Mission Score</p>
                  <p class="mt-1 text-lg font-semibold text-white">{{ run.lastCompletedMission.score }}</p>
                </div>
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Total Score</p>
                  <p class="mt-1 text-lg font-semibold text-white">{{ run.lastCompletedMission.totalScore }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto sm:grid lg:grid-cols-[1.1fr_0.9fr]">
          <div class="min-h-0 overflow-visible border-b border-slate-800 px-6 py-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-lg font-semibold text-white">Current Charter</h3>
              <span class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                Completed {{ completedRequired }}/{{ totalRequired }} primary
              </span>
            </div>

            <div class="mt-4 space-y-3">
              <article
                v-for="objective in run.objectives"
                :key="objective.id"
                class="rounded-2xl border px-4 py-4"
                :class="objective.completed ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'"
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

                <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="objective.completed ? 'bg-emerald-400' : 'bg-amber-300'"
                    :style="{ width: `${objectiveProgressWidth(objective)}%` }"
                  />
                </div>

                <div class="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>{{ objective.progress }}/{{ objective.target }}</span>
                  <span v-if="objective.reward?.scoreBonus">{{ formatBonus(objective.reward.scoreBonus) }}</span>
                </div>
              </article>
            </div>
          </div>

          <div class="min-h-0 overflow-visible px-6 py-5 lg:overflow-y-auto">
            <div class="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-amber-200/80">Story Briefing</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.story.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-200">{{ run.story.briefing }}</p>

              <div class="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Why This Charter Matters</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.story.stakes }}</p>
              </div>

              <div class="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Field Guidance</p>
                <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.story.guidance }}</p>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Current Mutator</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.mutator.name }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.mutator.description }}</p>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Campaign Unlocks</p>

              <div class="mt-3 space-y-3">
                <div v-for="section in unlockSections" :key="section.title">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-white">{{ section.title }}</p>
                    <span class="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                      {{ section.entries.length }}
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-for="entry in section.entries"
                      :key="entry.key"
                      class="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-200"
                      :title="entry.description"
                    >
                      {{ entry.label }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="newUnlocks.length" class="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">New For Mission {{ run.missionNumber }}</p>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <article
                    v-for="unlock in newUnlocks"
                    :key="`${unlock.kind}:${unlock.key}`"
                    class="rounded-xl border border-emerald-500/15 bg-slate-950/55 px-3 py-3"
                  >
                    <p class="text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">{{ unlockKindLabel(unlock.kind) }}</p>
                    <p class="mt-1 text-sm font-semibold text-white">{{ unlock.label }}</p>
                    <p class="mt-1 text-xs leading-relaxed text-slate-300">{{ unlock.description }}</p>
                  </article>
                </div>
              </div>
            </div>

            <div v-if="run.lastCompletedMission" class="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">Last Mission</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.lastCompletedMission.story.completionTitle }}</h3>
              <p class="mt-2 text-sm text-slate-300">{{ run.lastCompletedMission.story.completionText }}</p>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Mission Score</p>
                  <p class="mt-1 text-xl font-semibold text-white">{{ run.lastCompletedMission.score }}</p>
                </div>
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
                  <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400">Total Score</p>
                  <p class="mt-1 text-xl font-semibold text-white">{{ run.lastCompletedMission.totalScore }}</p>
                </div>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p class="text-[10px] uppercase tracking-[0.16em] text-slate-400">Campaign Notes</p>
              <ul class="mt-3 space-y-2 text-sm text-slate-300">
                <li>Press <span class="rounded bg-slate-800 px-2 py-1 text-xs text-white">M</span> to reopen this log at any time.</li>
                <li>Press <span class="rounded bg-slate-800 px-2 py-1 text-xs text-white">V</span> to inspect stable, fragile, inactive, and uncontrolled territory.</li>
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
