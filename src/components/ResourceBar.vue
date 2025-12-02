<template>
  <div class="noscrollbar flex flex-row items-center flex-wrap w-max justify-center rounded-lg gap-2 max-w-[100vw] overflow-x-auto pointer-events-auto">
    <ResourceBubble v-for="r in resources" :key="r.key" :icon="r.icon" :label="r.label" :value="r.value"/>
  </div>
</template>

<script setup lang="ts">
import {ref, type Ref, watch} from 'vue';
import {type ResourceType} from '../core/world';
import ResourceBubble from './ResourceBubble.vue';
import {resourceInventory, resourceVersion} from '../store/resourceStore';

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

watch(resourceVersion, () => {
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
