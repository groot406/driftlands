<template>
  <Teleport to="body">
    <Transition name="season-board-modal">
      <div
        v-if="season && expanded"
        class="season-board-backdrop"
        @click.self="closeScoreboard"
      >
        <PanelModalShell
          class="season-board-modal"
          role="dialog"
          aria-modal="true"
          header-label="Season"
          :header-title="panelTitle"
          header-icon="*"
          header-icon-color="amber"
          header-icon-variant="star"
          close-title="Close season board"
          close-aria-label="Close season board"
          @close="closeScoreboard"
        >
          <div class="season-board__body">
            <section class="season-board__summary" aria-label="Season summary">
              <article>
                <span>Stage</span>
                <strong>{{ stageLabel }}</strong>
              </article>
              <article>
                <span>{{ nextStageLabel }}</span>
                <strong>{{ countdown }}</strong>
              </article>
              <article>
                <span>Your Rank</span>
                <strong>{{ ownEntry ? `#${ownEntry.rank}` : '--' }}</strong>
              </article>
              <article>
                <span>Your Score</span>
                <strong>{{ ownEntry ? formatNumber(ownEntry.score) : '0' }}</strong>
              </article>
            </section>

            <section class="season-board__timeline" aria-label="Season timeline">
              <span
                v-for="stage in season.config.stages"
                :key="stage.key"
                :class="{ 'season-board__timeline-stage--active': stage.key === season.currentStage, 'season-board__timeline-stage--disabled': !stage.enabled }"
                class="season-board__timeline-stage"
              >
                {{ stageName(stage.key) }}
              </span>
              <span :class="{ 'season-board__timeline-stage--active': season.currentStage === 'completed' }" class="season-board__timeline-stage">
                Complete
              </span>
            </section>

            <div class="season-board__content">
              <section class="season-board__leaderboard" aria-label="Season leaderboard">
                <header class="season-board__section-header">
                  <span>Leaderboard</span>
                  <strong>Top Settlements</strong>
                </header>
                <article
                  v-for="entry in topEntries"
                  :key="entry.playerId"
                  class="season-board__row"
                  :class="{
                    'season-board__row--self': entry.playerId === currentPlayerId,
                    'season-board__row--selected': entry.playerId === selectedEntry?.playerId,
                  }"
                  role="button"
                  tabindex="0"
                  :aria-pressed="entry.playerId === selectedEntry?.playerId"
                  :title="`Show ${entry.playerName} score breakdown`"
                  @click="selectEntry(entry.playerId)"
                  @keydown.enter.prevent="selectEntry(entry.playerId)"
                  @keydown.space.prevent="selectEntry(entry.playerId)"
                >
                  <span class="season-board__rank">#{{ entry.rank }}</span>
                  <span class="season-board__color" :style="{ background: entry.playerColor ?? '#f8fafc' }" />
                  <span class="season-board__name">{{ entry.playerName }}</span>
                  <strong>{{ formatNumber(entry.score) }}</strong>
                </article>
              </section>

              <aside class="season-board__side">
                <section v-if="selectedEntry" class="season-board__breakdown" :aria-label="`${selectedEntry.playerName} score breakdown`">
                  <header class="season-board__section-header">
                    <span>{{ selectedEntry.playerId === currentPlayerId ? 'Your Score' : `#${selectedEntry.rank} Score` }}</span>
                    <strong>{{ selectedEntry.playerName }}</strong>
                  </header>
                  <div class="season-board__breakdown-total">
                    <span>Total</span>
                    <strong>{{ formatNumber(selectedEntry.score) }}</strong>
                  </div>
                  <div v-for="item in breakdownItems" :key="item.label">
                    <span>{{ item.label }}</span>
                    <strong>{{ formatNumber(item.value) }}</strong>
                  </div>
                </section>

                <section v-if="visibleEndGoals.length" class="season-board__goals" aria-label="Final goals">
                  <header class="season-board__section-header">
                    <span>Final Goals</span>
                    <strong>Objectives</strong>
                  </header>
                  <article v-for="goal in visibleEndGoals" :key="goal.id" class="season-board__goal" :class="{ 'season-board__goal--active': goal.active }">
                    <div>
                      <span>{{ goal.active ? 'Active' : 'Queued' }}</span>
                      <strong>{{ goal.label }}</strong>
                    </div>
                    <p>{{ formatNumber(goal.progress) }}/{{ formatNumber(goal.target) }}<template v-if="goal.percent != null"> · {{ goal.percent }}%</template></p>
                  </article>
                </section>

                <section v-if="season.status === 'completed'" class="season-board__completed">
                  <span>Completed</span>
                  <strong>{{ season.completedReason?.message ?? 'Season complete.' }}</strong>
                </section>
              </aside>
            </div>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { currentPlayerId } from '../core/socket.ts';
