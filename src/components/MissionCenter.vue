<template>
  <Transition name="smooth-modal" appear>
    <div
      v-if="isOpen && run"
      class="chronicle-backdrop fixed inset-0 z-50 overflow-y-auto p-3 text-white backdrop-blur-sm sm:p-5"
      @click.self="closeMissionCenter"
    >
      <section class="chronicle-shell mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border sm:min-h-0 sm:max-h-[calc(100dvh-3rem)]">
        <header class="chronicle-header border-b px-4 py-4 sm:px-6 sm:py-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <p class="pixel-font text-[10px] uppercase tracking-[0.24em] text-amber-200/90">Chronicle</p>
              <div class="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-200/80">
                <span class="chronicle-chip chronicle-chip--warm">{{ run.chapter.actLabel }}</span>
                <span class="chronicle-chip">{{ run.chapter.chapterLabel }}</span>
                <span class="chronicle-chip">Chapter {{ run.chapterNumber }}</span>
              </div>
              <h2 class="mt-3 text-xl font-semibold text-white sm:text-3xl">{{ run.chapter.title }}</h2>
              <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{{ run.chapter.kicker }}</p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div class="chronicle-stat">
                <p class="chronicle-stat__label">Primary</p>
                <p class="chronicle-stat__value">{{ completedRequired }}/{{ totalRequired || 0 }}</p>
              </div>
              <div class="chronicle-stat">
                <p class="chronicle-stat__label">Score</p>
                <p class="chronicle-stat__value">{{ run.score }}</p>
              </div>
              <div class="chronicle-stat">
                <p class="chronicle-stat__label">Chapter</p>
                <p class="chronicle-stat__value">{{ run.chapterScore }}</p>
              </div>
              <button class="chronicle-close" @click="closeMissionCenter">Close</button>
            </div>
          </div>

          <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div class="chronicle-panel">
              <p class="chronicle-panel__label">Mutator</p>
              <p class="chronicle-panel__value">{{ run.mutator.name }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ run.mutator.description }}</p>
            </div>
            <div class="chronicle-panel">
              <p class="chronicle-panel__label">Active / Owned</p>
              <p class="chronicle-panel__value">{{ activeOwnedLabel }}</p>
              <p class="mt-1 text-xs text-slate-400">Support {{ supportCapacity }}</p>
            </div>
            <div class="chronicle-panel">
              <p class="chronicle-panel__label">Inactive</p>
              <p class="chronicle-panel__value">{{ inactiveTileCount }}</p>
              <p class="mt-1 text-xs text-slate-400">Restored {{ run.restoredTiles }}</p>
            </div>
            <div class="chronicle-panel" :class="pressureClass">
              <p class="chronicle-panel__label">Pressure</p>
              <p class="chronicle-panel__value">{{ pressureLabel }}</p>
              <p class="mt-1 text-xs text-slate-400">Population {{ populationState.current }}/{{ populationState.max }}</p>
            </div>
            <div class="chronicle-panel chronicle-panel--accent">
              <p class="chronicle-panel__label">Path Forward</p>
              <p class="chronicle-panel__value">{{ nextNode?.label ?? 'Keep expanding' }}</p>
              <p class="mt-1 text-xs text-slate-300">{{ summaryText }}</p>
            </div>
          </div>

          <nav class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="chronicle-tab"
              :class="{ 'chronicle-tab--active': activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </nav>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <section v-if="activeTab === 'story'" class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <article class="chronicle-card">
              <p class="chronicle-card__kicker">Story</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ run.chapter.title }}</h3>
              <p class="mt-3 text-sm leading-relaxed text-slate-300">{{ run.chapter.briefing }}</p>

              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div class="chronicle-subcard">
                  <p class="chronicle-subcard__label">Why It Matters</p>
                  <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.chapter.stakes }}</p>
                </div>
                <div class="chronicle-subcard">
                  <p class="chronicle-subcard__label">Advisor Note</p>
                  <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ run.chapter.guidance }}</p>
                </div>
              </div>

              <div v-if="newUnlocks.length" class="mt-4">
                <p class="chronicle-card__kicker">Fresh Milestones</p>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <article
                    v-for="unlock in newUnlocks"
                    :key="`${unlock.kind}:${unlock.key}`"
                    class="chronicle-subcard"
                  >
                    <p class="chronicle-subcard__label">{{ unlockKindLabel(unlock.kind) }}</p>
                    <p class="mt-1 text-sm font-semibold text-white">{{ unlock.label }}</p>
                    <p class="mt-1 text-xs leading-relaxed text-slate-300">{{ unlock.description }}</p>
                  </article>
                </div>
              </div>
            </article>

            <article class="chronicle-card">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="chronicle-card__kicker">Conversation</p>
                  <h3 class="mt-2 text-lg font-semibold text-white">Recent dialogue</h3>
                </div>
                <span class="chronicle-chip">{{ dialogueEntries.length }} entries</span>
              </div>

              <div class="mt-4 space-y-3">
                <article
                  v-for="entry in dialogueEntries"
                  :key="entry.id"
                  class="chronicle-dialogue"
                  :class="{ 'chronicle-dialogue--active': entry.id === run.dialogue.activeEntryId }"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-white">{{ entry.speaker.name }}</p>
                      <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {{ entry.kind.replaceAll('_', ' ') }}
                      </p>
                    </div>
                    <span class="chronicle-chip">Chapter {{ entry.chapterNumber }}</span>
                  </div>
                  <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ entry.text }}</p>
                </article>
              </div>
            </article>
          </section>

          <section v-else-if="activeTab === 'roadmap'" class="space-y-4">
            <article class="chronicle-card">
              <p class="chronicle-card__kicker">Recommended Next</p>
              <h3 class="mt-2 text-lg font-semibold text-white">{{ nextNode?.label ?? 'Keep building momentum' }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ nextNode?.description ?? summaryText }}</p>
              <div v-if="nextNode" class="mt-4 flex flex-wrap gap-2">
                <span
                  v-for="requirement in nextNode.requirements"
                  :key="`${nextNode.key}:${requirement.label}`"
                  class="chronicle-chip"
                  :class="requirement.satisfied ? 'chronicle-chip--good' : 'chronicle-chip--blocked'"
                >
                  {{ requirement.label }} · {{ requirement.currentLabel }}
                </span>
              </div>
            </article>

            <div class="grid gap-4 xl:grid-cols-2">
              <article
                v-for="section in roadmapSections"
                :key="section.lane"
                class="chronicle-card"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="chronicle-card__kicker">Roadmap Lane</p>
                    <h3 class="mt-2 text-lg font-semibold text-white">{{ section.lane }}</h3>
                  </div>
                  <span class="chronicle-chip">{{ section.nodes.filter((node) => node.unlocked).length }}/{{ section.nodes.length }}</span>
                </div>

                <div class="mt-4 space-y-3">
                  <article
                    v-for="node in section.nodes"
                    :key="node.key"
                    class="chronicle-roadmap-node"
                    :class="{
                      'chronicle-roadmap-node--done': node.unlocked,
                      'chronicle-roadmap-node--next': node.key === nextNode?.key,
                    }"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-white">{{ node.label }}</p>
                        <p class="mt-1 text-xs leading-relaxed text-slate-300">{{ node.description }}</p>
                      </div>
                      <span class="chronicle-chip" :class="node.unlocked ? 'chronicle-chip--good' : 'chronicle-chip--blocked'">
                        {{ node.unlocked ? 'Unlocked' : 'Locked' }}
                      </span>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <span
                        v-for="unlock in node.unlocks"
                        :key="`${node.key}:${unlock.kind}:${unlock.key}`"
                        class="chronicle-chip"
                      >
                        {{ unlock.label }}
                      </span>
                    </div>

                    <div v-if="node.requirements.length" class="mt-3 space-y-2">
                      <div
                        v-for="requirement in node.requirements"
                        :key="`${node.key}:${requirement.label}`"
                        class="chronicle-requirement"
                      >
                        <div class="flex items-center justify-between gap-3 text-xs">
                          <span>{{ requirement.label }}</span>
                          <span>{{ requirement.currentLabel }}</span>
                        </div>
                        <div class="chronicle-progress">
                          <div
                            class="chronicle-progress__fill"
                            :class="requirement.satisfied ? 'chronicle-progress__fill--done' : ''"
                            :style="{ width: `${requirementProgressWidth(requirement.current, requirement.target)}%` }"
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="activeTab === 'objectives'" class="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <article class="chronicle-card">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="chronicle-card__kicker">Objectives</p>
                  <h3 class="mt-2 text-lg font-semibold text-white">Current charter goals</h3>
                </div>
                <span class="chronicle-chip">{{ completedRequired }}/{{ totalRequired || 0 }} primary</span>
              </div>

              <div class="mt-4 space-y-3">
                <article
                  v-for="objective in run.objectives"
                  :key="objective.id"
                  class="chronicle-objective"
                  :class="{ 'chronicle-objective--done': objective.completed }"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-white">{{ objective.title }}</p>
                      <p class="mt-1 text-sm leading-relaxed text-slate-300">{{ objective.description }}</p>
                    </div>
                    <span class="chronicle-chip" :class="objective.required ? '' : 'chronicle-chip--warm'">
                      {{ objective.required ? 'Primary' : 'Bonus' }}
                    </span>
                  </div>
                  <div class="mt-3 chronicle-progress">
                    <div
                      class="chronicle-progress__fill"
                      :class="{ 'chronicle-progress__fill--done': objective.completed }"
                      :style="{ width: `${requirementProgressWidth(objective.progress, objective.target)}%` }"
                    />
                  </div>
                  <div class="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{{ objective.progress }}/{{ objective.target }}</span>
                    <span v-if="objective.reward?.scoreBonus">{{ formatBonus(objective.reward.scoreBonus) }}</span>
                  </div>
                </article>
              </div>
            </article>

            <article class="chronicle-card">
              <p class="chronicle-card__kicker">Advice</p>
              <h3 class="mt-2 text-lg font-semibold text-white">What keeps the colony moving</h3>
              <ul class="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <li>Story chapters guide the pace, but unlocks now come from population, buildings, staffed production, resources, and frontier reach.</li>
                <li>Open the roadmap to see every milestone lane and the exact blocker holding the next one shut.</li>
                <li>Upgrades appear directly on eligible buildings, so stronger housing, storage, and industry come from improving what you already built.</li>
                <li>{{ run.chapter.nextHint }}</li>
              </ul>
            </article>
          </section>

          <section v-else class="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <article class="chronicle-card">
              <p class="chronicle-card__kicker">Archive</p>
              <h3 class="mt-2 text-lg font-semibold text-white">Completed chapters</h3>
              <div class="mt-4 space-y-3">
                <article
                  v-for="chapter in archivedChapters"
                  :key="`chapter:${chapter.chapterNumber}`"
                  class="chronicle-subcard"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-white">Chapter {{ chapter.chapterNumber }}</p>
                      <p class="text-xs text-slate-400">{{ chapter.chapter.title }}</p>
                    </div>
                    <span class="chronicle-chip chronicle-chip--good">{{ chapter.score }} pts</span>
                  </div>
                  <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ chapter.summary }}</p>
                </article>
                <p v-if="!archivedChapters.length" class="text-sm text-slate-400">No completed chapters archived yet.</p>
              </div>
            </article>

            <article class="chronicle-card">
              <p class="chronicle-card__kicker">Log</p>
              <h3 class="mt-2 text-lg font-semibold text-white">Dialogue history</h3>
              <div class="mt-4 space-y-3">
                <article
                  v-for="entry in archiveDialogueEntries"
                  :key="`archive:${entry.id}`"
                  class="chronicle-dialogue"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-white">{{ entry.speaker.name }}</p>
                      <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        Chapter {{ entry.chapterNumber }} · {{ entry.kind.replaceAll('_', ' ') }}
                      </p>
                    </div>
                  </div>
                  <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ entry.text }}</p>
                </article>
              </div>
            </article>
          </section>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { closeWindow, isWindowActive, WINDOW_IDS } from '../core/windowManager';
