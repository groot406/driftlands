<template>
  <button
    v-if="props.showTrigger && competition"
    class="global-competition-button"
    type="button"
    title="Open global leaderboard"
    aria-label="Open global leaderboard"
    @click="openHall"
  >
    <span class="global-competition-button__mark" aria-hidden="true">#</span>
    <span>
      <span>Global</span>
      <strong>{{ ownOverallRank }}</strong>
    </span>
  </button>

  <Teleport to="body">
    <Transition name="global-competition-modal">
      <div
        v-if="competition && expanded"
        class="global-competition-backdrop"
        @click.self="closeHall"
      >
        <PanelModalShell
          class="global-competition-modal"
          role="dialog"
          aria-modal="true"
          header-label="Competition"
          header-title="Global Hall"
          header-icon="#"
          header-icon-color="amber"
          header-icon-variant="star"
          close-title="Close global leaderboard"
          close-aria-label="Close global leaderboard"
          @close="closeHall"
        >
          <div class="global-competition__body">
            <section class="global-competition__summary" aria-label="Global competition summary">
              <article>
                <span>{{ rankSummaryLabel }}</span>
                <strong>{{ rankSummaryValue }}</strong>
              </article>
              <article>
                <span>{{ pointsSummaryLabel }}</span>
                <strong>{{ summaryProfile ? formatNumber(summaryProfile.liveOverallScore) : '0' }}</strong>
              </article>
              <article>
                <span>{{ hoursSummaryLabel }}</span>
                <strong>{{ summaryProfile ? formatDuration(summaryProfile.totalPlayMs) : '0m' }}</strong>
              </article>
              <article>
                <span>Badges</span>
                <strong>{{ summaryProfile?.badges.length ?? 0 }}</strong>
              </article>
            </section>

            <nav class="global-competition__tabs" aria-label="Global leaderboard tabs">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                :class="{ 'global-competition__tab--active': activeTab === tab.id }"
                @click="activeTab = tab.id"
              >
                {{ tab.label }}
              </button>
            </nav>

            <div class="global-competition__content">
              <section class="global-competition__list" :aria-label="activeTabLabel">
                <template v-if="activeTab !== 'settlements' && activeTab !== 'badges'">
                  <article
                    v-for="entry in activeLeaderboard"
                    :key="entry.playerId"
                    class="global-competition__row"
                    :class="{
                      'global-competition__row--self': !!currentPlayerId && entry.playerId === currentPlayerId,
                      'global-competition__row--selected': entry.playerId === selectedProfile?.playerId,
                    }"
                    role="button"
                    tabindex="0"
                    :aria-pressed="entry.playerId === selectedProfile?.playerId"
                    @click="selectPlayer(entry.playerId)"
                    @keydown.enter.prevent="selectPlayer(entry.playerId)"
                    @keydown.space.prevent="selectPlayer(entry.playerId)"
                  >
                    <span class="global-competition__rank">#{{ entry.rank }}</span>
                    <span class="global-competition__color" :style="{ background: entry.playerColor ?? '#f8fafc' }" />
                    <span class="global-competition__name">{{ entry.playerName }}</span>
                    <strong>{{ formatEntryValue(entry.value) }}</strong>
                  </article>
                </template>

                <template v-else-if="activeTab === 'settlements'">
                  <article
                    v-for="record in topSettlements"
                    :key="record.id"
                    class="global-competition__settlement"
                    :class="{ 'global-competition__row--self': !!currentPlayerId && record.playerId === currentPlayerId }"
                    role="button"
                    tabindex="0"
                    @click="selectPlayer(record.playerId)"
                    @keydown.enter.prevent="selectPlayer(record.playerId)"
                    @keydown.space.prevent="selectPlayer(record.playerId)"
                  >
                    <div>
                      <span>{{ record.settlementId }} · Season {{ record.seed }}</span>
                      <strong>{{ record.playerName }}</strong>
                    </div>
                    <em>#{{ record.rank }}</em>
                    <strong>{{ formatNumber(record.score) }}</strong>
                  </article>
                </template>

                <template v-else>
                  <article
                    v-for="badge in visibleBadges"
                    :key="badge.id"
                    class="global-competition__badge"
                    :class="{ 'global-competition__row--self': !!currentPlayerId && badge.playerId === currentPlayerId }"
                    role="button"
                    tabindex="0"
                    @click="selectPlayer(badge.playerId)"
                    @keydown.enter.prevent="selectPlayer(badge.playerId)"
                    @keydown.space.prevent="selectPlayer(badge.playerId)"
                  >
                    <span>{{ badge.kind }}</span>
                    <strong>{{ badge.label }}</strong>
                    <em>{{ playerName(badge.playerId) }}</em>
                  </article>
                </template>
              </section>

              <aside class="global-competition__profile">
                <template v-if="selectedProfile">
                  <header class="global-competition__section-header">
                    <span>{{ selectedProfile.playerId === currentPlayerId ? 'Your Profile' : 'Player Profile' }}</span>
                    <strong>{{ selectedProfile.playerName }}</strong>
                  </header>
                  <div class="global-competition__profile-grid">
                    <article>
                      <span>Lifetime</span>
                      <strong>{{ formatNumber(selectedProfile.lifetimePoints) }}</strong>
                    </article>
                    <article>
                      <span>Live</span>
                      <strong>{{ formatNumber(selectedProfile.currentSeasonScore) }}</strong>
                    </article>
                    <article>
                      <span>Wins</span>
                      <strong>{{ selectedProfile.seasonWins }}</strong>
                    </article>
                    <article>
                      <span>Podiums</span>
                      <strong>{{ selectedProfile.podiums }}</strong>
                    </article>
                  </div>

                  <section v-if="selectedProfile.bestSettlement" class="global-competition__detail">
                    <span>Best Settlement</span>
                    <strong>{{ selectedProfile.bestSettlement.settlementId }} · {{ formatNumber(selectedProfile.bestSettlement.score) }}</strong>
                  </section>

                  <section class="global-competition__badge-strip" aria-label="Player badges">
                    <span v-for="badge in selectedProfile.badges.slice(0, 8)" :key="badge.id">{{ badge.label }}</span>
                    <em v-if="!selectedProfile.badges.length">No badges yet</em>
                  </section>

                  <section v-if="selectedProfile.recentResults.length" class="global-competition__results" aria-label="Recent season results">
                    <article v-for="result in selectedProfile.recentResults.slice(0, 4)" :key="result.seasonId">
                      <span>#{{ result.rank }} · {{ result.settlementId }}</span>
                      <strong>{{ formatNumber(result.score) }}</strong>
                    </article>
                  </section>
                </template>
                <p v-else class="global-competition__empty">No competition profile yet.</p>
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
import type { CompetitionLeaderboardKind } from '../shared/competition/types.ts';
import { competitionSnapshot, getCompetitionProfileForPlayer } from '../store/competitionStore.ts';
import { currentPlayerId } from '../core/socket.ts';
import PanelModalShell from './ui/PanelModalShell.vue';

