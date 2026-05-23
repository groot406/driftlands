<template>
  <Teleport to="body">
    <Transition name="season-stage-announcement">
      <div
        v-if="announcement"
        class="season-stage-announcement-backdrop"
        @click.self="close"
      >
        <PanelModalShell
          class="season-stage-announcement"
          role="dialog"
          aria-modal="true"
          header-label="Season Stage"
          :header-title="stageTitle"
          header-icon="*"
          header-icon-color="amber"
          header-icon-variant="star"
          close-title="Close stage briefing"
          close-aria-label="Close stage briefing"
          @close="close"
        >
          <div class="season-stage-announcement__body">
            <section class="season-stage-announcement__lead">
              <p class="season-stage-announcement__kicker">{{ previousStageLabel }} ended</p>
              <h3>{{ headline }}</h3>
              <p>{{ summary }}</p>
            </section>

            <section class="season-stage-announcement__stats" aria-label="Stage properties">
              <article>
                <span>Duration</span>
                <strong>{{ durationLabel }}</strong>
              </article>
              <article>
                <span>Borders</span>
                <strong>{{ borderPolicyLabel }}</strong>
              </article>
              <article>
                <span>New Settlements</span>
                <strong>{{ settlementStartsLabel }}</strong>
              </article>
              <article>
                <span>Hero Orders</span>
                <strong>{{ heroOrdersLabel }}</strong>
              </article>
            </section>

            <section class="season-stage-announcement__rules">
              <div>
                <p class="season-stage-announcement__kicker">What changed</p>
                <ul>
                  <li v-for="rule in rules" :key="rule">{{ rule }}</li>
                </ul>
              </div>
              <div v-if="scoreRules.length">
                <p class="season-stage-announcement__kicker">Scoring Pressure</p>
                <ul>
                  <li v-for="rule in scoreRules" :key="rule">{{ rule }}</li>
                </ul>
              </div>
            </section>

            <footer class="season-stage-announcement__footer">
              <span>{{ footerHint }}</span>
              <div>
                <PanelActionButton type="button" size="medium" variant="secondary" @click="openScoreboard">
                  Scoreboard
                </PanelActionButton>
                <PanelActionButton type="button" size="medium" @click="close">
                  Continue
                </PanelActionButton>
              </div>
            </footer>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelModalShell from './ui/PanelModalShell.vue';
import {
  activeSeasonStageAnnouncement,
  dismissSeasonStageAnnouncement,
} from '../store/seasonStageAnnouncementStore.ts';
import type { ActiveSeasonStageKey, SeasonBorderPolicy } from '../shared/seasons/types.ts';

const announcement = activeSeasonStageAnnouncement;

const stageTitle = computed(() => `${stageName(announcement.value?.stage ?? 'midgame')} Started`);
const previousStageLabel = computed(() => stageName(announcement.value?.previousStage ?? 'preparation'));
const headline = computed(() => {
  switch (announcement.value?.stage) {
    case 'preparation':
      return 'The preparation window is open.';
    case 'midgame':
      return 'The borders are open.';
    case 'endgame':
      return 'The finale has begun.';
    default:
      return 'The season stage changed.';
  }
});
const summary = computed(() => {
  switch (announcement.value?.stage) {
    case 'preparation':
      return 'Build your economy, scout nearby land and prepare defenses before direct border pressure begins.';
    case 'midgame':
      return 'Raids, watchtower captures and live ranking pressure are now part of the world state.';
    case 'endgame':
      return 'Final goals are active. Strong finishes, territory holds and score milestones can decide the season.';
    default:
      return 'Review the new stage rules before issuing your next orders.';
  }
});
const durationLabel = computed(() => announcement.value?.config ? formatDuration(announcement.value.config.durationMs) : '--');
const borderPolicyLabel = computed(() => formatBorderPolicy(announcement.value?.config?.borderPolicy ?? 'player_choice'));
const settlementStartsLabel = computed(() => announcement.value?.config?.allowSettlementStarts === false ? 'Blocked' : 'Allowed');
const heroOrdersLabel = computed(() => announcement.value?.config?.allowNewHeroTasks === false ? 'Paused' : 'Allowed');

const rules = computed(() => {
  const config = announcement.value?.config;
  if (!announcement.value || !config) {
    return [];
  }

  const items: string[] = [];
  if (config.borderPolicy === 'locked_open') {
    items.push('All settlement borders are effectively open while this stage is active.');
    items.push('Border raids and watchtower captures can be started when the military requirements are met.');
  } else if (config.borderPolicy === 'locked_closed') {
    items.push('All settlement borders are effectively closed while this stage is active.');
    items.push('Raids and watchtower captures are disabled for now.');
  } else {
    items.push('Settlements can manage their own border policy if they have unlocked border controls.');
  }

  if (!config.allowSettlementStarts) {
    items.push('New settlement starts are disabled in this stage.');
  }
  if (!config.allowNewHeroTasks) {
    items.push('New hero orders are paused in this stage.');
  }
  if (announcement.value.stage === 'endgame' && announcement.value.endGoalCount > 0) {
    items.push(`${announcement.value.endGoalCount} final goal${announcement.value.endGoalCount === 1 ? ' is' : 's are'} now active.`);
  }

  return items;
});

