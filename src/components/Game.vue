<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <TitleBackground :move="false" :blur="40" />
    <div class="flex-1 overflow-hidden w-full h-full">
      <HexMap @tile-click="handleTileClick" @tile-doubleclick="moveToTile" />
      <LoadingOverlay />
    </div>
  </div>
  <GameGui v-if="playing" />
</template>

<script setup lang="ts">
import { idleStore as store } from '../store/idleStore';
import { loadWorld, tiles as worldTiles } from '../core/world';
import { moveCamera } from '../core/camera';
import HexMap from './HexMap.vue';
import LoadingOverlay from './LoadingOverlay.vue';
import GameGui from './GameGui.vue';
import type { Tile } from '../core/world';
import { isPlaying } from '../store/uiStore';
import { computed, onMounted, onUnmounted } from 'vue';
import TitleBackground from "./TitleBackground.vue";
import { soundService } from '../core/soundService';
import { musicManager } from '../core/musicManager';
import { restoreActiveTaskSounds } from '../store/taskStore';
import { startPeriodicHeroUpdates, stopPeriodicHeroUpdates } from '../store/heroStore';
import { heroes, selectHero, getSelectedHero } from '../store/heroStore';

const playing = computed(() => isPlaying());

onMounted(async () => {
  // If we have saved tiles (continue) and world isn't loaded yet, load them.
  if (worldTiles.length === 0 && store.tiles.length) {
    loadWorld(store.tiles);
  }

  // Initialize sound system
  await soundService.initialize();

  // Initialize music manager
  musicManager.initialize();

  // Restore sounds for any active tasks (important for game reload)
  await restoreActiveTaskSounds();

  // Start periodic hero activity updates (replaces expensive 60 FPS updates)
  startPeriodicHeroUpdates();

  // Register global hotkeys for hero selection
  window.addEventListener('keydown', onGlobalKeyDown);
});

onUnmounted(() => {
  // Stop periodic hero updates
  stopPeriodicHeroUpdates();

  // Cleanup sound system
  soundService.destroy();
  musicManager.destroy();

  // Remove global hotkeys
  window.removeEventListener('keydown', onGlobalKeyDown);
});

function moveToTile(tile: Tile) {
  moveCamera(tile.q, tile.r);
}

function handleTileClick(_tile: Tile) {

}

// Global hotkeys: 1-9 select hero, Tab/Shift+Tab cycle through heroes
function onGlobalKeyDown(e: KeyboardEvent) {
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
    e.preventDefault(); // prevent focus change
    if (!heroes.length) return;
    const current = getSelectedHero();
    const currentIdx = current ? heroes.findIndex(h => h.id === current.id) : -1;
    let nextIdx = currentIdx;
    if (e.shiftKey) {
      nextIdx = currentIdx <= 0 ? heroes.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= 0 ? (currentIdx + 1) % heroes.length : 0;
    }
    selectHero(heroes[nextIdx], true);
    return;
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
