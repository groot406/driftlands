<template>
  <div class="noscrollbar flex flex-row items-center flex-wrap gap-1.5 max-w-full overflow-x-auto pointer-events-auto">
    <div class="pop-bubble">
      <span class="text-xs leading-none">&#x1F465;</span>
      <span class="text-[11px] font-mono leading-none text-slate-200">{{ populationState.current }}/{{ populationState.max }}</span>
    </div>
    <ResourceBubble v-for="r in resources" :key="r.key" :resource-key="r.key" :icon="r.icon" :label="r.label" :value="r.value"/>
  </div>
</template>

<script setup lang="ts">
import {ref, type Ref, watch} from 'vue';
import ResourceBubble from './ResourceBubble.vue';
import {resourceInventory, resourceVersion} from '../store/resourceStore';
import {populationState} from '../store/clientPopulationStore';
import type {ResourceType} from "../core/types/Resource.ts";

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
    {key: 'food', label: 'Food', icon: '\uD83C\uDF56'},
    {key: 'crystal', label: 'Crystal', icon: '\uD83D\uDC8E'},
    {key: 'artifact', label: 'Artifact', icon: '\uD83C\uDFFA'},
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
}
</style>
