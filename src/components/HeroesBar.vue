<template>
  <div class="absolute left-0 bottom-0 w-full z-30 pointer-events-none">
    <div class="w-full overflow-x-auto flex gap-3 p-2 noscrollbar">
      <template v-if="heroes.length">
        <div
            v-for="h in heroes"
            :key="h.id"
            class="text-white flex-col items-center  pointer-events-auto  gap-3 backdrop-blur rounded-xl hover:bg-slate-600/60 transition-colors cursor-pointer select-none min-w-[160px]"
            :class="selectedHeroId === h.id ? 'bg-slate-700/70 border border-yellow-400 shadow-[0_0_0_2px_rgba(255,216,107,0.4)]' : 'bg-slate-800/40 border border-white/10'"
            @click="select(h)"
        >
          <div class="p-3 w-full font-semibold text-sm">{{ h.name }}</div>
          <div class="flex px-2 gap-x-2 pb-2">
            <div class="text-2xl leading-none rounded w-1/2 flex items-center justify-center bg-yellow-600/30 backdrop-blur-lg">
              <div class="relative top-[-16px] left-[-16px]">
                <Sprite :sprite="h.avatar"
                        :zoom="2"
                        :row="8"
                        :size="32"
                        :frames="2"
                        :speed="450"
                        />
              </div>
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
import {type Hero, heroes, selectHero, selectedHeroId} from '../store/heroStore';
import Sprite from "./Sprite.vue";

function select(h: Hero) {
  selectHero(h, true);
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
