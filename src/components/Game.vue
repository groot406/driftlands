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
});

onUnmounted(() => {
  // Cleanup sound system
  soundService.destroy();
  musicManager.destroy();
});

function moveToTile(tile: Tile) {
  moveCamera(tile.q, tile.r);
}

function handleTileClick(_tile: Tile) {

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
