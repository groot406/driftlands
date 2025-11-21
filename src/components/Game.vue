<template>
  <div class="h-screen flex bg-slate-900 text-slate-100 select-none">
    <div class="flex-1 overflow-hidden w-full h-full">
      <HexMap @tile-click="handleTileClick" @tile-doubleclick="moveToTile" />
      <LoadingOverlay />
    </div>
  </div>
  <GameGui />
</template>

<script setup lang="ts">
import {  idleStore as store } from '../store/idleStore';
import {discoverTile, loadWorld} from '../core/world';
import { moveCamera } from '../core/camera';
import HexMap from './HexMap.vue';
import LoadingOverlay from './LoadingOverlay.vue';
import GameGui from './GameGui.vue';
import type { Tile } from '../core/world';

function moveToTile(tile: Tile) {
  moveCamera(tile.q, tile.r)
}

function handleTileClick(tile: Tile) {
  if (!tile.discovered) {
    discoverTile(tile);
    return;
  }
  console.log('Clicked tile', tile);
}

loadWorld(store.tiles);
</script>

<style>
body, html {
  background: black;
  overflow:hidden;
}
</style>