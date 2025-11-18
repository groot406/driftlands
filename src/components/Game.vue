<template>
  <div class="h-screen flex bg-slate-900 text-slate-100">
    <!-- Left: Hex Map & Tasks -->
    <div class="flex-1 p-4 overflow-hidden w-full h-full">
      <div class="flex items-center justify-between mb-4 absolute">
        <h1 class="text-2xl font-bold">Nexus Hex – Idle Frontier (POC)</h1>
        <button v-if="!store.running" class="btn" @click="startIdle()">Start</button>
        <div v-else class="text-xs opacity-70">Tick: {{ store.tick }}</div>
      </div>
      <div class="w-full h-full relative select-none justify-center items-center flex">
        <div v-for="tile in store.tiles" :key="tile.id" :style="tileStyle(tile)" class="absolute group">
          <div class="hex-tile flex flex-col items-center justify-center font-mono text-[9px] cursor-pointer"
               :class="tile.discovered ? '':'opacity-50'"
               :style="{ background: tile.discovered ? getTileBackground(tile) : fogColor }"
               @click="clickTile(tile)"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import { idleStore as store, startIdle, discoverTile, type Tile, getNeighbors, addRoad, hasRoad } from '../store/idleStore';
import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountain.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';

const HEX_SIZE = 24; // radius
const HEX_SPACE = 4;
const fogColor = '#475569';

function axialToPixel(q: number, r: number, size: number) {
  const x = (size + (HEX_SIZE * (0.155))) * Math.sqrt(3) * (q + r / 2);
  const y = (size) * 3/2 * r;
  return { x, y };
}

const mapWidth = computed(() => {
  let maxX = 0; store.tiles.forEach(tile => { const p = axialToPixel(tile.q, tile.r, HEX_SIZE); if (p.x > maxX) maxX = p.x; });
  return maxX + HEX_SIZE*2 + 20;
});
const mapHeight = computed(() => {
  let maxY = 0; store.tiles.forEach(tile => { const p = axialToPixel(tile.q, tile.r, HEX_SIZE); if (p.y > maxY) maxY = p.y; });
  return maxY + HEX_SIZE*2 + 20;
});

function tileStyle(tile: Tile) {
  const p = axialToPixel(tile.q, tile.r, HEX_SIZE);
  return {
    width: HEX_SIZE*2 - HEX_SPACE + 'px',
    height: HEX_SIZE*2 - HEX_SPACE + 'px',
    backgroundImage: getTileBackground(tile),
    transform: `translate(${p.x - HEX_SIZE}px, ${p.y - HEX_SIZE}px)`,
  };
}

function getTileBackground(tile: Tile) {
  return `url(${getTileImage(tile)}) center/cover`;
}

function getTileImage(tile: Tile) {
  switch(tile.terrain) {
    case 'towncenter': return towncenter;
    case 'forest': return forest;
    case 'mountain': return mountain;
    case 'water': return water;
    case 'mine': return mine;
    case 'ruin': return ruin;
    case 'plains':
    default: return plains;
  }
}
function clickTile(tile: Tile) {
  if (!tile.discovered) {
    discoverTile(tile);
  }
}

interface Edge { id: string; a: Tile; b: Tile; }

const edges = computed(() => {
  const list: Edge[] = [];
  store.tiles.forEach(t => {
    if (!t.discovered) return;
    const neighbors = getNeighbors(t.q, t.r);
    neighbors.forEach(n => {
      const other = store.tiles.find(x => x.q === n.q && x.r === n.r);
      if (!other || !other.discovered) return;
      // canonical id
      const id = t.id < other.id ? t.id + '__' + other.id : other.id + '__' + t.id;
      if (!list.find(e => e.id === id)) list.push({id, a: t, b: other});
    });
  });
  return list;
});

</script>

<style scoped>
.hex-tile {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  transition: filter 0.15s;
}
.hex-tile:hover { filter: brightness(1.15); }

</style>