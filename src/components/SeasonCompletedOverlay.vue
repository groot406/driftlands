<template>
  <Transition name="season-complete">
    <div v-if="visible && season" class="season-complete">
      <div class="season-complete__backdrop" />
      <section class="season-complete__panel">
        <header class="season-complete__header">
          <span>Season Complete</span>
          <button type="button" @click="dismiss">Close</button>
        </header>

        <div class="season-complete__body">
          <div>
            <p class="season-complete__kicker">{{ season.completedReason?.message ?? 'Final score locked.' }}</p>
            <h2>{{ winner ? `${winner.playerName} wins the charter` : 'The charter is complete' }}</h2>
            <p class="season-complete__copy">
              The world is now read-only. Heroes can no longer start new work, raids, or cargo orders, but the map and archive remain open.
              <span v-if="nextSeasonText"> {{ nextSeasonText }}</span>
            </p>
          </div>

          <div class="season-complete__stats">
            <article>
              <span>Your Rank</span>
              <strong>{{ ownEntry ? `#${ownEntry.rank}` : '--' }}</strong>
            </article>
            <article>
              <span>Your Score</span>
              <strong>{{ ownEntry ? formatNumber(ownEntry.score) : '0' }}</strong>
            </article>
            <article>
              <span>Winner</span>
              <strong>{{ winner ? formatNumber(winner.score) : '0' }}</strong>
            </article>
          </div>

          <div class="season-complete__leaderboard">
            <article v-for="entry in season.leaderboard.slice(0, 5)" :key="entry.playerId" :class="{ 'season-complete__row--self': entry.playerId === currentPlayerId }">
              <span>#{{ entry.rank }}</span>
              <strong>{{ entry.playerName }}</strong>
              <em>{{ formatNumber(entry.score) }}</em>
            </article>
          </div>

          <div v-if="ownRewards.length" class="season-complete__rewards">
            <p class="season-complete__kicker">Rewards</p>
            <span v-for="reward in ownRewards" :key="reward.id">
              <small>{{ rewardKindLabel(reward.kind) }}</small>
              {{ reward.label }}
            </span>
          </div>

          <div v-else-if="season.rewards.length" class="season-complete__rewards">
            <p class="season-complete__kicker">Season Awards</p>
            <span v-for="reward in season.rewards.slice(0, 6)" :key="reward.id">
              <small>{{ rewardKindLabel(reward.kind) }}</small>
              {{ reward.label }}
            </span>
          </div>

          <div v-if="ownBreakdownItems.length" class="season-complete__breakdown">
            <p class="season-complete__kicker">Your Score Breakdown</p>
            <article v-for="item in ownBreakdownItems" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ formatNumber(item.value) }}</strong>
            </article>
          </div>

          <div v-if="archiveEntries.length" class="season-complete__archive">
            <p class="season-complete__kicker">Season Archive</p>
            <article v-for="entry in archiveEntries" :key="entry.seasonId">
              <span>{{ formatDate(entry.completedAt) }}</span>
              <strong>{{ entry.winner ? `${entry.winner.playerName} · ${formatNumber(entry.winner.score)}` : 'No winner recorded' }}</strong>
            </article>
          </div>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { currentPlayerId } from '../core/socket.ts';
import { seasonSnapshot } from '../store/seasonStore.ts';
import type { SeasonRewardKind } from '../shared/seasons/types.ts';