const props = withDefaults(defineProps<{
  showTrigger?: boolean;
}>(), {
  showTrigger: true,
});

const expanded = ref(false);
const activeTab = ref<CompetitionLeaderboardKind>('overall');
const selectedPlayerId = ref<string | null>(null);

const tabs: Array<{ id: CompetitionLeaderboardKind; label: string }> = [
  { id: 'overall', label: 'Overall' },
  { id: 'hours', label: 'Hours' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'badges', label: 'Badges' },
];

const competition = computed(() => competitionSnapshot.value);
const ownProfile = computed(() => getCompetitionProfileForPlayer(currentPlayerId.value));
const summaryProfile = computed(() => ownProfile.value ?? competition.value?.profiles[0] ?? null);
const selectedProfile = computed(() => {
  const profile = selectedPlayerId.value ? getCompetitionProfileForPlayer(selectedPlayerId.value) : null;
  return profile ?? ownProfile.value ?? competition.value?.profiles[0] ?? null;
});
const activeLeaderboard = computed(() => competition.value?.leaderboards[activeTab.value] ?? []);
const topSettlements = computed(() => competition.value?.settlements.slice(0, 20) ?? []);
const visibleBadges = computed(() => competition.value?.badges.slice(0, 40) ?? []);
const activeTabLabel = computed(() => tabs.find((tab) => tab.id === activeTab.value)?.label ?? 'Leaderboard');
const ownOverallRank = computed(() => {
  const entry = competition.value?.leaderboards.overall.find((candidate) => candidate.playerId === currentPlayerId.value);
  return entry ? `#${entry.rank}` : '--';
});
const rankSummaryLabel = computed(() => currentPlayerId.value ? 'Your Rank' : 'Top Rank');
const pointsSummaryLabel = computed(() => currentPlayerId.value ? 'Your Points' : 'Leader Points');
const hoursSummaryLabel = computed(() => currentPlayerId.value ? 'Your Hours' : 'Leader Hours');
const rankSummaryValue = computed(() => {
  if (currentPlayerId.value) {
    return ownOverallRank.value;
  }

  const top = competition.value?.leaderboards.overall[0];
  return top ? `#${top.rank}` : '--';
});

