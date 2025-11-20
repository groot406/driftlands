<template>
  <div class="flex flex-col items-end pointer-events-auto">
    <div><button class="mini-btn w-max" @click="open = !open">Debug {{ open ? '−' : '+' }}</button></div>
    <div v-if="open" class="gap-2 w-[200px] mt-4 flex flex-col space-y-1 text-[11px] text-white">
      <div class="flex justify-between"><span>Worldversion</span><span>{{ worldVersion }}</span></div>
      <div class="flex justify-between"><span>Tick</span><span>{{ store.tick }}</span></div>
      <div class="flex justify-between"><span>Tiles</span><span>{{ store.tiles.length }}</span></div>
      <div class="flex justify-between"><span>Camera</span><span>{{ camera.q.toFixed(1) }}, {{camera.r.toFixed(1) }}</span></div>
      <div class="flex justify-between"><span>Running</span><span>{{ store.running ? 'Yes' : 'No' }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import {camera} from '../core/camera';
import {worldVersion} from '../core/world';
import {idleStore as store} from '../store/idleStore';

const open = ref(false);
</script>

<style scoped>
.mini-btn {
  @apply px-2 py-1 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white shadow border border-slate-600;
}
</style>