import { runSnapshot } from '../store/runStore.ts';
import { populationState } from '../store/clientPopulationStore';
import { getNewlyUnlockedStoryDescriptors } from '../shared/story/progression.ts';

const activeTab = ref<'story' | 'roadmap' | 'objectives' | 'archive'>('story');

const tabs = [
  { key: 'story', label: 'Story' },
  { key: 'roadmap', label: 'Roadmap' },
  { key: 'objectives', label: 'Objectives' },
  { key: 'archive', label: 'Archive' },
] as const;

const isOpen = computed(() => isWindowActive(WINDOW_IDS.MISSION_CENTER));
const run = computed(() => runSnapshot.value);
const requiredObjectives = computed(() => run.value?.objectives.filter((objective) => objective.required) ?? []);
const totalRequired = computed(() => requiredObjectives.value.length);
const completedRequired = computed(() => requiredObjectives.value.filter((objective) => objective.completed).length);
const activeOwnedLabel = computed(() => `${run.value?.activeTiles ?? populationState.activeTileCount} / ${ownedTileCount.value}`);
const supportCapacity = computed(() => populationState.supportCapacity);
const inactiveTileCount = computed(() => run.value?.inactiveTiles ?? populationState.inactiveTileCount);
const ownedTileCount = computed(() => (run.value?.activeTiles ?? populationState.activeTileCount) + inactiveTileCount.value);
const newUnlocks = computed(() => run.value ? getNewlyUnlockedStoryDescriptors(run.value.progression) : []);
const nextNode = computed(() => {
  const nextNodeKey = run.value?.progression.nextRecommendedNodeKeys[0];
  return nextNodeKey
    ? (run.value?.progression.nodes.find((node) => node.key === nextNodeKey) ?? null)
    : null;
});
const summaryText = computed(() => run.value?.summary ?? 'Keep pushing the frontier.');
const roadmapSections = computed(() => {
  const lanes = ['Settlement', 'Food', 'Logistics', 'Industry', 'Frontier', 'Upgrades'] as const;
  const nodes = run.value?.progression.nodes ?? [];
  return lanes.map((lane) => ({
    lane,
    nodes: nodes.filter((node) => node.category === lane),
  })).filter((section) => section.nodes.length > 0);
});
const dialogueEntries = computed(() => (run.value?.dialogue.entries ?? []).slice().reverse().slice(0, 6));
const archivedChapters = computed(() => (run.value?.chapterArchive ?? []).slice().reverse());
const archiveDialogueEntries = computed(() => (run.value?.dialogue.entries ?? []).slice().reverse());
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
      return 'chronicle-panel--danger';
    case 'strained':
      return 'chronicle-panel--warning';
    case 'stable':
    default:
      return 'chronicle-panel--good';
  }
});

