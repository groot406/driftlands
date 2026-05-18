<template>
  <div class="resource-hud noscrollbar">
    <div class="inventory-strip inventory-strip-stocks">
      <button
        type="button"
        class="pop-bubble"
        :class="populationPressureClass"
        :title="populationTitle"
        :aria-label="populationTitle"
        @click="openPopulationModal()"
      >
        <span class="pop-bubble-frame" aria-hidden="true"></span>
        <span class="pop-bubble-icon" aria-hidden="true">&#x1F465;</span>
        <span class="pop-bubble-copy">
          <span class="pop-bubble-label">Settlers</span>
          <span class="pop-bubble-value">
            {{ playerPopulation.current }}<span>/{{ playerPopulation.max }}</span>
          </span>
        </span>
      </button>

      <ResourceBubble
        v-for="group in groupedEntries"
        :key="group.key"
        :resource-key="group.entries[0]?.key ?? 'food'"
        :resource-keys="group.entries.map((entry) => entry.key)"
        :tone="group.key"
        :icon="group.icon"
        :label="group.shortLabel"
        :value="group.value"
        :breakdown="group.entries"
        show-label
        clickable
        @select="openResourceDetailModal(group.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ResourceBubble from './ResourceBubble.vue';
import {getSettlementResourceInventory, resourceInventory, resourceVersion} from '../store/resourceStore';
import {populationState} from '../store/clientPopulationStore';
import { openPopulationModal, openResourceDetailModal } from '../store/uiStore';
import { runSnapshot, runVersion } from '../store/runStore.ts';
import { getVisibleInventoryGroups } from '../shared/game/inventoryPresentation.ts';
import { currentPlayerSettlementId } from '../store/settlementStartStore.ts';

const playerPopulation = computed(() => {
  const settlementId = currentPlayerSettlementId.value;
  return settlementId
    ? populationState.settlements.find((settlement) => settlement.settlementId === settlementId) ?? populationState
    : populationState;
});

const playerInventory = computed(() => {
  resourceVersion.value;
  const settlementId = currentPlayerSettlementId.value;
  return settlementId ? getSettlementResourceInventory(settlementId) : resourceInventory;
});

const groupedEntries = computed(() => {
  resourceVersion.value;
  runVersion.value;

  return getVisibleInventoryGroups({
    inventory: playerInventory.value,
    progression: runSnapshot.value?.progression ?? null,
  });
});

const populationPressureClass = computed(() => `pop-bubble-${playerPopulation.value.pressureState ?? 'stable'}`);

const populationTitle = computed(() => (
  `Open settler overview (${playerPopulation.value.current}/${playerPopulation.value.max})`
));
</script>

<script lang="ts">
export default {name: 'ResourceBar'};
</script>

<style scoped>
.resource-hud {
  --resource-ui-font: 'Trebuchet MS', 'Gill Sans', system-ui, sans-serif;
  --resource-number-font: 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif;
  position: relative;
  display: flex;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
  pointer-events: auto;
  isolation: isolate;
}

.resource-hud::before {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 14rem;
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(5, 14, 14, 0.64), rgba(9, 31, 25, 0.42) 54%, rgba(9, 31, 25, 0));
  pointer-events: none;
}

.inventory-strip {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.52rem;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding: 0.16rem 0.52rem 0.56rem 0;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.inventory-strip::-webkit-scrollbar {
  display: none;
}

.inventory-strip::before {
  display: none;
}

.pop-bubble {
  --pop-accent: #c7a15b;
  position: relative;
  flex: 0 0 8.9rem;
  width: 8.9rem;
  min-width: 8.9rem;
  min-height: 3rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 0;
  padding: 0.38rem 0.78rem 0.4rem;
  appearance: none;
  border-radius: 0.4rem;
  background:
    linear-gradient(180deg, rgba(255, 232, 179, 0.12), rgba(0, 0, 0, 0.05) 48%, rgba(0, 0, 0, 0.24)),
    radial-gradient(ellipse at 38% 4%, color-mix(in srgb, var(--pop-accent) 14%, transparent), transparent 66%),
    linear-gradient(180deg, rgba(45, 32, 19, 0.45), rgba(13, 11, 9, 0.46));
  color: rgba(250, 242, 216, 0.96);
  box-shadow:
    0 1px 0 rgba(255, 235, 183, 0.11) inset,
    0 -2px 0 rgba(0, 0, 0, 0.27) inset,
    0 5px 5px rgba(0, 0, 0, 0.3);

  backdrop-filter: blur(0.5rem);

  image-rendering: pixelated;
  cursor: pointer;
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    filter 0.14s ease,
    box-shadow 0.14s ease;
}

.pop-bubble-frame {
  display: none;
}

.pop-bubble-icon {
  position: absolute;
  left: 0.62rem;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.42rem;
  height: 1.42rem;
  border: 0;
  border-radius: 0.48rem;
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--pop-accent) 26%, transparent), transparent 66%),
    rgba(21, 15, 10, 0.78);
  box-shadow:
    0 1px 0 rgba(255, 229, 173, 0.1) inset,
    0 2px 5px rgba(0, 0, 0, 0.24);
  font-size: 0.82rem;
  line-height: 1;
}

