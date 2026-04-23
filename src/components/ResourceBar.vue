<template>
  <div class="resource-hud noscrollbar">
    <div class="inventory-strip inventory-strip-stocks">
      <NineSliceButton type="button" class="pop-bubble" title="Open settler overview" @click="openPopulationModal()">
        <span class="leading-none mr-4">&#x1F465;</span>
        <span class="text-sm text-opacity-60 font-mono leading-none text-emerald-50">{{ populationState.current }}/{{ populationState.max }}</span>
      </NineSliceButton>

      <ResourceBubble
        v-for="r in stockEntries"
        :key="r.key"
        :resource-key="r.key"
        :icon="r.icon"
        :label="r.label"
        :value="r.value"
        clickable
        @select="openResourceDetailModal(r.key)"
      />

    </div>

    <div v-if="itemEntries.length" class="inventory-strip inventory-strip-items" aria-label="Items">
      <ResourceBubble
        v-for="r in itemEntries"
        :key="r.key"
        :resource-key="r.key"
        :icon="r.icon"
        :label="r.label"
        :value="r.value"
        compact
        clickable
        @select="openResourceDetailModal(r.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ResourceBubble from './ResourceBubble.vue';
import {resourceInventory, resourceVersion} from '../store/resourceStore';
import {populationState} from '../store/clientPopulationStore';
import { openPopulationModal, openResourceDetailModal } from '../store/uiStore';
import { runSnapshot, runVersion } from '../store/runStore.ts';
import { getVisibleInventoryEntries } from '../shared/game/inventoryPresentation.ts';
import NineSliceButton from "./ui/NineSliceButton.vue";
import NineSlicePanel from "./ui/NineSlicePanel.vue";

const visibleEntries = computed(() => {
  resourceVersion.value;
  runVersion.value;

  return getVisibleInventoryEntries({
    inventory: resourceInventory,
    progression: runSnapshot.value?.progression ?? null,
  });
});

const stockEntries = computed(() => visibleEntries.value.filter((entry) => entry.group === 'stock'));
const itemEntries = computed(() => visibleEntries.value.filter((entry) => entry.group === 'item'));
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

.inventory-strip-items {
  padding-left: 6px;
  border-left: 1px solid rgba(196, 228, 151, 0.28);
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
