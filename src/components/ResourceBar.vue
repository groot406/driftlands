<template>
  <div id="resourcebar"
       class="flex flex-row items-center flex-wrap w-max justify-center rounded-lg gap-2 max-w-[100vw] overflow-x-auto pointer-events-auto">
    <ResourceBubble v-for="r in resources" :key="r.key" :icon="r.icon" :label="r.label" :value="r.value"/>
  </div>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue';
import {type ResourceType, worldVersion} from '../core/world';
import ResourceBubble from './ResourceBubble.vue';
import {idleStore as store} from '../store/idleStore';

interface ResMeta {
  key: ResourceType;
  label: string;
  icon: string;
}

const resources = ref({});

watch(worldVersion, () => {
  const counts: Record<ResourceType, number> = {
    wood: 0, ore: 0, stone: 0, food: 0, crystal: 0, artifact: 0,
  };
  for (const t of store.tiles) {
    if (!t.discovered || !t.terrain) continue;
    switch (t.terrain) {
      case 'forest':
        counts.wood++;
        break;
      case 'mine':
        counts.ore++;
        break;
      case 'ruin':
        counts.artifact++;
        break;
      case 'plains':
        counts.food++;
        break;
      case 'mountain':
        counts.crystal++;
        break;
      default:
        break;
    }
  }
  counts.stone = Math.round((counts.ore + counts.crystal) * 0.4);
  const meta: ResMeta[] = [
    {key: 'wood', label: 'Wood', icon: '🌲'},
    {key: 'ore', label: 'Ore', icon: '⛏️'},
    {key: 'stone', label: 'Stone', icon: '🪨'},
    {key: 'food', label: 'Food', icon: '🍖'},
    {key: 'crystal', label: 'Crystal', icon: '💎'},
    {key: 'artifact', label: 'Artifact', icon: '🏺'},
  ];

  resources.value = meta.map(m => ({...m, value: counts[m.key]}))
}, {immediate: true});

</script>

<script lang="ts">
export default {name: 'ResourceBar'};
</script>

<style scoped>
#resourcebar::-webkit-scrollbar {
  display: none;
}
</style>