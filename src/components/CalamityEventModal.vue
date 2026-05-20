<template>
  <Teleport to="body">
    <Transition name="calamity-modal">
      <div v-if="report" class="calamity-backdrop" @click.self="closeCalamityReport">
        <PanelModalShell
          class="calamity-modal"
          :class="`calamity-modal--${report.event.kind}`"
          role="dialog"
          aria-modal="true"
          close-title="Close report"
          close-aria-label="Close disaster report"
          @close="closeCalamityReport"
        >
          <div class="calamity-art" :style="artStyle" aria-hidden="true"></div>

          <div class="calamity-content">
            <header class="calamity-header">
              <p class="calamity-eyebrow">{{ phaseLabel }}</p>
              <h2>{{ report.event.title || displayName }}</h2>
              <p class="calamity-story">{{ storyText }}</p>
              <div v-if="warningCountdownText" class="calamity-countdown">
                <span>Impact in</span>
                <strong>{{ warningCountdownText }}</strong>
              </div>
            </header>

            <div class="calamity-grid">
              <section class="calamity-card calamity-card--effects">
                <h3><span class="calamity-card-icon" :style="calamityIconStyle('effects')" aria-hidden="true"></span>Effects</h3>
                <ul>
                  <li v-for="effect in effects" :key="effect">{{ effect }}</li>
                </ul>
              </section>

              <section class="calamity-card calamity-card--good">
                <h3><span class="calamity-card-icon" :style="calamityIconStyle('good')" aria-hidden="true"></span>Good Side</h3>
                <ul>
                  <li v-for="item in goodSide" :key="item">{{ item }}</li>
                </ul>
              </section>

              <section class="calamity-card calamity-card--bad">
                <h3><span class="calamity-card-icon" :style="calamityIconStyle('bad')" aria-hidden="true"></span>Bad Side</h3>
                <ul>
                  <li v-for="item in badSide" :key="item">{{ item }}</li>
                </ul>
              </section>

              <section class="calamity-card calamity-card--next">
                <h3><span class="calamity-card-icon" :style="calamityIconStyle('next')" aria-hidden="true"></span>What To Do</h3>
                <ul>
                  <li v-for="item in nextSteps" :key="item">{{ item }}</li>
                </ul>
              </section>
            </div>

            <footer class="calamity-footer">
              <span class="calamity-major-bar">
                <span class="calamity-card-icon" :style="calamityIconStyle('bad')" aria-hidden="true"></span>
                {{ severityLabel }}
              </span>
              <button type="button" @click="closeCalamityReport">Back to Colony</button>
            </footer>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  activeCalamityReport,
  closeCalamityReport,
  formatResourceLosses,
  getCalamityDisplayName,
} from '../store/calamityEventStore.ts';
import type { CalamityKind } from '../shared/protocol.ts';
import calamityAtlasUrl from '../assets/ui/calamity-event-atlas.png';
import settlerIconAtlasUrl from '../assets/ui/settler-modal/icon-atlas.png';
import PanelModalShell from './ui/PanelModalShell.vue';

const report = activeCalamityReport;
const now = ref(Date.now());
let countdownTimer: number | null = null;

const CALAMITY_ART_POSITIONS: Record<CalamityKind, string> = {
  volcano_eruption: '0% 0%',
  flood: '50% 0%',
  lost_harvest: '100% 0%',
  food_spoilage: '0% 100%',
  forest_fire: '50% 100%',
  outbreak: '100% 100%',
};

const displayName = computed(() => report.value ? getCalamityDisplayName(report.value.event.kind) : 'Calamity');

const artStyle = computed(() => ({
  backgroundImage: `url(${calamityAtlasUrl})`,
  backgroundPosition: report.value ? CALAMITY_ART_POSITIONS[report.value.event.kind] : '50% 50%',
}));

type CalamityIcon = 'effects' | 'good' | 'bad' | 'next';

const calamityIconPositions: Record<CalamityIcon, string> = {
  effects: '0% 100%',
  good: '0% 50%',
  bad: '100% 100%',
  next: '100% 0%',
};

function calamityIconStyle(icon: CalamityIcon) {
  return {
    backgroundImage: `url(${settlerIconAtlasUrl})`,
    backgroundPosition: calamityIconPositions[icon],
  };
}

const phaseLabel = computed(() => {
  const phase = report.value?.event.phase ?? 'impact';
  if (phase === 'warning') return `${displayName.value} Warning`;
  if (phase === 'averted') return `${displayName.value} Contained`;
  return `${displayName.value} Report`;
});

const severityLabel = computed(() => {
  const severity = report.value?.event.severity ?? 'minor';
  return `${severity.toUpperCase()} EVENT`;
});

