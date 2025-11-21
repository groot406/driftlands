<template>
  <div class="absolute left-0 bottom-0 w-full z-30 pointer-events-none">
    <div class="w-full overflow-x-auto flex gap-3 p-2 pointer-events-auto noscrollbar">
      <template v-if="heroes.length">
        <div
            v-for="h in heroes"
            :key="h.id"
            class="text-white flex-col items-center gap-3 bg-slate-800/40  backdrop-blur border border-white/10 rounded-xl  hover:bg-slate-600/60 transition-colors cursor-pointer select-none min-w-[160px]"
            @click="focus(h)"
        >
          <div class="p-3 w-full font-semibold text-sm">{{ h.name }}</div>
          <div class="flex px-2 gap-x-2 pb-2">
            <div class="text-2xl leading-none rounded w-1/2 flex items-center justify-center bg-yellow-600/30 backdrop-blur-lg">
              <div>{{ h.avatar }}</div>
            </div>
            <div class="flex flex-col leading-tight w-1/2">
              <div class="text-[10px] opacity-80 flex flex-col">
                <span>HP {{ h.stats.hp }}</span>
                <span>ATK {{ h.stats.atk }}</span>
                <span>SPD {{ h.stats.spd }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="text-xs opacity-70 px-2 py-1">No heroes recruited yet.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {focusHero, type Hero, heroes} from '../store/heroStore';

function focus(h: Hero) {
  focusHero(h);
}
</script>

<script lang="ts">
export default {name: 'HeroesBar'};
</script>

<style scoped>
::-webkit-scrollbar {
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>