const dismissedSeasonIds = ref(new Set<string>());
const now = ref(Date.now());
let timer: number | null = null;
const season = computed(() => seasonSnapshot.value);
const winner = computed(() => season.value?.leaderboard[0] ?? null);
const ownEntry = computed(() => season.value?.leaderboard.find((entry) => entry.playerId === currentPlayerId.value) ?? null);
const ownRewards = computed(() => season.value?.rewards.filter((reward) => reward.playerId === currentPlayerId.value) ?? []);
const archiveEntries = computed(() => season.value?.archive.slice(0, 4) ?? []);
const ownBreakdownItems = computed(() => {
  const breakdown = ownEntry.value?.breakdown;
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
const visible = computed(() => {
  const snapshot = season.value;
  return !!snapshot && snapshot.status === 'completed' && !dismissedSeasonIds.value.has(snapshot.seasonId);
});
const nextSeasonText = computed(() => {
  const startsAt = season.value?.nextSeasonStartsAt;
  return startsAt ? `A new season starts in ${formatDuration(Math.max(0, startsAt - now.value))}.` : '';
});

function dismiss() {
  const snapshot = season.value;
  if (!snapshot) {
    return;
  }
  dismissedSeasonIds.value = new Set([...dismissedSeasonIds.value, snapshot.seasonId]);
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rewardKindLabel(kind: SeasonRewardKind) {
  switch (kind) {
    case 'title':
      return 'Title';
    case 'badge':
      return 'Badge';
    case 'banner':
      return 'Banner';
    case 'hall_of_fame':
      return 'Hall';
    case 'statue':
      return 'Statue';
    default:
      return 'Reward';
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

watch(() => season.value?.seasonId, () => {
  dismissedSeasonIds.value = new Set(dismissedSeasonIds.value);
});

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
.season-complete {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: grid;
  place-items: center;
  padding: 1rem;
  pointer-events: auto;
}

.season-complete__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 10, 14, 0.74);
  backdrop-filter: blur(8px);
}

.season-complete__panel {
  position: relative;
  width: min(38rem, 94vw);
  max-height: min(42rem, calc(100vh - 2rem));
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(245, 222, 168, 0.24);
  background: linear-gradient(180deg, rgba(33, 47, 51, 0.98), rgba(10, 20, 24, 0.98));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
  color: rgba(255, 244, 207, 0.94);
}

.season-complete__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(245, 222, 168, 0.12);
  padding: 0.85rem 1rem;
}

.season-complete__header span,
.season-complete__kicker,
.season-complete__stats span {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgba(255, 244, 207, 0.62);
}

.season-complete__header button {
  border: 1px solid rgba(245, 222, 168, 0.18);
  border-radius: 999px;
  background: rgba(245, 222, 168, 0.1);
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  color: rgba(255, 244, 207, 0.9);
}

.season-complete__body {
  display: grid;
  gap: 1rem;
  max-height: calc(100vh - 7rem);
  overflow-y: auto;
  padding: 1rem;
}

.season-complete h2 {
  margin-top: 0.35rem;
  font-size: 1.7rem;
  line-height: 1.15;
}

.season-complete__copy {
  margin-top: 0.5rem;
  color: rgba(255, 244, 207, 0.72);
}

.season-complete__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.season-complete__stats article,
.season-complete__leaderboard article,
.season-complete__rewards span,
.season-complete__breakdown article,
.season-complete__archive article {
  border-radius: 10px;
  border: 1px solid rgba(245, 222, 168, 0.12);
  background: rgba(5, 14, 18, 0.3);
  padding: 0.7rem;
}

.season-complete__stats strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 1.1rem;
}

.season-complete__leaderboard {
  display: grid;
  gap: 0.4rem;
}

.season-complete__leaderboard article {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
}

.season-complete__row--self {
  border-color: rgba(52, 211, 153, 0.36) !important;
  background: rgba(16, 185, 129, 0.12) !important;
}

.season-complete__leaderboard em {
  font-style: normal;
  color: rgba(255, 244, 207, 0.74);
}

.season-complete__rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.season-complete__rewards .season-complete__kicker,
.season-complete__breakdown .season-complete__kicker,
.season-complete__archive .season-complete__kicker {
  flex-basis: 100%;
}

.season-complete__rewards span {
  padding: 0.45rem 0.65rem;
  font-size: 0.78rem;
}

.season-complete__rewards small {
  display: block;
  margin-bottom: 0.15rem;
  color: rgba(255, 244, 207, 0.52);
  font-size: 0.56rem;
  font-weight: 800;
  text-transform: uppercase;
}

.season-complete__breakdown,
.season-complete__archive {
  display: grid;
  gap: 0.45rem;
}

.season-complete__breakdown {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.season-complete__archive article {
  display: grid;
  grid-template-columns: minmax(7rem, auto) minmax(0, 1fr);
  gap: 0.6rem;
}

.season-complete__archive strong {
  overflow-wrap: anywhere;
}

.season-complete-enter-active,
.season-complete-leave-active {
  transition: opacity 0.2s ease;
}

.season-complete-enter-from,
.season-complete-leave-to {
  opacity: 0;
}
</style>
