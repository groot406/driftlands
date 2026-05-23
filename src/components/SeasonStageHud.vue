<template>
  <button
    v-if="season"
    class="season-stage-hud"
    type="button"
    title="Open season scoreboard"
    aria-label="Open season scoreboard"
    @click="pulseScoreboard"
  >
    <span class="season-stage-hud__main">
      <span class="season-stage-hud__kicker">Season Stage</span>
      <span class="season-stage-hud__line">
        <strong>{{ stageLabel }}</strong>
        <span class="season-stage-hud__time">{{ nextStageText }}</span>
      </span>
    </span>
    <span class="season-stage-hud__rank">
      <span>Your Rank</span>
      <strong>{{ rankLabel }}</strong>
    </span>
    <span class="season-stage-hud__action" aria-hidden="true">Board</span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { currentPlayerId } from '../core/socket.ts';

const now = ref(Date.now());
let timer: number | null = null;

const season = computed(() => seasonSnapshot.value);
const ownEntry = computed(() => season.value?.leaderboard.find((entry) => entry.playerId === currentPlayerId.value) ?? null);
const rankLabel = computed(() => ownEntry.value ? `#${ownEntry.value.rank}` : '--');
const stageLabel = computed(() => {
  switch (season.value?.currentStage) {
    case 'preparation':
      return 'Preparation';
    case 'midgame':
      return 'Midgame';
    case 'endgame':
      return 'Endgame';
    case 'completed':
      return 'Completed';
    default:
      return 'Season';
  }
});

const nextStageText = computed(() => {
  const snapshot = season.value;
  if (!snapshot) {
    return '';
  }
  if (snapshot.status === 'completed') {
    if (snapshot.nextSeasonStartsAt) {
      return `Next season in ${formatDuration(Math.max(0, snapshot.nextSeasonStartsAt - now.value))}`;
    }
    return snapshot.completedReason?.message ?? 'Final score locked';
  }
  const next = getNextStageLabel();
  const remaining = snapshot.stageEndsAt ? formatDuration(Math.max(0, snapshot.stageEndsAt - now.value)) : '--';
  return next ? `${next} in ${remaining}` : `Complete in ${remaining}`;
});

function getNextStageLabel() {
  const snapshot = season.value;
  if (!snapshot || snapshot.currentStage === 'completed') {
    return null;
  }
  const enabled = snapshot.config.stages.filter((stage) => stage.enabled && stage.durationMs > 0);
  const currentIndex = enabled.findIndex((stage) => stage.key === snapshot.currentStage);
  const next = enabled[currentIndex + 1]?.key ?? 'completed';
  switch (next) {
    case 'midgame':
      return 'Midgame';
    case 'endgame':
      return 'Endgame';
    case 'completed':
      return 'Complete';
    default:
      return null;
  }
}

function formatDuration(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function pulseScoreboard() {
  window.dispatchEvent(new CustomEvent('driftlands:open-season-scoreboard'));
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer != null) {
    window.clearInterval(timer);
  }
});
</script>

<style scoped>
.season-stage-hud {
  pointer-events: auto;
  align-self: center;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.85rem;
  min-width: min(32rem, 82vw);
  border: 1px solid rgba(245, 222, 168, 0.42);
  border-radius: 9px;
  background:
    linear-gradient(180deg, rgba(50, 68, 63, 0.96), rgba(19, 34, 36, 0.96)),
    rgba(15, 28, 31, 0.96);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 244, 207, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.32);
  color: rgba(255, 244, 207, 0.95);
  cursor: pointer;
  padding: 0.56rem 0.62rem 0.56rem 0.82rem;
  text-align: left;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease,
    background 140ms ease;
}

.season-stage-hud:hover,
.season-stage-hud:focus-visible {
  border-color: rgba(255, 213, 104, 0.78);
  background:
    linear-gradient(180deg, rgba(58, 78, 70, 0.98), rgba(22, 40, 41, 0.98)),
    rgba(15, 28, 31, 0.98);
  box-shadow:
    0 16px 38px rgba(0, 0, 0, 0.36),
    0 0 0 2px rgba(255, 213, 104, 0.16),
    inset 0 1px 0 rgba(255, 244, 207, 0.18);
  transform: translateY(-1px);
}

.season-stage-hud:active {
  transform: translateY(0);
}

.season-stage-hud__main {
  min-width: 0;
}

.season-stage-hud__kicker {
  display: block;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgba(245, 222, 168, 0.78);
}

.season-stage-hud__line {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 0.55rem;
}

.season-stage-hud strong {
  font-size: 0.95rem;
}

.season-stage-hud__time {
  font-size: 0.78rem;
  color: rgba(255, 244, 207, 0.82);
  white-space: nowrap;
}

.season-stage-hud__rank {
  min-width: 4.9rem;
  border-left: 1px solid rgba(245, 222, 168, 0.24);
  padding-left: 0.85rem;
}

.season-stage-hud__rank span {
  display: block;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgba(245, 222, 168, 0.7);
}

.season-stage-hud__rank strong {
  display: block;
  margin-top: 0.1rem;
  color: #fff4cf;
}

.season-stage-hud__action {
  border: 1px solid rgba(255, 213, 104, 0.34);
  border-radius: 7px;
  background: rgba(255, 213, 104, 0.12);
  color: #ffdd7a;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  padding: 0.48rem 0.52rem;
  text-transform: uppercase;
}

@media (max-width: 580px) {
  .season-stage-hud {
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: min(25rem, 88vw);
  }

  .season-stage-hud__line {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.08rem;
  }

  .season-stage-hud__rank {
    border-left: 0;
    padding-left: 0;
  }

  .season-stage-hud__action {
    display: none;
  }
}
</style>
