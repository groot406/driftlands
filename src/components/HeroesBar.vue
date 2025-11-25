<template>
  <div class="absolute left-0 bottom-0 w-full z-30 m-2">
    <div class="w-full overflow-x-auto flex gap-3 p-2 pointer-events-auto">
      <template v-if="heroes.length">
        <div
          v-for="h in heroes"
          :key="h.id"
          class="text-white flex-col items-center transition-all gap-3 backdrop-blur rounded-xl hover:bg-slate-600/40 cursor-pointer select-none pointer-events-auto"
          :class="selectedHeroId === h.id ? 'bg-slate-700/30 border border-yellow-400 shadow-[0_0_0_2px_rgba(255,216,107,0.4)]' : 'bg-slate-800/20 border border-white/10'"
          @click="select(h)"
        >
          <div v-if="!isMobile" class="p-3 pt-1.5 pb-0 opacity-65 w-full font-semibold text-sm">{{ h.name }}</div>
          <div class="flex px-2 gap-x-2 pb-2">
            <div class="text-2xl leading-none rounded flex items-center justify-center">
              <div class="relative top-[-15px] left-[-15px] -m-1">
                <Sprite :sprite="h.avatar" :zoom="2" :row="8" :size="32" :frames="2" :speed="450" />
              </div>
            </div>
            <div v-if="!isMobile" class="flex flex-col leading-tight w-1/2">
              <div class="text-[10px] opacity-80 flex flex-col">
                <span class="text-yellow-500">XP {{ h.stats.xp }}</span>
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
import { type Hero, heroes, selectedHeroId, selectHero } from '../store/heroStore';
import Sprite from './Sprite.vue';
import { onMounted, onBeforeUnmount, ref } from 'vue';

function select(h: Hero) { selectHero(h, true); }

const isMobile = ref(false);
const expanded = ref(false); // retained for potential future mobile sheet UI

function updateIsMobile() {
  isMobile.value = window.matchMedia('(max-width: 640px)').matches;
  if (!isMobile.value) expanded.value = false;
}
const mqListener = () => updateIsMobile();

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', mqListener);
});

onBeforeUnmount(() => { window.removeEventListener('resize', mqListener); });

// Swipe gesture state (for future expandable hero sheet on mobile)
let touchStartY = 0;
let touchStartX = 0;
let touchActive = false;

function onStripTouchStart(e: TouchEvent) {
  if (!isMobile.value || !e.touches.length) return;
  const target = e.target as HTMLElement;
  if (target.closest('button')) return; // ignore direct hero button taps
  touchActive = true;
  const t = e.touches[0];
  if (!t) return;
  touchStartY = t.clientY;
  touchStartX = t.clientX;
}
function onStripTouchMove(e: TouchEvent) {
  if (!touchActive || !e.touches.length) return;
  const t = e.touches[0];
  if (!t) return;
  const dy = t.clientY - touchStartY;
  const dx = t.clientX - touchStartX;
  if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) + 10) return;
  e.preventDefault();
}
function onStripTouchEnd(e: TouchEvent) {
  if (!touchActive) return;
  touchActive = false;
  const t = e.changedTouches[0];
  if (!t) return;
  const dy = t.clientY - touchStartY;
  if (dy < -40 && !expanded.value) expanded.value = true;
  else if (dy > 40 && expanded.value) expanded.value = false;
}

onMounted(() => {
  const strip = document.querySelector('.heroes-avatar-strip');
  if (strip) {
    (strip as any).addEventListener('touchstart', onStripTouchStart, { passive: true });
    (strip as any).addEventListener('touchmove', onStripTouchMove, { passive: false });
    (strip as any).addEventListener('touchend', onStripTouchEnd);
    (strip as any).addEventListener('touchcancel', onStripTouchEnd);
  }
});

onBeforeUnmount(() => {
  const strip = document.querySelector('.heroes-avatar-strip');
  if (strip) {
    (strip as any).removeEventListener('touchstart', onStripTouchStart);
    (strip as any).removeEventListener('touchmove', onStripTouchMove);
    (strip as any).removeEventListener('touchend', onStripTouchEnd);
    (strip as any).removeEventListener('touchcancel', onStripTouchEnd);
  }
});
</script>

<style scoped>
.heroes-sheet-enter-active, .heroes-sheet-leave-active { transition: transform .18s ease; }
.heroes-sheet-enter-from, .heroes-sheet-leave-to { transform: translateY(80px); }
.heroes-sheet-enter-to, .heroes-sheet-leave-from { transform: translateY(0); }
.hero-bubble-enter-active, .hero-bubble-leave-active { transition: transform .18s ease; }
.hero-bubble-enter-from, .hero-bubble-leave-to { transform: translateY(200px); }
.hero-bubble-enter-to, .hero-bubble-leave-from { transform: translateY(0); }
</style>
