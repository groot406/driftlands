<template>
  <Teleport to="body">
    <Transition name="settlement-defeat">
      <div v-if="announcement" class="settlement-defeat-backdrop" @click.self="dismissSettlementDefeat">
        <PanelModalShell
          class="settlement-defeat-modal"
          role="dialog"
          aria-modal="true"
          header-label="Settlement Defeated"
          :header-title="title"
          header-icon="!"
          header-icon-color="amber"
          header-icon-variant="star"
          close-title="Close defeat report"
          close-aria-label="Close defeat report"
          @close="dismissSettlementDefeat"
        >
          <div class="settlement-defeat__body">
            <p class="settlement-defeat__copy">{{ bodyCopy }}</p>

            <div class="settlement-defeat__stats">
              <article>
                <span>{{ selfDefeated ? 'Final Score' : 'Captured By' }}</span>
                <strong>{{ selfDefeated ? formatNumber(announcement.finalScore) : conquerorLabel }}</strong>
              </article>
              <article>
                <span>Tiles Taken</span>
                <strong>{{ formatNumber(announcement.transferredTileCount) }}</strong>
              </article>
              <article>
                <span>Final Rank</span>
                <strong>#{{ announcement.finalRank }}</strong>
              </article>
            </div>

            <footer class="settlement-defeat__footer">
              <button type="button" class="settlement-defeat__button settlement-defeat__button-primary" @click="openScoreboard">
                View Scoreboard
              </button>
              <button type="button" class="settlement-defeat__button" @click="dismissSettlementDefeat">
                {{ selfDefeated ? 'Keep Watching' : 'Close' }}
              </button>
            </footer>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { currentPlayerId } from '../core/socket.ts';
import { activeSettlementDefeat, dismissSettlementDefeat } from '../store/settlementDefeatStore.ts';
import PanelModalShell from './ui/PanelModalShell.vue';

const announcement = activeSettlementDefeat;
const selfDefeated = computed(() => announcement.value?.defeatedPlayerId === currentPlayerId.value);
const conquerorLabel = computed(() => announcement.value?.defeatedByPlayerName ?? 'A rival settlement');
const title = computed(() => {
  const active = announcement.value;
  if (!active) {
    return '';
  }
  return selfDefeated.value
    ? 'Your settlement has fallen'
    : `${active.defeatedPlayerName} has fallen`;
});
const bodyCopy = computed(() => {
  const active = announcement.value;
  if (!active) {
    return '';
  }
  if (selfDefeated.value) {
    return `${conquerorLabel.value} captured your last town center. Your final score is locked, and you can keep watching the season as an observer.`;
  }
  return `${conquerorLabel.value} captured ${active.defeatedPlayerName}'s last town center. Their settlement is eliminated from active play.`;
});

function openScoreboard() {
  dismissSettlementDefeat();
  window.dispatchEvent(new CustomEvent('driftlands:open-season-scoreboard'));
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}
</script>

<style scoped>
.settlement-defeat-backdrop {
  position: fixed;
  inset: 0;
  z-index: 82;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 32% 16%, rgba(168, 50, 50, 0.24), transparent 22rem),
    linear-gradient(180deg, rgba(8, 10, 13, 0.42), rgba(8, 10, 13, 0.82)),
    rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.settlement-defeat-modal {
  width: min(38rem, calc(100vw - 1.25rem));
  --panel-modal-border-width: 18px;
  --panel-modal-border-image-width: 32px;
  --panel-header-height: 5.15rem;
}

.settlement-defeat__body {
  display: grid;
  gap: 1rem;
  padding: 1rem 1.1rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
}

.settlement-defeat__copy {
  margin: 0;
  max-width: 34rem;
  font-size: 0.95rem;
  line-height: 1.55;
  color: rgba(255, 244, 207, 0.78);
}

.settlement-defeat__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.settlement-defeat__stats article {
  min-width: 0;
  border: 1px solid rgba(190, 136, 65, 0.3);
  border-radius: 6px;
  padding: 0.75rem;
  background:
    linear-gradient(180deg, rgba(28, 33, 31, 0.82), rgba(13, 18, 18, 0.9));
}

.settlement-defeat__stats span {
  display: block;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgba(255, 244, 207, 0.62);
}

.settlement-defeat__stats strong {
  display: block;
  margin-top: 0.45rem;
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: 1rem;
  color: #fff7da;
}

.settlement-defeat__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}

.settlement-defeat__button {
  min-height: 2.4rem;
  border: 1px solid rgba(190, 136, 65, 0.5);
  border-radius: 5px;
  padding: 0 1rem;
  background:
    linear-gradient(180deg, rgba(38, 35, 29, 0.94), rgba(18, 17, 15, 0.94));
  color: #fff7da;
  font-weight: 800;
}

.settlement-defeat__button-primary {
  border-color: rgba(235, 174, 83, 0.75);
  background:
    linear-gradient(180deg, rgba(110, 68, 28, 0.96), rgba(64, 38, 20, 0.96));
}

.settlement-defeat-enter-active,
.settlement-defeat-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.settlement-defeat-enter-from,
.settlement-defeat-leave-to {
  opacity: 0;
  transform: scale(0.985);
}

@media (max-width: 640px) {
  .settlement-defeat__stats {
    grid-template-columns: 1fr;
  }

  .settlement-defeat__footer {
    flex-direction: column;
  }
}
</style>