.pop-bubble-copy {
  min-width: 0;
  display: grid;
  gap: 0.12rem;
  justify-items: center;
  width: 100%;
  padding-inline: 2.08rem;
  text-align: center;
}

.pop-bubble-label {
  min-width: 0;
  white-space: nowrap;
  font-family: var(--resource-ui-font);
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1.1;
  color: color-mix(in srgb, var(--pop-accent) 62%, rgba(255, 244, 219, 0.78));
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.75);
  text-transform: uppercase;
  width: 100%;
  text-align: center;
}

.pop-bubble-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--resource-number-font);
  font-size: 1.04rem;
  font-weight: 900;
  line-height: 1;
  color: rgba(255, 247, 223, 0.98);
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.78),
    0 0 8px rgba(78, 48, 20, 0.28);
  font-variant-numeric: tabular-nums;
  width: 100%;
  text-align: center;
}

.pop-bubble-value span {
  color: rgba(218, 197, 159, 0.68);
  font-size: 0.74rem;
}

.pop-bubble:hover {
  border-color: color-mix(in srgb, var(--pop-accent) 42%, rgba(255, 232, 179, 0.18));
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow:
    0 1px 0 rgba(255, 235, 183, 0.12) inset,
    0 -2px 0 rgba(0, 0, 0, 0.28) inset,
    0 0 13px color-mix(in srgb, var(--pop-accent) 10%, transparent),
    0 12px 18px rgba(0, 0, 0, 0.34);
}

.pop-bubble:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--pop-accent) 72%, rgba(255, 244, 181, 0.78));
  outline-offset: 2px;
}

.pop-bubble-strained {
  --pop-accent: #d2a642;
}

.pop-bubble-collapsing {
  --pop-accent: #b85a47;
  animation: pop-alert-pulse 1.3s ease-in-out infinite;
}

@keyframes pop-alert-pulse {
  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(1.14);
  }
}

@media (max-width: 640px) {
  .resource-hud::before {
    height: 3.65rem;
  }

  .inventory-strip {
    gap: 0.34rem;
    padding: 0.14rem 0.35rem 0.46rem 0;
    scroll-snap-type: x proximity;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
  }

  .pop-bubble {
    flex-basis: 6.25rem;
    width: 6.25rem;
    min-width: 6.25rem;
    min-height: 2.5rem;
    padding: 0.28rem 0.5rem 0.3rem;
    border-radius: 0.4rem;
    scroll-snap-align: start;
  }

  .pop-bubble-icon {
    left: 0.44rem;
    width: 1.18rem;
    height: 1.18rem;
    border-radius: 0.4rem;
    font-size: 0.72rem;
  }

  .pop-bubble-copy {
    padding-inline: 1.5rem;
  }

  .pop-bubble-label {
    font-size: 0.55rem;
  }

  .pop-bubble-value {
    font-size: 0.88rem;
  }
}

@media (max-width: 480px) {
  .resource-hud::before {
    height: 3.2rem;
  }

  .inventory-strip {
    gap: 0.26rem;
    padding-bottom: 0.36rem;
  }

  .pop-bubble {
    flex-basis: 4.45rem;
    width: 4.45rem;
    min-width: 4.45rem;
    min-height: 2.34rem;
    padding: 0.26rem 0.32rem 0.28rem;
  }

  .pop-bubble-icon {
    left: 0.34rem;
    width: 1.05rem;
    height: 1.05rem;
    font-size: 0.66rem;
  }

  .pop-bubble-copy {
    padding-inline: 1.16rem;
  }

  .pop-bubble-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .pop-bubble-value {
    font-size: 0.8rem;
  }
}
</style>
