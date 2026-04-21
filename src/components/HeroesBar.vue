<template>
  <div class="absolute left-0 bottom-0 w-full z-30 m-2 pointer-events-none">
    <div class="heroes-avatar-strip w-full overflow-x-auto flex flex-nowrap gap-3 p-2 pointer-events-auto">
      <template v-if="heroes.length">
        <div
          v-for="hero in heroes"
          :key="hero.id"
          class="text-white flex-shrink-0 flex flex-col gap-1 p-2 transition-all rounded-lg hover:bg-emerald-950/42 cursor-pointer select-none pointer-events-auto"
          :class="cardClass(hero.id)"
          @click="select(hero)"
        >
          <div class="flex items-center justify-between gap-2">
            <span v-if="!isMobile" class="opacity-85 font-semibold text-sm truncate">
              {{ hero.name }}
            </span>
            <div class="flex items-center gap-1.5 ml-auto flex-shrink-0">
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
          </div>

          <div class="flex items-center gap-2">
            <div class="text-2xl leading-none rounded flex items-center justify-center">
              <div class="relative top-[-16px] left-[-16px] -m-1">
                <Sprite :sprite="'src/assets/heroes/' + hero.avatar + '.png'" :zoom="2" :row="8" :size="32" :frames="2" :speed="450" />
              </div>
            </div>
            <span v-if="!isMobile" class="text-[10px] text-yellow-500 opacity-80">XP {{ hero.stats.xp }}</span>
          </div>

          <div v-if="showScoutControls(hero)" class="scout-controls" @click.stop>
            <button
              v-for="option in scoutOptions"
              :key="option.type"
              type="button"
              class="scout-button"
              :class="{ 'scout-button-active': hero.scoutResourceIntent?.resourceType === option.type }"
              :style="{ '--scout-color': option.color }"
              :title="scoutTitle(hero, option.label)"
              :aria-label="scoutTitle(hero, option.label)"
              :disabled="!!hero.carryingPayload"
              @click.stop="scout(hero, option.type)"
            >
              <span class="scout-button-icon" aria-hidden="true">
                <span class="scout-button-dot"></span>
                <span class="scout-button-sweep"></span>
              </span>
              <span v-if="!isMobile" class="scout-button-label">{{ option.code }}</span>
            </button>
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
import type { ResourceType } from '../core/types/Resource.ts';
import { requestHeroScoutResource } from '../core/heroService.ts';
import { getScoutResourceLabel, SCOUTABLE_RESOURCE_TYPES } from '../shared/game/scoutResources.ts';
import { heroes } from '../store/heroStore';
import {
  canControlHero,
  getHeroOwnerName,
  isHeroClaimedByCurrentPlayer,
  isHeroClaimedByOtherPlayer,
} from '../store/playerStore';
import { selectedHeroId, selectHero } from '../store/uiStore';

const scoutResourceColors: Partial<Record<ResourceType, string>> = {
  wood: '#79d47c',
  water: '#70d6ff',
  grain: '#f4d36b',
  stone: '#b9b3a1',
  ore: '#9aa6c7',
  crystal: '#8cd6ff',
  sand: '#e7c979',
  glass: '#b7f2ff',
};

const scoutResourceCodes: Partial<Record<ResourceType, string>> = {
  wood: 'W',
  water: 'H2O',
  grain: 'G',
  stone: 'S',
  ore: 'O',
  crystal: 'C',
  sand: 'S',
  glass: 'G',
};

const scoutOptions = SCOUTABLE_RESOURCE_TYPES.map((type) => ({
  type,
  label: getScoutResourceLabel(type),
  code: scoutResourceCodes[type] ?? type.slice(0, 1).toUpperCase(),
  color: scoutResourceColors[type] ?? '#e2e8f0',
}));

function select(hero: Hero) {
  if (!isHeroClaimedByOtherPlayer(hero.id, currentPlayerId.value) && !isMine(hero.id)) {
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

function scout(hero: Hero, resourceType: ResourceType) {
  if (!showScoutControls(hero) || hero.carryingPayload) {
    return;
  }

  requestHeroScoutResource(hero.id, resourceType);
}

function showScoutControls(hero: Hero) {
  return selectedHeroId.value === hero.id && canControlHero(hero.id, currentPlayerId.value);
}

function scoutTitle(hero: Hero, resourceLabel: string) {
  if (hero.carryingPayload) {
    return 'Empty hands before scouting';
  }

  return `Scout for ${resourceLabel}`;
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
    ? 'bg-emerald-950/48 border border-amber-200/70 shadow-[0_0_0_2px_rgba(255,232,166,0.32)]'
    : 'bg-emerald-950/24 border border-emerald-100/18 shadow-md';

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
  // Only intercept clearly vertical swipes; let horizontal scroll through
  if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 2) {
    e.preventDefault();
  }
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
.heroes-avatar-strip {
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  scrollbar-width: none; /* Firefox */
  background: linear-gradient(to top, rgba(21, 51, 35, 0.22), rgba(21, 51, 35, 0));
}

.heroes-avatar-strip::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.scout-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-top: 0.25rem;
  border-top: 1px solid rgba(225, 244, 190, 0.16);
}

.scout-button {
  --scout-color: #e2e8f0;
  height: 1.6rem;
  min-width: 1.75rem;
  padding: 0 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border: 1px solid rgba(225, 244, 190, 0.18);
  border-radius: 6px;
  background: rgba(35, 83, 46, 0.52);
  color: rgba(236, 253, 245, 0.92);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.scout-button:hover:not(:disabled) {
  border-color: var(--scout-color);
  background: rgba(65, 103, 49, 0.78);
  transform: translateY(-1px);
}

.scout-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.scout-button-active {
  border-color: var(--scout-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--scout-color) 42%, transparent);
}

.scout-button-icon {
  position: relative;
  width: 0.9rem;
  height: 0.9rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.scout-button-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--scout-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--scout-color) 65%, transparent);
}

.scout-button-sweep {
  position: absolute;
  width: 0.42rem;
  height: 0.1rem;
  right: 0.05rem;
  bottom: 0.1rem;
  border-radius: 999px;
  background: currentColor;
  transform: rotate(45deg);
  transform-origin: center;
}

.scout-button-label {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}

.heroes-sheet-enter-active, .heroes-sheet-leave-active { transition: transform .18s ease; }
.heroes-sheet-enter-from, .heroes-sheet-leave-to { transform: translateY(80px); }
.heroes-sheet-enter-to, .heroes-sheet-leave-from { transform: translateY(0); }
.hero-bubble-enter-active, .hero-bubble-leave-active { transition: transform .18s ease; }
.hero-bubble-enter-from, .hero-bubble-leave-to { transform: translateY(200px); }
.hero-bubble-enter-to, .hero-bubble-leave-from { transform: translateY(0); }
</style>
