<template>
  <div class="absolute top-0 left-0 w-full h-full z-20 pointer-events-none select-none p-2 flex flex-col gap-4">
    <div class="flex flex-col md:flex-row gap-40 items-start">
      <div class="flex-1 flex flex-col gap-4">
        <ResourceBar/>
      </div>
      <div class="pointer-events-auto gap-2 flex flex-col justify-end justify-items-end" v-if="showHelpers">
        <WorldControls/>
        <DebugPanel/>
      </div>
    </div>
    <HeroesBar />
    <FpsCounter />
  </div>
  <OnlinePlayersIndicator />
  <InGameMenu />
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue';
import ResourceBar from './ResourceBar.vue';
import WorldControls from './WorldControls.vue';
import DebugPanel from "./DebugPanel.vue";
import HeroesBar from './HeroesBar.vue';
import InGameMenu from './InGameMenu.vue';
import FpsCounter from './FpsCounter.vue';
import OnlinePlayersIndicator from './OnlinePlayersIndicator.vue';

const showHelpers = ref(false);

onMounted(() =>
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        showHelpers.value = !showHelpers.value;
      }
    }));

</script>

<style>
.noscrollbar {
  scrollbar-width: none; /* Firefox */
}
.noscrollbar::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}
</style>