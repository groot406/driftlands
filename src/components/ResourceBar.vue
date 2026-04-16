<template>
  <div class="noscrollbar flex flex-row items-center flex-wrap gap-1.5 max-w-full overflow-x-auto pointer-events-auto">
    <button class="pop-bubble" type="button" title="Open settler overview" @click="openPopulationModal()">
      <span class="text-xs leading-none">&#x1F465;</span>
      <span class="text-[11px] font-mono leading-none text-slate-200">{{ populationState.current }}/{{ populationState.max }}</span>
    </button>
    <ResourceBubble
      v-for="r in resources"
      :key="r.key"
      :resource-key="r.key"
      :icon="r.icon"
      :label="r.label"
      :value="r.value"
      clickable
      @select="openResourceDetailModal(r.key)"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, type Ref, watch} from 'vue';
import ResourceBubble from './ResourceBubble.vue';
import {resourceInventory, resourceVersion} from '../store/resourceStore';
import {populationState} from '../store/clientPopulationStore';
import type {ResourceType} from "../core/types/Resource.ts";
import { openPopulationModal, openResourceDetailModal } from '../store/uiStore';

interface ResMeta {
  key: ResourceType;
  label: string;
  icon: string;
}

interface Resource {
  key: ResourceType;
  label: string;
  icon: string;
  value: number;
}
const resources:Ref<Resource[]> = ref([]);

watch(() => resourceVersion.value, () => {
  const meta: ResMeta[] = [
    {key: 'wood', label: 'Wood', icon: '\uD83C\uDF32'},
    {key: 'ore', label: 'Ore', icon: '\u26CF\uFE0F'},
    {key: 'stone', label: 'Stone', icon: '\uD83E\uDEA8'},
    {key: 'tools', label: 'Tools', icon: '\uD83D\uDEE0\uFE0F'},
    {key: 'food', label: 'Food', icon: '\uD83C\uDF56'},
    {key: 'grain', label: 'Grain', icon: '\uD83C\uDF3E'},
    {key: 'water_lily', label: 'Water Lilies', icon: '\uD83E\uDEB7'},
  ];
  resources.value = meta.map(m => ({...m, value: resourceInventory[m.key] ?? 0}));
}, {immediate: true});
</script>

<script lang="ts">
export default {name: 'ResourceBar'};
</script>

<style scoped>
.pop-bubble {
  @apply flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-2 py-1.5 shadow-lg backdrop-blur-sm;
  background: rgba(2, 6, 23, 0.82);
  appearance: none;
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.pop-bubble:hover {
  transform: translateY(-1px);
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(15, 23, 42, 0.92);
}

.pop-bubble:focus-visible {
  outline: 2px solid rgba(251, 191, 36, 0.7);
  outline-offset: 2px;
}
</style>
