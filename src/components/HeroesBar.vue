<template>
  <div class="absolute left-0 bottom-0 w-full z-30 m-2 pointer-events-none">
    <div class="heroes-avatar-strip w-full overflow-x-auto flex gap-3 p-2">
      <template v-if="heroes.length">
        <div
          v-for="hero in heroes"
          :key="hero.id"
          class="text-white flex-col items-center transition-all gap-3 backdrop-blur rounded-xl hover:bg-slate-600/40 cursor-pointer select-none pointer-events-auto relative overflow-hidden"
          :class="cardClass(hero.id)"
          @click="select(hero)"
        >
          <div class="absolute top-2 right-2 flex items-center gap-2">
            <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold border" :class="statusClass(hero.id)">
              {{ heroStatus(hero.id) }}
            </span>
            <button
              v-if="canClaim(hero.id)"
              class="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-500/30"
              @click.stop="claim(hero.id)"
            >
              Claim
            </button>
            <button
              v-else-if="isMine(hero.id)"
              class="rounded-full bg-slate-900/60 border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-900/80"
              @click.stop="release(hero.id)"
            >
              Release
            </button>
          </div>

          <div v-if="!isMobile" class="p-3 pt-1.5 pb-0 pr-24 opacity-85 w-full font-semibold text-sm">
            {{ hero.name }}
          </div>
          <div class="flex px-2 gap-x-2 pb-2 pt-4">
            <div class="text-2xl leading-none rounded flex items-center justify-center">
              <div class="relative top-[-16px] left-[-16px] -m-1">
                <Sprite :sprite="'src/assets/heroes/' + hero.avatar + '.png'" :zoom="2" :row="8" :size="32" :frames="2" :speed="450" />
              </div>
            </div>
            <div v-if="!isMobile" class="flex flex-col leading-tight w-1/2">
              <div class="text-[10px] opacity-80 flex flex-col">
                <span class="text-yellow-500">XP {{ hero.stats.xp }}</span>
                <span>HP {{ hero.stats.hp }}</span>
                <span>ATK {{ hero.stats.atk }}</span>
                <span>SPD {{ hero.stats.spd }}</span>
                <span class="text-cyan-200/90 pt-1">{{ heroOwnerSummary(hero.id) }}</span>
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
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Sprite from './Sprite.vue';
import { requestHeroClaim, requestHeroRelease } from '../core/coopService';
import { currentPlayerId } from '../core/socket';
import type { Hero } from '../core/types/Hero.ts';
import { heroes } from '../store/heroStore';
import {
  canControlHero,
  getHeroOwnerName,
  isHeroClaimedByCurrentPlayer,
  isHeroClaimedByOtherPlayer,
} from '../store/playerStore';
import { selectedHeroId, selectHero } from '../store/uiStore';

function select(hero: Hero) {
  if (!isHeroClaimedByOtherPlayer(hero.id, currentPlayerId.value)) {
    requestHeroClaim(hero.id);
  }

  selectHero(hero, true);
}

function claim(heroId: string) {
  requestHeroClaim(heroId);
}

function release(heroId: string) {
  requestHeroRelease(heroId);
}

function isMine(heroId: string) {
  return isHeroClaimedByCurrentPlayer(heroId, currentPlayerId.value);
}

function canClaim(heroId: string) {
  return canControlHero(heroId, currentPlayerId.value) && !isMine(heroId);
}

function heroStatus(heroId: string) {
  if (isMine(heroId)) {
    return 'Yours';
  }

  const ownerName = getHeroOwnerName(heroId);
  return ownerName ? ownerName : 'Public';
}

function heroOwnerSummary(heroId: string) {
  if (isMine(heroId)) {
    return 'Exclusive control';
  }

  const ownerName = getHeroOwnerName(heroId);
  return ownerName ? `Claimed by ${ownerName}` : 'Unclaimed co-op slot';
}

function statusClass(heroId: string) {
  if (isMine(heroId)) {
    return 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100';
  }

  if (isHeroClaimedByOtherPlayer(heroId, currentPlayerId.value)) {
    return 'bg-amber-500/20 border-amber-400/40 text-amber-100';
  }

  return 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100';
}

function cardClass(heroId: string) {
  const isSelected = selectedHeroId.value === heroId;
  const base = isSelected
    ? 'bg-slate-700/30 border border-yellow-400 shadow-[0_0_0_2px_rgba(255,216,107,0.4)]'
    : 'bg-slate-800/20 border border-white/10';

  if (isHeroClaimedByOtherPlayer(heroId, currentPlayerId.value)) {
    return `${base} opacity-80`;
  }

  return base;
}

const isMobile = ref(false);
const expanded = ref(false);

function updateIsMobile() {
  isMobile.value = window.matchMedia('(max-width: 640px)').matches;
  if (!isMobile.value) expanded.value = false;
}

const mqListener = () => updateIsMobile();

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', mqListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', mqListener);
});

let touchStartY = 0;
let touchStartX = 0;
let touchActive = false;

function onStripTouchStart(e: TouchEvent) {
  if (!isMobile.value || !e.touches.length) return;
  const target = e.target as HTMLElement;
  if (target.closest('button')) return;

  touchActive = true;
  const touch = e.touches[0];
  if (!touch) return;
  touchStartY = touch.clientY;
  touchStartX = touch.clientX;
}

function onStripTouchMove(e: TouchEvent) {
  if (!touchActive || !e.touches.length) return;
  const touch = e.touches[0];
  if (!touch) return;
  const dy = touch.clientY - touchStartY;
  const dx = touch.clientX - touchStartX;
  if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) + 10) return;
  e.preventDefault();
}

function onStripTouchEnd(e: TouchEvent) {
  if (!touchActive) return;
  touchActive = false;
  const touch = e.changedTouches[0];
  if (!touch) return;
  const dy = touch.clientY - touchStartY;
  if (dy < -40 && !expanded.value) expanded.value = true;
  else if (dy > 40 && expanded.value) expanded.value = false;
}

onMounted(() => {
  const strip = document.querySelector<HTMLElement>('.heroes-avatar-strip');
  if (!strip) {
    return;
  }

  strip.addEventListener('touchstart', onStripTouchStart, { passive: true });
  strip.addEventListener('touchmove', onStripTouchMove, { passive: false });
  strip.addEventListener('touchend', onStripTouchEnd);
  strip.addEventListener('touchcancel', onStripTouchEnd);
});

onBeforeUnmount(() => {
  const strip = document.querySelector<HTMLElement>('.heroes-avatar-strip');
  if (!strip) {
    return;
  }

  strip.removeEventListener('touchstart', onStripTouchStart);
  strip.removeEventListener('touchmove', onStripTouchMove);
  strip.removeEventListener('touchend', onStripTouchEnd);
  strip.removeEventListener('touchcancel', onStripTouchEnd);
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
