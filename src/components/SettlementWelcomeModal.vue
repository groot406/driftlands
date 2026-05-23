<template>
  <Teleport to="body">
    <Transition name="settlement-welcome">
      <div
        v-if="welcome && season"
        class="settlement-welcome-backdrop"
        @click.self="close"
      >
        <PanelModalShell
          class="settlement-welcome"
          role="dialog"
          aria-modal="true"
          header-label="New Settlement"
          header-title="Welcome to the Charter"
          header-icon="!"
          header-icon-color="amber"
          header-icon-variant="home"
          close-title="Close settlement briefing"
          close-aria-label="Close settlement briefing"
          @close="close"
        >
          <div class="settlement-welcome__body">
            <section class="settlement-welcome__hero">
              <div class="settlement-welcome__art" aria-hidden="true">
                <img class="settlement-welcome__portrait" :src="welcomePortraitSrc" alt="">
              </div>
              <div class="settlement-welcome__intro">
                <p class="settlement-welcome__kicker">{{ currentStageLabel }}</p>
                <h3>Your first season has started.</h3>
                <p>
                  Driftlands seasons are timed worlds. Build your base early, use the open-border window to expand or defend,
                  then push for final goals before the world becomes a permanent archive.
                </p>
                <div class="settlement-welcome__status">
                  <article>
                    <span>Now</span>
                    <strong>{{ currentStageLabel }}</strong>
                  </article>
                  <article>
                    <span>{{ nextStageLabel }}</span>
                    <strong>{{ stageCountdown }}</strong>
                  </article>
                  <article>
                    <span>Score</span>
                    <strong>{{ ownScore }}</strong>
                  </article>
                </div>
              </div>
            </section>

            <section class="settlement-welcome__timeline" aria-label="Season stages">
              <article
                v-for="stage in stageCards"
                :key="stage.key"
                class="settlement-welcome__stage"
                :class="{
                  'settlement-welcome__stage--active': stage.active,
                  'settlement-welcome__stage--disabled': stage.disabled,
                }"
              >
                <span>{{ stage.duration }}</span>
                <h4>{{ stage.title }}</h4>
                <p>{{ stage.summary }}</p>
                <strong>{{ stage.rule }}</strong>
              </article>
            </section>

            <section class="settlement-welcome__strategy">
              <div>
                <p class="settlement-welcome__kicker">Season Strategy</p>
                <ul>
                  <li>Use preparation to secure food, roads, towers, harbors, depots and barracks while borders are closed.</li>
                  <li>In midgame, score comes from expansion, logistics, tower control, defense and smart land captures.</li>
                  <li>In the finale, new settlement starts stop and active end-goals can finish the season immediately.</li>
                </ul>
              </div>
              <div>
                <p class="settlement-welcome__kicker">Frontier Intel</p>
                <ul>
                  <li>Ship orders and calamity warnings can change which settlements are best positioned each day.</li>
                  <li>Watch the scoreboard for category leads, hold-time pressure and final-goal progress.</li>
                  <li>Season titles, badges and hall-of-fame records mark prestige after the world is complete.</li>
                </ul>
              </div>
            </section>

            <section v-if="activeGoals.length" class="settlement-welcome__goals" aria-label="Season end goals">
              <p class="settlement-welcome__kicker">Final Goals</p>
              <div>
                <span v-for="goal in activeGoals" :key="goal.id">
                  {{ goal.label }}
                </span>
              </div>
            </section>

            <footer class="settlement-welcome__footer">
              <span>Open the season board any time from the stage timer.</span>
              <div>
                <PanelActionButton type="button" size="medium" variant="secondary" @click="openScoreboard">
                  Scoreboard
                </PanelActionButton>
                <PanelActionButton type="button" size="medium" @click="close">
                  Start Settlement
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelModalShell from './ui/PanelModalShell.vue';
import { activeSettlementWelcome, dismissSettlementWelcome } from '../store/settlementWelcomeStore.ts';
import { seasonSnapshot } from '../store/seasonStore.ts';
import { currentPlayerId } from '../core/socket.ts';
import type { ActiveSeasonStageKey, SeasonStageConfig, SeasonStageKey } from '../shared/seasons/types.ts';
import welcomePortraitSrc from '../assets/ui/season/welcome-settlement-portrait.png';

const now = ref(Date.now());
let timer: number | null = null;

const welcome = activeSettlementWelcome;
const season = computed(() => seasonSnapshot.value);
const ownEntry = computed(() => season.value?.leaderboard.find((entry) => entry.playerId === currentPlayerId.value) ?? null);
const ownScore = computed(() => ownEntry.value ? formatNumber(ownEntry.value.score) : '0');
const activeGoals = computed(() => season.value?.endGoals.filter((goal) => goal.enabled).slice(0, 4) ?? []);

const currentStageLabel = computed(() => stageName(season.value?.currentStage ?? 'preparation'));
const nextStageLabel = computed(() => {
  const next = getNextStageKey();
  return next === 'completed' ? 'Completes In' : `${stageName(next)} In`;
});
const stageCountdown = computed(() => {
  const endsAt = season.value?.stageEndsAt;
  return endsAt ? formatDuration(Math.max(0, endsAt - now.value)) : '--';
});