function closeMissionCenter() {
  activeTab.value = 'story';
  closeWindow(WINDOW_IDS.MISSION_CENTER);
}

function requirementProgressWidth(current: number, target: number) {
  if (target <= 0) {
    return 100;
  }

  return Math.max(6, Math.min(100, (current / target) * 100));
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
      return 'Action';
    case 'terrain':
      return 'Terrain';
    case 'upgrade':
      return 'Upgrade';
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
.chronicle-backdrop {
  background:
    radial-gradient(circle at 18% 18%, rgba(245, 158, 11, 0.12), transparent 24%),
    radial-gradient(circle at 80% 82%, rgba(74, 222, 128, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.76), rgba(2, 6, 23, 0.92));
}

.chronicle-shell {
  border-color: rgba(245, 195, 92, 0.18);
  background:
    linear-gradient(180deg, rgba(7, 18, 22, 0.96), rgba(5, 14, 19, 0.98)),
    radial-gradient(circle at top left, rgba(255, 196, 84, 0.1), transparent 28%);
  box-shadow:
    0 32px 100px rgba(1, 5, 10, 0.65),
    inset 0 1px 0 rgba(255, 240, 194, 0.08);
}

.chronicle-header {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.62), rgba(15, 23, 42, 0.2));
  border-color: rgba(255, 255, 255, 0.08);
}

