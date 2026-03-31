<template>
  <div class="noscrollbar flex flex-row items-center flex-wrap w-max justify-center rounded-lg gap-2 max-w-full overflow-x-auto pointer-events-auto">
    <div class='flex flex-row items-center w-max min-w-[120px] backdrop-blur-lg justify-center p-1 rounded-lg bg-slate-700/20 border-t-2 border-b-1 border-t-white/10 border-b-black/20 shadow gap-x-2 px-2 pr-4 pointer-events-auto'>
      <div class='text-sm leading-none'>&#x1F465;</div>
      <div class='pixel-font text-sm text-white/40'>{{ populationState.current }}/{{ populationState.max }}</div>
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