import PanelModalShell from './ui/PanelModalShell.vue';

const expanded = ref(false);
const now = ref(Date.now());
let timer: number | null = null;

const season = computed(() => seasonSnapshot.value);
const ownEntry = computed(() => season.value?.leaderboard.find((entry) => entry.playerId === currentPlayerId.value) ?? null);
const selectedPlayerId = ref<string | null>(null);
const selectedEntry = computed(() => {
  const entries = season.value?.leaderboard ?? [];
  const selected = selectedPlayerId.value
    ? entries.find((entry) => entry.playerId === selectedPlayerId.value) ?? null
    : null;
  return selected ?? ownEntry.value ?? entries[0] ?? null;
});
const visibleEndGoals = computed(() => season.value?.endGoals.filter((goal) => goal.enabled) ?? []);
const topEntries = computed(() => {
  const entries = season.value?.leaderboard.slice(0, 10) ?? [];
  const own = ownEntry.value;
  if (own && !entries.some((entry) => entry.playerId === own.playerId)) {
    return [...entries, own];
  }
  return entries;
});

const stageLabel = computed(() => season.value ? stageName(season.value.currentStage) : '');
const panelTitle = computed(() => `${stageLabel.value} Board`);
const countdown = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return '--';
  }
  if (snapshot.status === 'completed') {
    return snapshot.nextSeasonStartsAt
      ? formatDuration(Math.max(0, snapshot.nextSeasonStartsAt - now.value))
      : 'Done';
  }
  if (!snapshot.stageEndsAt) {
    return '--';
  }
  return formatDuration(Math.max(0, snapshot.stageEndsAt - now.value));
});
const nextStageLabel = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return 'Time';
  }
  if (snapshot.status === 'completed') {
    return snapshot.nextSeasonStartsAt ? 'Next Season In' : 'Time';
  }
  const enabled = snapshot.config.stages.filter((stage) => stage.enabled && stage.durationMs > 0);
  const index = enabled.findIndex((stage) => stage.key === snapshot.currentStage);
  const next = enabled[index + 1]?.key ?? 'completed';
  return next === 'completed' ? 'Complete In' : `${stageName(next)} In`;
});

const breakdownItems = computed(() => {
  const breakdown = selectedEntry.value?.breakdown;
  if (!breakdown) {
    return [];
  }
  return [
    { label: 'Charter', value: breakdown.charter },
    { label: 'Frontier', value: breakdown.frontier },
    { label: 'Logistics', value: breakdown.logistics },
    { label: 'Military', value: breakdown.military },
    { label: 'Resilience', value: breakdown.resilience },
  ];
});

function selectEntry(playerId: string) {
  selectedPlayerId.value = playerId;
}

function stageName(stage: string) {
  switch (stage) {
    case 'preparation':
      return 'Preparation';
    case 'midgame':
      return 'Midgame';
    case 'endgame':
      return 'Endgame';
    case 'completed':
      return 'Completed';
    default:
      return stage;
  }
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatDuration(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function handleOpenScoreboard() {
  expanded.value = true;
}

function closeScoreboard() {
  expanded.value = false;
}

function handleKeyDown(event: KeyboardEvent) {
  if (!expanded.value) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeScoreboard();
  }
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('driftlands:open-season-scoreboard', handleOpenScoreboard);
});

onBeforeUnmount(() => {
  if (timer != null) {
    window.clearInterval(timer);
  }
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  window.removeEventListener('driftlands:open-season-scoreboard', handleOpenScoreboard);
});
</script>

<style scoped>
.season-board-backdrop {
  position: fixed;
  inset: 0;
  z-index: 74;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 28% 12%, rgba(45, 148, 123, 0.16), transparent 22rem),
    linear-gradient(180deg, rgba(8, 10, 13, 0.42), rgba(8, 10, 13, 0.76)),
    rgba(0, 0, 0, 0.46);
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.season-board-modal {
  display: flex;
  flex-direction: column;
  width: min(62rem, calc(100vw - 1.25rem));
  max-height: min(48rem, calc(100dvh - 1.25rem));
  --panel-modal-border-width: 18px;
  --panel-modal-border-image-width: 32px;
  --panel-header-height: 5.15rem;
}

.season-board__row,
.season-board__breakdown div,
.season-board__goal {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.season-board__summary span,
.season-board__goal span,
.season-board__completed span,
.season-board__section-header span {
  display: block;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgba(255, 244, 207, 0.62);
}

.season-board__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.1rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
}