const storyText = computed(() => {
  const event = report.value?.event;
  if (!event) return '';

  if (event.phase === 'warning') {
    return `${event.message} The colony has a short window to prepare before this reaches the settlement.`;
  }

  if (event.phase === 'averted') {
    return `${event.message} The settlement avoided the worst of it this time.`;
  }

  return event.message;
});

const warningCountdownText = computed(() => {
  const event = report.value?.event;
  const openedAt = report.value?.openedAt;
  if (event?.phase !== 'warning' || !event.impactAt || !openedAt) {
    return '';
  }

  return formatCountdown(getReportRemainingMs(event.impactAt, event.timestamp, openedAt));
});

const effects = computed(() => {
  const event = report.value?.event;
  if (!event) return [];

  const lines: string[] = [];
  if (event.phase === 'warning' && event.impactAt) {
    const openedAt = report.value?.openedAt ?? now.value;
    lines.push(`Expected impact in ${formatCountdown(getReportRemainingMs(event.impactAt, event.timestamp, openedAt))}.`);
  }
  if (event.affectedTileIds.length > 0) {
    lines.push(`${event.affectedTileIds.length} tile${event.affectedTileIds.length === 1 ? '' : 's'} affected or at risk.`);
  }
  for (const loss of formatResourceLosses(event.resourceLosses)) {
    lines.push(`Lost ${loss}.`);
  }
  if (typeof event.populationLoss === 'number' && event.populationLoss > 0) {
    lines.push(`${event.populationLoss} settler${event.populationLoss === 1 ? '' : 's'} lost.`);
  }
  if (lines.length === 0) {
    lines.push(event.phase === 'warning' ? 'No damage yet.' : 'No direct losses were reported.');
  }

  return lines;
});

const goodSide = computed(() => {
  const kind = report.value?.event.kind;
  switch (kind) {
    case 'volcano_eruption':
      return ['Ash can leave richer soil behind.', 'Scorched ground may become useful farmland later.'];
    case 'flood':
      return ['Dry tilled plots may be hydrated.', 'Flood control and water planning become easier to judge.'];
    case 'lost_harvest':
      return ['Weak food planning is exposed early.', 'Drought-hit fields can be replanted with better support.'];
    case 'food_spoilage':
      return ['Storage weaknesses become obvious.', 'Better warehouses and ledgers reduce future loss.'];
    case 'forest_fire':
      return ['Burned woods can leave salvageable trunks.', 'Firebreaks and water sources become easier to prioritize.'];
    case 'outbreak':
      return ['Medicine and food reserves prove their value.', 'Population pressure becomes clearer.'];
    default:
      return ['The colony gets a clear signal about what needs reinforcement.'];
  }
});

const badSide = computed(() => {
  const kind = report.value?.event.kind;
  switch (kind) {
    case 'volcano_eruption':
      return ['Nearby crops, forests, roads, and buildings can be damaged.', 'Recovery may pull workers away from growth.'];
    case 'flood':
      return ['Roads and crops near water are vulnerable.', 'Buildings close to water may take condition damage.'];
    case 'lost_harvest':
      return ['Food production can stall quickly.', 'Workers may need to replant instead of expanding.'];
    case 'food_spoilage':
      return ['Stored food can disappear at the worst time.', 'Low reserves increase population risk.'];
    case 'forest_fire':
      return ['Forest production and nearby structures can suffer.', 'Uncontrolled fire can remove useful work sites.'];
    case 'outbreak':
      return ['Settlers can die without medicine and strong food stores.', 'Labor capacity may drop immediately.'];
    default:
      return ['Some colony systems may be weaker than they looked.'];
  }
});

const nextSteps = computed(() => {
  const kind = report.value?.event.kind;
  switch (kind) {
    case 'volcano_eruption':
      return ['Repair damaged buildings.', 'Rebuild roads.', 'Use rich soil for future crops.'];
    case 'flood':
      return ['Check roads near water.', 'Repair damaged buildings.', 'Add wells or water control near vulnerable farms.'];
    case 'lost_harvest':
      return ['Replant fields.', 'Secure food reserves.', 'Add water access before expanding crops.'];
    case 'food_spoilage':
      return ['Rebuild food reserves.', 'Add better storage.', 'Prioritize bread, fish, or meat production.'];
    case 'forest_fire':
      return ['Repair camps and roads.', 'Harvest salvage where possible.', 'Keep water sources near forest work sites.'];
    case 'outbreak':
      return ['Stabilize food.', 'Complete Field Medicine.', 'Avoid overextending population until beds and supplies recover.'];
    default:
      return ['Inspect the affected area.', 'Repair critical buildings.', 'Adjust the next build priority.'];
  }
});

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getReportRemainingMs(impactAt: number, serverTimestamp: number | undefined, openedAt: number) {
  const serverNowAtOpen = serverTimestamp ?? openedAt;
  return Math.max(0, impactAt - serverNowAtOpen - (now.value - openedAt));
}

