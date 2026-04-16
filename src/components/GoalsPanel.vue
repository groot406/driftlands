<template>
  <Transition name="goals-slide">
    <aside
      v-if="isOpen"
      class="goals-panel pointer-events-auto"
    >
      <div class="goals-panel__header">
        <div>
          <p class="goals-panel__kicker pixel-font">Objectives</p>
          <h2 class="goals-panel__title">Current Goals</h2>
        </div>
        <button class="goals-panel__close" @click="close" title="Close goals panel">
          &#x2715;
        </button>
      </div>

      <!-- Chapter summary -->
      <div v-if="chapterSummary" class="goals-panel__summary">
        <p class="text-[10px] uppercase tracking-[0.16em] text-amber-200/70">Path Forward</p>
        <p class="mt-1 text-[12px] leading-relaxed text-slate-300">{{ chapterSummary }}</p>
      </div>

      <!-- Next recommended milestones -->
      <div v-if="nextGoals.length" class="goals-panel__list">
        <article
          v-for="goal in nextGoals"
          :key="goal.key"
          class="goals-panel__goal"
          :class="goal.unlocked ? 'goals-panel__goal--done' : ''"
        >
          <div class="flex items-start gap-2">
            <span
              class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              :class="goal.unlocked ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-amber-300/80'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-[13px] font-semibold" :class="goal.unlocked ? 'text-emerald-100' : 'text-white'">
                  {{ goal.label }}
                </h3>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]"
                  :class="goal.unlocked ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-slate-300'"
                >
                  {{ goal.unlocked ? 'Done' : goal.category }}
                </span>
              </div>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ goal.description }}</p>

              <!-- Requirements / sub-tasks -->
              <div v-if="!goal.unlocked && goal.requirements.length" class="mt-2 space-y-1">
                <div
                  v-for="(req, ri) in goal.requirements"
                  :key="ri"
                  class="flex items-center gap-2"
                >
                  <span
                    class="h-1.5 w-1.5 shrink-0 rounded-full"
                    :class="req.satisfied ? 'bg-emerald-400' : 'bg-slate-500'"
                  />
                  <span
                    class="text-[11px]"
                    :class="req.satisfied ? 'text-emerald-300 line-through opacity-60' : 'text-slate-300'"
                  >
                    {{ req.label }}
                  </span>
                  <span class="ml-auto text-[10px] font-mono text-slate-500">{{ req.currentLabel }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="px-4 py-6 text-center text-[11px] text-slate-500">
        No current goals — explore the frontier.
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { runSnapshot } from '../store/runStore.ts';
import { closeGoalsPanel, isGoalsPanelOpen } from '../store/chronicleStore.ts';

const isOpen = isGoalsPanelOpen;

const run = computed(() => runSnapshot.value);
const chapterSummary = computed(() => run.value?.summary ?? null);

const nextGoals = computed(() => {
  if (!run.value) return [];
  const nodes = run.value.progression.nodes;
  const recommended = new Set(run.value.progression.nextRecommendedNodeKeys);

  // Show recently unlocked (as "done") + next recommended (as "todo")
  const recentlyDone = nodes
    .filter((n) => n.recentlyUnlocked)
    .map((n) => ({ ...n }));

  const upcoming = nodes
    .filter((n) => recommended.has(n.key) && !n.unlocked)
    .map((n) => ({ ...n }));

  return [...recentlyDone, ...upcoming];
});

function close() {
  closeGoalsPanel();
}
</script>

<style scoped>
.goals-panel {
  position: fixed;
  right: 1rem;
  bottom: 4.75rem;
  z-index: 60;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 8rem);
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.16), transparent 36%),
    radial-gradient(circle at 85% 20%, rgba(34, 211, 238, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(16, 24, 39, 0.92), rgba(15, 23, 42, 0.9));
  box-shadow: 0 20px 38px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.goals-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 0;
}

.goals-panel__close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.5);
  color: rgba(248, 250, 252, 0.86);
  font-size: 12px;
  cursor: pointer;
}

.goals-panel__kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(253, 186, 116, 0.9);
}

.goals-panel__title {
  margin: 6px 0 0;
  font-size: 1rem;
  font-weight: 700;
  color: #f8fafc;
}

.goals-panel__summary {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.44);
}

.goals-panel__list {
  overflow-y: auto;
  max-height: calc(100vh - 16rem);
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.goals-panel__goal {
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.44);
  border: 1px solid rgba(148, 163, 184, 0.12);
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.goals-panel__goal:last-child {
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.goals-panel__goal:hover {
  background: rgba(15, 23, 42, 0.58);
  border-color: rgba(245, 158, 11, 0.18);
}

.goals-panel__goal--done {
  background: rgba(22, 101, 52, 0.18);
  border-color: rgba(74, 222, 128, 0.16);
}

/* Slide transition */
.goals-slide-enter-active,
.goals-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.goals-slide-enter-from,
.goals-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 640px) {
  .goals-panel {
    right: 12px;
    bottom: 72px;
    width: min(300px, calc(100vw - 24px));
    max-height: calc(100vh - 108px);
  }
}
</style>
