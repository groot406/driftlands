<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <TitleBackground :move="false" :background-image="gameBackgroundTexture" />
    <div class="flex-1 overflow-hidden w-full h-full">
      <HexMap @tile-doubleclick="moveToPosition" />
      <LoadingOverlay />
    </div>
  </div>
  <div v-show="playing">
    <GameGui />
  </div>
</template>

<script setup lang="ts">
import { moveCamera } from '../core/camera';
import HexMap from './HexMap.vue';
import LoadingOverlay from './LoadingOverlay.vue';
import GameGui from './GameGui.vue';
import { isPlaying, getSelectedHero, selectHero } from '../store/uiStore';
import { computed, onMounted, onUnmounted } from 'vue';
import TitleBackground from "./TitleBackground.vue";
import gameBackgroundTexture from '../assets/ui/game-background-texture.png';
import { soundService } from '../core/soundService';
import { musicManager } from '../core/musicManager';
import { heroes } from '../store/heroStore';
import { canControlHero } from '../store/playerStore';
import { currentPlayerId } from '../core/socket';
import { isKeyboardBlocked } from '../core/windowManager';
import {createLoader, updateLoader, finishLoader} from "../core/loader.ts";

const playing = computed(() => isPlaying());

onMounted(async () => {
  createLoader('init', {title: 'Loading world...'});
  updateLoader('init', {title: 'Initializing sound system...'});

  // Initialize sound system
  await soundService.initialize();

  // Initialize music manager
  musicManager.initialize();

  updateLoader('init', {title: 'Initializing heroes...'});

  // Register global hotkeys for hero selection
  window.addEventListener('keydown', onGlobalKeyDown);

  finishLoader('init')
});

onUnmounted(() => {
  // Cleanup sound system
  soundService.destroy();
  musicManager.destroy();

  // Remove global hotkeys
  window.removeEventListener('keydown', onGlobalKeyDown);
});

function moveToPosition(position: { q: number, r: number} ) {
  moveCamera(position.q, position.r);
}

// Global hotkeys: 1-9 select hero, brackets cycle through heroes
function onGlobalKeyDown(e: KeyboardEvent) {
  // Ignore if any modal is blocking keyboard input
  if (isKeyboardBlocked.value) return;

  // Ignore if focus is in an editable element
  const target = e.target as HTMLElement | null;
  const isEditable = !!target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    (target as any).isContentEditable
  );
  if (isEditable) return;

  // Number keys 1-9 select hero by index
  if (e.key >= '1' && e.key <= '9') {
    const idx = Number(e.key) - 1;
    const selectableHeroes = heroes.filter((hero) => canControlHero(hero.id, currentPlayerId.value));
    if (selectableHeroes[idx]) {
      selectHero(selectableHeroes[idx], false);
    }
    return;
  }

  // Bracket keys cycle selection; left bracket cycles backwards.
  if (e.key === '[' || e.key === ']') {
    e.preventDefault();
    const selectableHeroes = heroes.filter((hero) => canControlHero(hero.id, currentPlayerId.value));
    if (!selectableHeroes.length) return;
    const current = getSelectedHero();
    const currentIdx = current ? selectableHeroes.findIndex(h => h.id === current.id) : -1;
    let nextIdx;
    if (e.key === '[') {
      nextIdx = currentIdx <= 0 ? selectableHeroes.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= 0 ? (currentIdx + 1) % selectableHeroes.length : 0;
    }

    const nextHero = selectableHeroes[nextIdx];
    if (!nextHero) {
      return;
    }

    selectHero(nextHero, false);
  }
}
</script>

<style scoped>
.map-container {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: contain;
}


</style>