const stageCards = computed(() => {
  const snapshot = season.value;
  const configuredStages = snapshot?.config.stages ?? [];
  const stageMap = new Map<ActiveSeasonStageKey, SeasonStageConfig>(configuredStages.map((stage) => [stage.key, stage]));
  return (['preparation', 'midgame', 'endgame'] as ActiveSeasonStageKey[]).map((key) => {
    const config = stageMap.get(key);
    return {
      key,
      title: stageName(key),
      duration: config?.enabled ? formatStageDuration(config.durationMs) : 'Off',
      summary: getStageSummary(key),
      rule: getStageRule(key, config),
      active: snapshot?.currentStage === key,
      disabled: !config?.enabled,
    };
  });
});

function getNextStageKey(): SeasonStageKey {
  const snapshot = season.value;
  if (!snapshot || snapshot.status === 'completed' || snapshot.currentStage === 'completed') {
    return 'completed';
  }

  const enabled = snapshot.config.stages.filter((stage) => stage.enabled && stage.durationMs > 0);
  const index = enabled.findIndex((stage) => stage.key === snapshot.currentStage);
  return enabled[index + 1]?.key ?? 'completed';
}

function getStageSummary(stage: ActiveSeasonStageKey) {
  switch (stage) {
    case 'preparation':
      return 'Build the economy, scout nearby tiles, prepare supply lines and raise defenses.';
    case 'midgame':
      return 'Borders open. Raids, watchtower captures, land pressure and live ranking start to matter.';
    case 'endgame':
      return 'Final goals activate. Hold territory, finish milestones and protect your strongest score categories.';
    default:
      return '';
  }
}

function getStageRule(stage: ActiveSeasonStageKey, config: SeasonStageConfig | undefined) {
  if (!config?.enabled) {
    return 'Skipped by server settings';
  }

  if (stage === 'endgame' && !config.allowSettlementStarts) {
    return 'No new settlement starts';
  }

  switch (config.borderPolicy) {
    case 'locked_closed':
      return 'Borders locked closed';
    case 'locked_open':
      return 'Borders locked open';
    case 'player_choice':
      return 'Players control borders';
    default:
      return '';
  }
}

function stageName(stage: SeasonStageKey) {
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

function formatDuration(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatStageDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (hours >= 48 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (hours > 24 && hours % 24 !== 0) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function close() {
  dismissSettlementWelcome();
}

function openScoreboard() {
  dismissSettlementWelcome();
  window.dispatchEvent(new CustomEvent('driftlands:open-season-scoreboard'));
}

function handleKeyDown(event: KeyboardEvent) {
  if (!welcome.value) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  window.addEventListener('keydown', handleKeyDown, { capture: true });
});

onBeforeUnmount(() => {
  if (timer != null) {
    window.clearInterval(timer);
  }
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
});
</script>

<style scoped>
.settlement-welcome-backdrop {
  position: fixed;
  inset: 0;
  z-index: 73;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 22% 8%, rgba(45, 148, 123, 0.18), transparent 20rem),
    linear-gradient(180deg, rgba(8, 10, 13, 0.48), rgba(8, 10, 13, 0.76)),
    rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.settlement-welcome {
  display: flex;
  flex-direction: column;
  width: min(56rem, calc(100vw - 1.25rem));
  max-height: calc(100dvh - 1rem);
  --panel-modal-border-width: 18px;
  --panel-modal-border-image-width: 32px;
  --panel-header-height: 4.45rem;
  --panel-header-padding: 0.82rem 4rem 0.58rem 5.55rem;
  --panel-header-title-size: clamp(1.75rem, 2.45vw, 2.25rem);
  --panel-header-banner-width: 3.35rem;
  --panel-header-banner-height: 5.35rem;
  --panel-header-banner-left: 1rem;
}

.settlement-welcome__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 0.62rem;
  padding: 0.72rem 0.9rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
}

.settlement-welcome__hero {
  display: grid;
  grid-template-columns: minmax(13rem, 0.82fr) minmax(0, 1.18fr);
  gap: 1rem;
  align-items: stretch;
}

.settlement-welcome__art {
  position: relative;
  min-height: 12.8rem;
  border: 1px solid rgba(190, 136, 65, 0.32);
  border-radius: 8px;
  background: rgba(10, 17, 17, 0.92);
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px rgba(255, 239, 196, 0.06),
    inset 0 -2rem 4rem rgba(0, 0, 0, 0.18);
}

.settlement-welcome__portrait {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 12.8rem;
  object-fit: cover;
  object-position: center;
}

.settlement-welcome__intro,
.settlement-welcome__strategy,
.settlement-welcome__goals {
  border: 1px solid rgba(190, 136, 65, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(35, 42, 43, 0.78), rgba(15, 18, 18, 0.86)),
    rgba(15, 18, 18, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 239, 196, 0.08);
}

.settlement-welcome__intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.82rem;
}