function playerName(playerId: string) {
  return competition.value?.profiles.find((profile) => profile.playerId === playerId)?.playerName ?? 'Pioneer';
}

function selectPlayer(playerId: string) {
  selectedPlayerId.value = playerId;
}

function formatEntryValue(value: number) {
  if (activeTab.value === 'hours') {
    return formatDuration(value);
  }
  return formatNumber(value);
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function openHall() {
  expanded.value = true;
}

function closeHall() {
  expanded.value = false;
}

function handleKeyDown(event: KeyboardEvent) {
  if (!expanded.value) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeHall();
  }
}

function handleOpenHall() {
  openHall();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('driftlands:open-global-competition', handleOpenHall);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  window.removeEventListener('driftlands:open-global-competition', handleOpenHall);
});
</script>

<style scoped>
.global-competition-button {
  pointer-events: auto;
  align-self: center;
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgba(245, 222, 168, 0.4);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(58, 49, 72, 0.94), rgba(27, 35, 41, 0.96)),
    rgba(18, 22, 26, 0.94);
  color: rgba(255, 244, 207, 0.94);
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 244, 207, 0.12);
  cursor: pointer;
  min-width: 8.6rem;
  padding: 0.45rem 0.65rem;
  text-align: left;
}

.global-competition-button:hover,
.global-competition-button:focus-visible {
  border-color: rgba(255, 213, 104, 0.72);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.36),
    0 0 0 2px rgba(255, 213, 104, 0.15);
}

.global-competition-button__mark {
  display: grid;
  place-items: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 50%;
  background: rgba(255, 213, 104, 0.16);
  color: #ffdd7a;
  font-weight: 900;
}

.global-competition-button span span,
.global-competition__summary span,
.global-competition__section-header span,
.global-competition__detail span,
.global-competition__settlement span,
.global-competition__badge span,
.global-competition__results span,
.global-competition__profile-grid span {
  display: block;
  color: rgba(245, 222, 168, 0.72);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.global-competition-button strong {
  display: block;
  color: #fff4cf;
  font-size: 0.9rem;
}

.global-competition-backdrop {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 18% 16%, rgba(255, 213, 104, 0.14), transparent 20rem),
    radial-gradient(circle at 78% 24%, rgba(45, 148, 123, 0.14), transparent 22rem),
    linear-gradient(180deg, rgba(8, 10, 13, 0.48), rgba(8, 10, 13, 0.78)),
    rgba(0, 0, 0, 0.48);
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.global-competition-modal {
  width: min(61rem, calc(100vw - 1.5rem));
  max-height: min(43rem, calc(100vh - 1.5rem));
}

.global-competition__body {
  display: grid;
  gap: 0.85rem;
  min-height: 0;
}

.global-competition__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
}

.global-competition__summary article,
.global-competition__list,
.global-competition__profile,
.global-competition__profile-grid article,
.global-competition__detail,
.global-competition__results article {
  border: 1px solid rgba(245, 222, 168, 0.18);
  border-radius: 8px;
  background: rgba(14, 20, 24, 0.68);
}

