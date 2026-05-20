<template>
  <Teleport to="body">
    <Transition name="ship-arrival">
      <div
        v-if="announcement"
        class="ship-arrival-backdrop"
        @click.self="dismissShipArrivalAnnouncement"
      >
        <PanelModalShell
          class="ship-arrival-shell"
          role="dialog"
          aria-modal="true"
          header-icon="tools"
          header-icon-color="blue"
          header-icon-variant="build"
          header-label="Ship Arrived"
          :header-title="announcement.name"
          close-title="Close ship arrival"
          close-aria-label="Close ship arrival"
          @close="dismissShipArrivalAnnouncement"
        >
          <div class="ship-arrival-body">
            <div class="ship-arrival-portrait" :style="shipPortraitStyle" aria-hidden="true"></div>

            <section class="ship-arrival-copy">
              <p class="ship-arrival-kicker">Arrived from {{ announcement.origin }}</p>
              <h3>{{ announcement.name }} is ready for cargo.</h3>
              <p>
                The crew expects Harbor settlements to load requested goods before departure.
                Contributions earn a share of Gold and imported trade goods when the ship leaves.
              </p>
            </section>

            <section class="ship-arrival-cargo" aria-label="Requested cargo">
              <div
                v-for="resource in announcement.requested"
                :key="resource.type"
                class="ship-arrival-cargo-row"
              >
                <span>{{ resourceLabel(resource.type) }}</span>
                <strong>{{ resource.amount }}</strong>
              </div>
            </section>

            <footer class="ship-arrival-footer">
              <PanelActionButton
                type="button"
                size="large"
                @click="openShipOrderPanelFromArrivalAnnouncement"
              >
                Open Loading Panel
              </PanelActionButton>
            </footer>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';

import type { ResourceType } from '../core/types/Resource.ts';
import { getInventoryEntryDefinition } from '../shared/game/inventoryPresentation.ts';
import {
  dismissShipArrivalAnnouncement,
  openShipOrderPanelFromArrivalAnnouncement,
  shipArrivalAnnouncement,
} from '../store/shipOrderStore.ts';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelModalShell from './ui/PanelModalShell.vue';
import shipPortraitAtlasUrl from '../assets/ui/ships/trading-ship-portraits-atlas.png';

const announcement = shipArrivalAnnouncement;

const shipPortraitIndex = computed(() => {
  const id = announcement.value?.id ?? announcement.value?.name ?? 'ship-arrival';
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0)) % 4;
  }
  return hash;
});

const shipPortraitStyle = computed<CSSProperties>(() => ({
  backgroundImage: `url(${shipPortraitAtlasUrl})`,
  backgroundPosition: `${shipPortraitIndex.value === 0 ? 0 : (shipPortraitIndex.value / 3) * 100}% center`,
}));

function resourceLabel(type: ResourceType) {
  return getInventoryEntryDefinition(type).label;
}
</script>

<style scoped>
.ship-arrival-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(2, 7, 10, 0.54);
  backdrop-filter: blur(4px) saturate(0.9) brightness(0.9);
  -webkit-backdrop-filter: blur(4px) saturate(0.9) brightness(0.9);
}

.ship-arrival-shell {
  --panel-modal-border-width: 20px;
  --panel-modal-border-image-width: 36px;
  --panel-header-height: 5.45rem;
  --panel-header-padding: 1.02rem 4rem 0.72rem 6.2rem;
  width: min(34rem, calc(100vw - 1.5rem));
}

.ship-arrival-body {
  display: grid;
  grid-template-columns: 8.25rem minmax(0, 1fr);
  gap: 1rem;
  padding: 1.05rem;
}

.ship-arrival-portrait {
  width: 8.25rem;
  min-height: 9.2rem;
  border: 1px solid rgba(178, 142, 84, 0.5);
  border-radius: 6px;
  background-color: rgba(13, 24, 31, 0.82);
  background-repeat: no-repeat;
  background-size: 400% 100%;
  box-shadow: inset 0 0 34px rgba(0, 0, 0, 0.42), 0 10px 24px rgba(0, 0, 0, 0.22);
}

.ship-arrival-copy {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0.42rem;
}

.ship-arrival-kicker {
  margin: 0;
  color: rgba(191, 223, 232, 0.72);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ship-arrival-copy h3 {
  margin: 0;
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.35rem;
  line-height: 1.08;
}

.ship-arrival-copy p:not(.ship-arrival-kicker) {
  margin: 0;
  color: rgba(243, 228, 201, 0.82);
  font-size: 0.9rem;
  line-height: 1.45;
}

.ship-arrival-cargo {
  grid-column: 1 / -1;
  display: grid;
  gap: 0.45rem;
  padding: 0.68rem;
  border: 1px solid rgba(178, 142, 84, 0.36);
  border-radius: 6px;
  background: rgba(10, 15, 17, 0.62);
}

.ship-arrival-cargo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.15rem;
  border-bottom: 1px solid rgba(178, 142, 84, 0.18);
  color: rgba(243, 228, 201, 0.86);
  font-size: 0.88rem;
}

.ship-arrival-cargo-row:last-child {
  border-bottom: 0;
}

.ship-arrival-cargo-row strong {
  color: #fff0d2;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
}

.ship-arrival-footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.ship-arrival-enter-active,
.ship-arrival-leave-active {
  transition: opacity 0.16s ease;
}

.ship-arrival-enter-active .ship-arrival-shell,
.ship-arrival-leave-active .ship-arrival-shell {
  transition: transform 0.16s ease;
}

.ship-arrival-enter-from,
.ship-arrival-leave-to {
  opacity: 0;
}

.ship-arrival-enter-from .ship-arrival-shell,
.ship-arrival-leave-to .ship-arrival-shell {
  transform: translateY(0.45rem) scale(0.98);
}

@media (max-width: 560px) {
  .ship-arrival-body {
    grid-template-columns: 1fr;
    padding: 0.85rem;
  }

  .ship-arrival-portrait {
    width: 100%;
    min-height: 7.5rem;
  }

  .ship-arrival-footer {
    justify-content: stretch;
  }

  .ship-arrival-footer :deep(.panel-action-button) {
    width: 100%;
  }
}
</style>