.season-board__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.season-board__summary article,
.season-board__leaderboard,
.season-board__breakdown,
.season-board__goals,
.season-board__completed {
  border: 1px solid rgba(190, 136, 65, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(35, 42, 43, 0.78), rgba(15, 18, 18, 0.86)),
    rgba(15, 18, 18, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 239, 196, 0.08);
}

.season-board__summary article {
  min-width: 0;
  padding: 0.75rem 0.8rem;
}

.season-board__summary strong {
  display: block;
  min-width: 0;
  margin-top: 0.24rem;
  color: #fff3d2;
  font-size: 1.05rem;
  overflow-wrap: anywhere;
}

.season-board__timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  border: 1px solid rgba(157, 216, 198, 0.18);
  border-radius: 8px;
  background: rgba(5, 14, 18, 0.28);
  padding: 0.7rem;
}

.season-board__timeline-stage {
  min-width: 6.8rem;
  border-radius: 4px;
  border: 1px solid rgba(250, 230, 170, 0.14);
  background: rgba(5, 14, 18, 0.35);
  padding: 0.42rem 0.58rem;
  font-size: 0.7rem;
  font-weight: 800;
  text-align: center;
}

.season-board__timeline-stage--active {
  border-color: rgba(52, 211, 153, 0.55);
  color: rgb(187, 247, 208);
}

.season-board__timeline-stage--disabled {
  opacity: 0.42;
}

.season-board__content {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
  gap: 0.85rem;
  align-items: start;
}

.season-board__leaderboard,
.season-board__breakdown,
.season-board__goals,
.season-board__completed {
  display: grid;
  gap: 0.42rem;
  padding: 0.8rem;
}

.season-board__side {
  display: grid;
  gap: 0.85rem;
}

.season-board__section-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.35rem;
}

.season-board__section-header strong {
  color: #fff3d2;
  font-size: 0.95rem;
}

.season-board__row,
.season-board__goal,
.season-board__completed {
  border-radius: 6px;
  border: 1px solid rgba(250, 230, 170, 0.12);
  background: rgba(5, 14, 18, 0.28);
  padding: 0.58rem 0.65rem;
}

.season-board__row {
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}

.season-board__row:hover,
.season-board__row:focus-visible {
  border-color: rgba(250, 230, 170, 0.32);
  background: rgba(250, 230, 170, 0.08);
  outline: none;
}

.season-board__row--self {
  border-color: rgba(52, 211, 153, 0.36);
  background: rgba(16, 185, 129, 0.12);
}

.season-board__row--selected {
  border-color: rgba(251, 191, 36, 0.56);
  background:
    linear-gradient(90deg, rgba(251, 191, 36, 0.16), rgba(16, 185, 129, 0.07)),
    rgba(5, 14, 18, 0.34);
  box-shadow: inset 0 0 0 1px rgba(255, 244, 207, 0.08);
}

.season-board__rank {
  width: 2.4rem;
  font-weight: 800;
  color: rgba(255, 244, 207, 0.66);
}

.season-board__color {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
}

.season-board__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.season-board__row > strong {
  color: #fff3d2;
}

.season-board__breakdown div {
  justify-content: space-between;
  border-bottom: 1px solid rgba(250, 230, 170, 0.08);
  padding: 0.25rem 0.1rem;
  font-size: 0.72rem;
}

.season-board__breakdown .season-board__breakdown-total {
  color: #fff3d2;
  font-size: 0.78rem;
}

.season-board__goal {
  justify-content: space-between;
  align-items: flex-start;
}

.season-board__goal--active {
  border-color: rgba(251, 191, 36, 0.34);
}

.season-board__goal strong {
  display: block;
  max-width: 18rem;
  color: #fff3d2;
  font-size: 0.78rem;
}

.season-board__goal p {
  font-size: 0.68rem;
  color: rgba(255, 244, 207, 0.72);
}

.season-board__completed strong {
  font-size: 0.75rem;
}

.season-board-modal-enter-active,
.season-board-modal-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.season-board-modal-enter-from,
.season-board-modal-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}

@media (max-width: 820px) {
  .season-board-backdrop {
    align-items: flex-end;
    padding: 0.5rem;
  }

  .season-board-modal {
    width: 100%;
    max-height: calc(100dvh - 1rem);
    --panel-modal-border-width: 14px;
    --panel-modal-border-image-width: 26px;
  }

  .season-board__body {
    padding: 0.78rem 0.78rem calc(1.1rem + env(safe-area-inset-bottom, 0px));
  }

  .season-board__summary,
  .season-board__content {
    grid-template-columns: 1fr;
  }

  .season-board__timeline-stage {
    flex: 1 1 8rem;
  }
}
</style>
