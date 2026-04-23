<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <TitleBackground :move="false" :blur="40" />
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
import { soundService } from '../core/soundService';
import { musicManager } from '../core/musicManager';
import { heroes } from '../store/heroStore';
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

// Global hotkeys: 1-9 select hero, Tab/Shift+Tab cycle through heroes
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
    if (heroes[idx]) {
      selectHero(heroes[idx], true);
    }
    return;
  }

  // Tab cycles selection; Shift+Tab cycles backwards
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!heroes.length) return;
    const current = getSelectedHero();
    const currentIdx = current ? heroes.findIndex(h => h.id === current.id) : -1;
    let nextIdx;
    if (e.shiftKey) {
      nextIdx = currentIdx <= 0 ? heroes.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= 0 ? (currentIdx + 1) % heroes.length : 0;
    }

    const nextHero = heroes[nextIdx];
    if (!nextHero) {
      return;
    }

    selectHero(nextHero, true);
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