.chronicle-chip {
  @apply inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200;
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.7);
}

.chronicle-chip--warm {
  border-color: rgba(245, 195, 92, 0.26);
  background: rgba(245, 158, 11, 0.12);
  color: rgb(253 230 138 / 0.95);
}

.chronicle-chip--good {
  border-color: rgba(74, 222, 128, 0.28);
  background: rgba(34, 197, 94, 0.12);
  color: rgb(187 247 208 / 0.95);
}

.chronicle-chip--blocked {
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.58);
  color: rgb(203 213 225 / 0.92);
}

.chronicle-stat,
.chronicle-panel,
.chronicle-card,
.chronicle-subcard,
.chronicle-dialogue,
.chronicle-roadmap-node,
.chronicle-objective {
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.48);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.chronicle-stat {
  @apply min-w-[6.5rem] rounded-2xl px-4 py-3;
}

.chronicle-stat__label,
.chronicle-panel__label,
.chronicle-card__kicker,
.chronicle-subcard__label {
  @apply text-[10px] uppercase tracking-[0.18em] text-slate-400;
}

.chronicle-stat__value,
.chronicle-panel__value {
  @apply mt-2 text-lg font-semibold text-white;
}

.chronicle-panel,
.chronicle-card,
.chronicle-subcard,
.chronicle-dialogue,
.chronicle-roadmap-node,
.chronicle-objective {
  @apply rounded-[1.4rem] px-4 py-4;
}