const scoreRules = computed(() => {
  const multipliers = announcement.value?.config?.scoreMultiplier ?? {};
  return Object.entries(multipliers)
    .filter(([, value]) => typeof value === 'number' && value !== 1)
    .map(([category, value]) => `${formatCategory(category)} score ${value > 1 ? 'increases' : 'decreases'} to ${Math.round(value * 100)}%.`);
});

const footerHint = computed(() => {
  if (announcement.value?.stage === 'midgame') {
    return 'Open the season board to check ranking movement and active military pressure.';
  }
  if (announcement.value?.stage === 'endgame') {
    return 'Open the season board to track final goals and category leads.';
  }
  return 'Open the season board to check the current timer and leaderboard.';
});

function stageName(stage: string) {
  switch (stage) {
    case 'preparation':
      return 'Preparation';
    case 'midgame':
      return 'Midgame';
    case 'endgame':
      return 'Finale';
    case 'completed':
      return 'Completed';
    default:
      return stage;
  }
}

function formatBorderPolicy(policy: SeasonBorderPolicy) {
  switch (policy) {
    case 'locked_closed':
      return 'Locked Closed';
    case 'locked_open':
      return 'Locked Open';
    case 'player_choice':
      return 'Player Choice';
    default:
      return policy;
  }
}

function formatCategory(category: string) {
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours >= 48 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days}d`;
  }
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function close() {
  dismissSeasonStageAnnouncement();
}

function openScoreboard() {
  close();
  window.dispatchEvent(new CustomEvent('driftlands:open-season-scoreboard'));
}

function handleKeyDown(event: KeyboardEvent) {
  if (!announcement.value || event.key !== 'Escape') {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  close();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, { capture: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
});
</script>

<style scoped>
.season-stage-announcement-backdrop {
  position: fixed;
  inset: 0;
  z-index: 75;
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

.season-stage-announcement {
  display: flex;
  flex-direction: column;
  width: min(48rem, calc(100vw - 1.25rem));
  max-height: min(42rem, calc(100dvh - 1.25rem));
  --panel-modal-border-width: 18px;
  --panel-modal-border-image-width: 32px;
  --panel-header-height: 5.15rem;
}

.season-stage-announcement__body {
  display: grid;
  gap: 0.9rem;
  padding: 1rem 1.1rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
}

.season-stage-announcement__lead,
.season-stage-announcement__rules,
.season-stage-announcement__stats article {
  border: 1px solid rgba(190, 136, 65, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(35, 42, 43, 0.78), rgba(15, 18, 18, 0.86)),
    rgba(15, 18, 18, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 239, 196, 0.08);
}

.season-stage-announcement__lead {
  padding: 1rem;
}

.season-stage-announcement__kicker,
.season-stage-announcement__stats span {
  margin: 0;
  color: rgba(245, 222, 168, 0.66);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.season-stage-announcement__lead h3 {
  margin: 0.32rem 0 0;
  color: #fff4cf;
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 3.2vw, 2.2rem);
}

.season-stage-announcement__lead p:not(.season-stage-announcement__kicker) {
  margin: 0.55rem 0 0;
  color: rgba(255, 244, 207, 0.86);
  line-height: 1.5;
}

.season-stage-announcement__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.season-stage-announcement__stats article {
  min-width: 0;
  padding: 0.75rem 0.8rem;
}

.season-stage-announcement__stats strong {
  display: block;
  margin-top: 0.2rem;
  color: #fff4cf;
  font-size: 0.98rem;
}

.season-stage-announcement__rules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 0.9rem 1rem;
}

.season-stage-announcement__rules ul {
  display: grid;
  gap: 0.48rem;
  margin: 0.55rem 0 0;
  padding: 0;
  list-style: none;
  color: rgba(255, 244, 207, 0.82);
  line-height: 1.38;
}

.season-stage-announcement__rules li {
  position: relative;
  padding-left: 1rem;
}

.season-stage-announcement__rules li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.48rem;
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 999px;
  background: #ffcf3f;
}

.season-stage-announcement__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(190, 136, 65, 0.24);
  padding-top: 0.85rem;
  color: rgba(255, 244, 207, 0.72);
  font-size: 0.82rem;
}

.season-stage-announcement__footer > div {
  display: flex;
  gap: 0.55rem;
}

.season-stage-announcement-enter-active,
.season-stage-announcement-leave-active {
  transition: opacity 160ms ease;
}

.season-stage-announcement-enter-from,
.season-stage-announcement-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .season-stage-announcement__stats,
  .season-stage-announcement__rules {
    grid-template-columns: 1fr;
  }

  .season-stage-announcement__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .season-stage-announcement__footer > div {
    justify-content: flex-end;
  }
}
</style>
