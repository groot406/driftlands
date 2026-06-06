<template>
  <Transition name="defeated-observer">
    <aside v-if="entry" class="defeated-observer-banner" aria-live="polite">
      <div>
        <span>Defeated</span>
        <strong>Observer Mode</strong>
      </div>
      <p>{{ defeatedByLabel }} captured your last town center. Final score {{ formatNumber(entry.score) }}.</p>
      <button type="button" @click="openScoreboard">Scoreboard</button>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { currentPlayerId } from '../core/socket.ts';
import { getSeasonEntryForPlayer } from '../store/seasonStore.ts';

const entry = computed(() => {
  const seasonEntry = getSeasonEntryForPlayer(currentPlayerId.value);
  return seasonEntry?.defeated ? seasonEntry : null;
});
const defeatedByLabel = computed(() => entry.value?.defeatedByPlayerName ?? 'A rival settlement');

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}

function openScoreboard() {
  window.dispatchEvent(new CustomEvent('driftlands:open-season-scoreboard'));
}
</script>

<style scoped>
.defeated-observer-banner {
  align-self: center;
  max-width: min(560px, calc(100vw - 2rem));
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(248, 113, 113, 0.55);
  border-radius: 6px;
  background:
    linear-gradient(135deg, rgba(69, 10, 10, 0.94), rgba(19, 24, 28, 0.94)),
    repeating-linear-gradient(45deg, rgba(248, 113, 113, 0.08) 0 1px, transparent 1px 7px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 245, 218, 0.12);
  color: #fff7df;
  pointer-events: auto;
}

.defeated-observer-banner span {
  display: block;
  color: #fca5a5;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.defeated-observer-banner strong {
  display: block;
  color: #fff2c4;
  font-size: 0.95rem;
  line-height: 1.1;
  white-space: nowrap;
}

.defeated-observer-banner p {
  min-width: 0;
  margin: 0;
  color: rgba(255, 247, 223, 0.86);
  font-size: 0.78rem;
  line-height: 1.35;
}

.defeated-observer-banner button {
  border: 1px solid rgba(255, 242, 196, 0.45);
  border-radius: 4px;
  padding: 0.48rem 0.65rem;
  background: linear-gradient(180deg, rgba(123, 43, 21, 0.96), rgba(79, 24, 17, 0.96));
  color: #fff7df;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
  cursor: pointer;
}

.defeated-observer-banner button:hover {
  border-color: rgba(255, 242, 196, 0.78);
  filter: brightness(1.08);
}

.defeated-observer-enter-active,
.defeated-observer-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.defeated-observer-enter-from,
.defeated-observer-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 680px) {
  .defeated-observer-banner {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .defeated-observer-banner p {
    grid-column: 1 / -1;
    order: 3;
  }
}
</style>