.chronicle-panel--accent {
  background:
    linear-gradient(180deg, rgba(245, 158, 11, 0.1), rgba(15, 23, 42, 0.5)),
    rgba(15, 23, 42, 0.48);
}

.chronicle-panel--good {
  background: rgba(34, 197, 94, 0.1);
}

.chronicle-panel--warning {
  background: rgba(245, 158, 11, 0.1);
}

.chronicle-panel--danger {
  background: rgba(244, 63, 94, 0.12);
}

.chronicle-close {
  @apply rounded-xl border px-3 py-2 text-sm text-slate-100 transition-colors;
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.82);
}

.chronicle-close:hover,
.chronicle-tab:hover {
  background: rgba(30, 41, 59, 0.88);
}

.chronicle-tab {
  @apply rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300 transition-colors;
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.56);
}

.chronicle-tab--active {
  border-color: rgba(245, 195, 92, 0.28);
  background: rgba(245, 158, 11, 0.16);
  color: rgb(254 243 199 / 0.98);
}

.chronicle-dialogue--active,
.chronicle-roadmap-node--next {
  border-color: rgba(245, 195, 92, 0.24);
  background: rgba(245, 158, 11, 0.1);
}

.chronicle-roadmap-node--done,
.chronicle-objective--done {
  border-color: rgba(74, 222, 128, 0.2);
  background: rgba(34, 197, 94, 0.08);
}

.chronicle-progress {
  @apply mt-2 h-2 overflow-hidden rounded-full;
  background: rgba(51, 65, 85, 0.88);
}

.chronicle-progress__fill {
  @apply h-full rounded-full transition-all duration-500;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.85), rgba(251, 191, 36, 0.95));
}

.chronicle-progress__fill--done {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.85), rgba(74, 222, 128, 0.95));
}
</style>