.global-competition__summary article {
  padding: 0.65rem;
}

.global-competition__summary strong {
  display: block;
  margin-top: 0.2rem;
  color: #fff4cf;
  font-size: 1rem;
}

.global-competition__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.global-competition__tabs button {
  border: 1px solid rgba(245, 222, 168, 0.18);
  border-radius: 7px;
  background: rgba(14, 20, 24, 0.72);
  color: rgba(255, 244, 207, 0.82);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.42rem 0.65rem;
}

.global-competition__tabs button:hover,
.global-competition__tabs button:focus-visible,
.global-competition__tabs .global-competition__tab--active {
  border-color: rgba(255, 213, 104, 0.58);
  background: rgba(255, 213, 104, 0.14);
  color: #ffdd7a;
}

.global-competition__content {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(18rem, 0.7fr);
  gap: 0.8rem;
  min-height: 0;
}

.global-competition__list,
.global-competition__profile {
  min-height: 20rem;
  max-height: min(29rem, 58vh);
  overflow: auto;
  padding: 0.6rem;
}

.global-competition__profile {
  display: grid;
  align-content: start;
  gap: 0.7rem;
}

.global-competition__row,
.global-competition__settlement,
.global-competition__badge {
  display: grid;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.7rem;
  border: 1px solid rgba(245, 222, 168, 0.12);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 244, 207, 0.9);
  cursor: pointer;
  margin-bottom: 0.42rem;
  padding: 0.52rem 0.62rem;
}

.global-competition__row {
  grid-template-columns: 2.8rem 0.8rem minmax(0, 1fr) auto;
}

.global-competition__settlement {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.global-competition__badge {
  grid-template-columns: 6rem minmax(0, 1fr) auto;
}

.global-competition__row:hover,
.global-competition__row:focus-visible,
.global-competition__settlement:hover,
.global-competition__settlement:focus-visible,
.global-competition__badge:hover,
.global-competition__badge:focus-visible {
  border-color: rgba(255, 213, 104, 0.42);
  background: rgba(255, 213, 104, 0.08);
}

.global-competition__row--self {
  border-color: rgba(125, 211, 252, 0.45);
  background: rgba(14, 165, 233, 0.13);
}

.global-competition__row--selected {
  border-color: rgba(255, 213, 104, 0.62);
}

.global-competition__rank {
  color: #ffdd7a;
  font-weight: 900;
}

.global-competition__color {
  width: 0.72rem;
  height: 0.72rem;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 244, 207, 0.16);
}

.global-competition__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-competition__row > strong,
.global-competition__settlement > strong,
.global-competition__profile-grid strong,
.global-competition__detail strong,
.global-competition__results strong {
  color: #fff4cf;
}

.global-competition__settlement em,
.global-competition__badge em {
  color: rgba(255, 244, 207, 0.72);
  font-size: 0.72rem;
  font-style: normal;
}

.global-competition__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.global-competition__section-header strong {
  color: #fff4cf;
}

.global-competition__profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.48rem;
}

.global-competition__profile-grid article,
.global-competition__detail {
  padding: 0.55rem;
}

.global-competition__badge-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.38rem;
}

.global-competition__badge-strip span,
.global-competition__badge-strip em {
  border: 1px solid rgba(255, 213, 104, 0.26);
  border-radius: 999px;
  background: rgba(255, 213, 104, 0.1);
  color: #ffdd7a;
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 800;
  padding: 0.24rem 0.46rem;
}

.global-competition__results {
  display: grid;
  gap: 0.4rem;
}

.global-competition__results article {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
}

.global-competition__empty {
  color: rgba(255, 244, 207, 0.72);
  font-size: 0.8rem;
}

.global-competition-modal-enter-active,
.global-competition-modal-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.global-competition-modal-enter-from,
.global-competition-modal-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 760px) {
  .global-competition-button {
    width: min(32rem, 82vw);
  }

  .global-competition__summary,
  .global-competition__content {
    grid-template-columns: 1fr;
  }

  .global-competition__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .global-competition__list,
  .global-competition__profile {
    max-height: 32vh;
    min-height: 12rem;
  }

  .global-competition__badge {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