.settlement-welcome__kicker,
.settlement-welcome__status span,
.settlement-welcome__stage > span {
  margin: 0;
  color: rgba(245, 222, 168, 0.66);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.settlement-welcome h3 {
  margin: 0.24rem 0 0;
  color: #fff3d2;
  font-size: 1.32rem;
  line-height: 1.12;
}

.settlement-welcome__intro p:not(.settlement-welcome__kicker) {
  margin: 0.48rem 0 0;
  color: rgba(244, 231, 208, 0.82);
  font-size: 0.84rem;
  line-height: 1.36;
}

.settlement-welcome__status {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 0.62rem;
}

.settlement-welcome__status article,
.settlement-welcome__stage {
  border: 1px solid rgba(245, 222, 168, 0.12);
  border-radius: 6px;
  background: rgba(5, 14, 18, 0.34);
  padding: 0.58rem;
}

.settlement-welcome__status strong {
  display: block;
  min-width: 0;
  margin-top: 0.18rem;
  color: #fff3d2;
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}

.settlement-welcome__timeline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.settlement-welcome__stage {
  position: relative;
  min-height: 8rem;
  overflow: hidden;
}

.settlement-welcome__stage::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: rgba(125, 211, 252, 0.34);
}

.settlement-welcome__stage--active {
  border-color: rgba(52, 211, 153, 0.34);
  background:
    linear-gradient(180deg, rgba(21, 84, 72, 0.26), rgba(5, 14, 18, 0.36)),
    rgba(5, 14, 18, 0.38);
}

.settlement-welcome__stage--active::before {
  background: #34d399;
  box-shadow: 0 0 12px rgba(52, 211, 153, 0.42);
}

.settlement-welcome__stage--disabled {
  opacity: 0.58;
}

.settlement-welcome__stage h4 {
  margin: 0.28rem 0 0;
  color: #fff3d2;
  font-size: 0.9rem;
  line-height: 1.18;
}

.settlement-welcome__stage p {
  margin: 0.36rem 0 0;
  color: rgba(244, 231, 208, 0.76);
  font-size: 0.72rem;
  line-height: 1.32;
}

.settlement-welcome__stage strong {
  display: block;
  margin-top: 0.42rem;
  color: #bae6fd;
  font-size: 0.69rem;
  line-height: 1.3;
}

.settlement-welcome__strategy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  padding: 0.62rem 0.82rem;
}

.settlement-welcome__strategy ul {
  display: grid;
  gap: 0.32rem;
  margin: 0.38rem 0 0;
  padding: 0;
  list-style: none;
}

.settlement-welcome__strategy li {
  position: relative;
  padding-left: 1rem;
  color: rgba(215, 226, 222, 0.86);
  font-size: 0.72rem;
  line-height: 1.28;
}

.settlement-welcome__strategy li::before {
  content: '';
  position: absolute;
  top: 0.52em;
  left: 0;
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.32);
}

.settlement-welcome__goals {
  padding: 0.62rem 0.82rem;
}

.settlement-welcome__goals > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.settlement-welcome__goals span {
  border: 1px solid rgba(125, 211, 252, 0.24);
  border-radius: 4px;
  background: rgba(8, 47, 73, 0.38);
  color: #d9f4ff;
  font-size: 0.75rem;
  line-height: 1.2;
  padding: 0.42rem 0.52rem;
}

.settlement-welcome__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-top: 1px solid rgba(190, 136, 65, 0.28);
  background:
    linear-gradient(180deg, rgba(13, 17, 17, 0.92), rgba(8, 10, 10, 0.98)),
    rgba(8, 10, 10, 0.98);
  margin: 0 -0.9rem calc(-0.75rem - env(safe-area-inset-bottom, 0px));
  padding: 0.58rem 0.9rem calc(0.62rem + env(safe-area-inset-bottom, 0px));
  color: rgba(236, 220, 189, 0.72);
  font-size: 0.78rem;
}

.settlement-welcome__footer > div {
  display: inline-flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.settlement-welcome-enter-active,
.settlement-welcome-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.settlement-welcome-enter-from,
.settlement-welcome-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}

@media (max-width: 780px) {
  .settlement-welcome-backdrop {
    align-items: flex-end;
    padding: 0.5rem;
  }

  .settlement-welcome {
    width: 100%;
    max-height: calc(100dvh - 1rem);
    --panel-modal-border-width: 14px;
    --panel-modal-border-image-width: 26px;
  }

  .settlement-welcome__body {
    padding: 0.78rem 0.78rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
  }

  .settlement-welcome__hero,
  .settlement-welcome__timeline,
  .settlement-welcome__strategy {
    grid-template-columns: 1fr;
  }

  .settlement-welcome__art {
    min-height: 12rem;
  }

  .settlement-welcome__timeline {
    gap: 0.5rem;
  }

  .settlement-welcome__stage {
    min-height: 0;
  }

  .settlement-welcome__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .settlement-welcome__footer > div {
    width: 100%;
  }

  .settlement-welcome__footer :deep(.panel-action-button) {
    flex: 1;
  }
}

@media (max-width: 460px) {
  .settlement-welcome__status {
    grid-template-columns: 1fr;
  }

  .settlement-welcome__footer > div {
    flex-direction: column;
  }
}
</style>