onMounted(() => {
  countdownTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 250);
});

onUnmounted(() => {
  if (countdownTimer != null) {
    window.clearInterval(countdownTimer);
  }
});
</script>

<style scoped>
.calamity-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 22% 45%, rgba(90, 51, 126, 0.2), transparent 23rem),
    rgba(1, 5, 12, 0.82);
  backdrop-filter: blur(5px) saturate(0.82) brightness(0.78);
  pointer-events: auto;
}

.calamity-modal {
  position: relative;
  box-sizing: border-box;
  width: min(58rem, calc(100vw - 32px));
  max-height: min(86vh, 39rem);
  display: grid;
  grid-template-columns: minmax(15rem, 0.78fr) minmax(0, 1fr);
  overflow: hidden;
  border: 16px solid transparent;
  border-image: url('../assets/ui/settler-modal/panel-frame.png') 72 / 28px stretch;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, #121619 0%, #0a0d10 100%);
  color: #f3e4c9;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.64), inset 0 0 64px rgba(0, 0, 0, 0.82);
}

.calamity-art {
  position: relative;
  min-height: 100%;
  overflow: hidden;
  border-right: 1px solid rgba(170, 113, 52, 0.58);
  background-color: #101816;
  background-repeat: no-repeat;
  background-size: 300% 200%;
}

.calamity-art::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent 70%, rgba(15, 23, 22, 0.28)),
    linear-gradient(180deg, rgba(255, 244, 207, 0.08), rgba(0, 0, 0, 0.14));
  pointer-events: none;
}

.calamity-content {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.82rem;
  overflow-y: auto;
  padding: 1.1rem 1.2rem 1.05rem;
}

.calamity-header {
  padding-right: 2.65rem;
}

.calamity-eyebrow {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #d0a050;
  text-transform: uppercase;
  text-shadow: 0 1px 0 #070706;
}

.calamity-header h2 {
  margin: 0.35rem 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.7rem, 3vw, 2.25rem);
  line-height: 1.05;
  color: #fff1d4;
  text-shadow: 0 2px 0 #090807;
}

.calamity-story {
  margin: 0.45rem 0 0;
  color: #d7c8a7;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.98rem;
  line-height: 1.35;
}

.calamity-countdown {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.72rem;
  border: 7px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 7px stretch;
  padding: 0.28rem 0.6rem;
}

.calamity-countdown span,
.calamity-countdown strong {
  font-family: Georgia, 'Times New Roman', serif;
  color: #f3dfb9;
  font-size: 0.8rem;
}

.calamity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}

.calamity-card {
  min-height: 8.1rem;
  padding: 0.72rem 0.85rem;
  border: 1px solid rgba(159, 105, 47, 0.36);
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 226, 161, 0.032), transparent 8rem),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 8px),
    rgba(12, 14, 15, 0.58);
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.56);
}

.calamity-card h3 {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  margin: 0 0 0.5rem;
  color: #d0a050;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.calamity-card-icon {
  width: 1.3rem;
  height: 1.3rem;
  display: inline-block;
  flex: 0 0 auto;
  background-repeat: no-repeat;
  background-size: 400% 300%;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.68));
}

.calamity-card ul {
  display: grid;
  gap: 0.42rem;
  margin: 0;
  padding: 0;
  color: #d7c8a7;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.86rem;
  line-height: 1.3;
}

.calamity-card li {
  margin-left: 1.1rem;
}

.calamity-card--good {
  border-color: rgba(108, 157, 48, 0.54);
}

.calamity-card--bad {
  border-color: rgba(181, 67, 51, 0.58);
}

.calamity-card--next {
  border-color: rgba(201, 141, 39, 0.58);
}

.calamity-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: auto;
}

.calamity-major-bar {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.45rem;
  flex: 1;
  padding: 0.35rem 0.72rem;
  border: 7px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 7px stretch;
  color: #c9b894;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.calamity-footer button {
  min-height: 2.45rem;
  border: 7px solid transparent;
  border-image: url('../assets/ui/settler-modal/stat-badge.png') 46 fill / 7px stretch;
  background: transparent;
  color: #fff0d2;
  padding: 0.25rem 0.95rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.calamity-modal-enter-active,
.calamity-modal-leave-active {
  transition: opacity 0.18s ease;
}

.calamity-modal-enter-from,
.calamity-modal-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .calamity-backdrop {
    padding: 0;
  }

  .calamity-modal {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }

  .calamity-art {
    min-height: 11rem;
    border-right: 0;
    border-bottom: 1px solid rgba(170, 113, 52, 0.58);
  }

  .calamity-content {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }

  .calamity-grid {
    grid-template-columns: 1fr;
  }
}
</style>
