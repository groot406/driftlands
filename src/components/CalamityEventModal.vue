<template>
  <Teleport to="body">
    <Transition name="calamity-modal">
      <div v-if="report" class="calamity-backdrop" @click.self="closeCalamityReport">
        <section class="calamity-modal" :class="`calamity-modal--${report.event.kind}`" role="dialog" aria-modal="true">
          <button class="calamity-close" type="button" title="Close report" @click="closeCalamityReport">x</button>

          <div class="calamity-art" :style="artStyle" aria-hidden="true"></div>

          <div class="calamity-content">
            <header class="calamity-header">
              <p class="calamity-eyebrow">{{ phaseLabel }}</p>
              <h2>{{ report.event.title || displayName }}</h2>
              <p class="calamity-story">{{ storyText }}</p>
            </header>

            <div class="calamity-grid">
              <section class="calamity-card calamity-card--effects">
                <h3>Effects</h3>
                <ul>
                  <li v-for="effect in effects" :key="effect">{{ effect }}</li>
                </ul>
              </section>

              <section class="calamity-card calamity-card--good">
                <h3>Good Side</h3>
                <ul>
                  <li v-for="item in goodSide" :key="item">{{ item }}</li>
                </ul>
              </section>

              <section class="calamity-card calamity-card--bad">
                <h3>Bad Side</h3>
                <ul>
                  <li v-for="item in badSide" :key="item">{{ item }}</li>
                </ul>
              </section>

              <section class="calamity-card calamity-card--next">
                <h3>What To Do</h3>
                <ul>
                  <li v-for="item in nextSteps" :key="item">{{ item }}</li>
                </ul>
              </section>
            </div>

            <footer class="calamity-footer">
              <span>{{ severityLabel }}</span>
              <button type="button" @click="closeCalamityReport">Back to Colony</button>
            </footer>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  activeCalamityReport,
  closeCalamityReport,
  formatResourceLosses,
  getCalamityDisplayName,
} from '../store/calamityEventStore.ts';
import type { CalamityKind } from '../shared/protocol.ts';
import calamityAtlasUrl from '../assets/ui/calamity-event-atlas.png';

const report = activeCalamityReport;

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

const effects = computed(() => {
  const event = report.value?.event;
  if (!event) return [];

  const lines: string[] = [];
  if (event.phase === 'warning' && event.impactAt) {
    lines.push(`Expected impact around ${new Date(event.impactAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
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
      return ['Settlers can die without medicine and strong rations.', 'Labor capacity may drop immediately.'];
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
</script>

<style scoped>
.calamity-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(5, 13, 16, 0.72);
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.calamity-modal {
  position: relative;
  width: min(58rem, 100%);
  max-height: min(44rem, calc(100vh - 2rem));
  display: grid;
  grid-template-columns: minmax(15rem, 0.75fr) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(250, 230, 170, 0.28);
  border-radius: 8px;
  background: rgba(15, 23, 22, 0.98);
  color: #fff4cf;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
}

.calamity-close {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  z-index: 2;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  border: 1px solid rgba(250, 230, 170, 0.22);
  background: rgba(5, 13, 16, 0.62);
  color: #fff4cf;
  font-weight: 800;
}

.calamity-art {
  position: relative;
  min-height: 100%;
  overflow: hidden;
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
  gap: 1rem;
  overflow-y: auto;
  padding: 1.25rem;
}

.calamity-header {
  padding-right: 2.25rem;
}

.calamity-eyebrow {
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 0.6rem;
  letter-spacing: 0;
  color: rgb(252 211 77);
  text-transform: uppercase;
}

.calamity-header h2 {
  margin-top: 0.45rem;
  font-size: clamp(1.35rem, 3vw, 2.15rem);
  line-height: 1.05;
  font-weight: 900;
}

.calamity-story {
  margin-top: 0.7rem;
  color: rgba(255, 244, 207, 0.82);
  line-height: 1.55;
}

.calamity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.calamity-card {
  border: 1px solid rgba(250, 230, 170, 0.16);
  border-radius: 8px;
  background: rgba(6, 18, 20, 0.46);
  padding: 0.85rem;
}

.calamity-card h3 {
  margin-bottom: 0.5rem;
  color: rgb(253 230 138);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0;
}

.calamity-card ul {
  display: grid;
  gap: 0.45rem;
  color: rgba(255, 244, 207, 0.82);
  font-size: 0.9rem;
  line-height: 1.35;
}

.calamity-card li {
  list-style: disc;
  margin-left: 1rem;
}

.calamity-card--good {
  border-color: rgba(74, 222, 128, 0.24);
}

.calamity-card--bad {
  border-color: rgba(248, 113, 113, 0.26);
}

.calamity-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-top: 1px solid rgba(250, 230, 170, 0.14);
  padding-top: 0.75rem;
}

.calamity-footer span {
  color: rgba(255, 244, 207, 0.58);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0;
}

.calamity-footer button {
  border-radius: 8px;
  border: 1px solid rgba(252, 211, 77, 0.42);
  background: rgba(146, 64, 14, 0.86);
  color: #fff4cf;
  padding: 0.65rem 1rem;
  font-weight: 800;
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
  .calamity-modal {
    grid-template-columns: 1fr;
  }

  .calamity-art {
    min-height: 11rem;
  }

  .calamity-grid {
    grid-template-columns: 1fr;
  }
}
</style>
