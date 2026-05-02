<template>
  <div class="resource-hud noscrollbar">
    <div class="inventory-strip inventory-strip-stocks">
      <NineSliceButton type="button" class="pop-bubble" title="Open settler overview" @click="openPopulationModal()">
        <span class="leading-none mr-4 text-xs">&#x1F465;</span>
        <span class="text-sm text-opacity-60 font-mono leading-none text-emerald-50 pr-2 pb-1">{{ playerPopulation.current }}/{{ playerPopulation.max }}</span>
      </NineSliceButton>

      <ResourceBubble
        v-for="group in groupedEntries"
        :key="group.key"
        :resource-key="group.entries[0]?.key ?? 'food'"
        :resource-keys="group.entries.map((entry) => entry.key)"
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
import NineSliceButton from "./ui/NineSliceButton.vue";
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
</script>

<script lang="ts">
export default {name: 'ResourceBar'};
</script>

<style scoped>
.resource-hud {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  max-width: 100%;
  overflow-x: auto;
  pointer-events: auto;
}

.inventory-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pop-bubble {
  @apply flex items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-md;
  background: rgba(35, 83, 46, 0.78);
  border-color: rgba(196, 228, 151, 0.34);
  appearance: none;
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.pop-bubble:hover {
  transform: translateY(-2px);
}

.pop-bubble:focus-visible {
  outline: 2px solid rgba(251, 191, 36, 0.7);
  outline-offset: 2px;
}
</style>
