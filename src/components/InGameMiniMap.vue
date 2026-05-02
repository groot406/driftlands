<template>
  <div
    v-if="terrainTiles.length > 0"
    ref="shellEl"
    class="ingame-minimap-shell"
    :class="{ 'ingame-minimap-shell--expanded': expanded }"
  >
    <section
      class="ingame-minimap"
      :class="{ 'ingame-minimap--expanded': expanded }"
      @click="handlePanelClick"
    >
      <header class="ingame-minimap__header">
        <span class="ingame-minimap__title p-1 top-1 relative">World Map</span>
        <button class="ingame-minimap__toggle relative top-1 -left-2" type="button" @click.stop="toggleExpanded">
          {{ expanded ? 'Hide' : 'Open' }}
        </button>
      </header>

      <div class="ingame-minimap__map">
        <WorldMiniMap
          aria-label="In-game minimap"
          compact
          draggable
          layout-mode="fixed"
          :terrain-tiles="terrainTiles"
          :hotspots="hotspots"
          :aspect-ratio="1"
          :viewport-center="viewportCenter ?? preferredCenter"
          :viewport-width-units="48"
          @hotspot-click="handleHotspotClick"
          @viewport-center-change="viewportCenter = $event"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import WorldMiniMap, { type MiniMapHotspot, type MiniMapTerrainTile } from './WorldMiniMap.vue';
import { heroes } from '../store/heroStore.ts';
import { getPlayerColor } from '../store/playerStore.ts';
import { currentPlayerSettlementId, settlementStartMarkers } from '../store/settlementStartStore.ts';
import { selectHero, selectedHeroId } from '../store/uiStore.ts';
import { currentPlayerId } from '../core/socket.ts';
import { moveCamera } from '../core/camera.ts';
import { tiles, worldVersion } from '../core/world.ts';

const expanded = ref(false);
const shellEl = ref<HTMLElement | null>(null);
const viewportCenter = ref<{ q: number; r: number } | null>(null);

const terrainTiles = computed<MiniMapTerrainTile[]>(() => {
  worldVersion.value;

  return tiles
    .filter((tile) => tile.discovered && tile.terrain)
    .map((tile) => ({
      id: tile.id,
      q: tile.q,
      r: tile.r,
      terrain: tile.terrain!,
    }));
});

const hotspots = computed<MiniMapHotspot[]>(() => {
  worldVersion.value;

  const settlementHotspots: MiniMapHotspot[] = settlementStartMarkers.value
    .filter((marker) => terrainTiles.value.some((tile) => tile.id === marker.settlementId))
    .map((marker) => ({
      id: `settlement:${marker.settlementId}`,
      q: marker.q,
      r: marker.r,
      kind: 'settlement',
      tone: 'settlement',
      color: marker.playerColor ?? '#b98a35',
      interactive: true,
      selected: marker.settlementId === currentPlayerSettlementId.value,
      title: marker.playerName ? `${marker.playerName}'s settlement` : 'Settlement',
    }));

  const heroHotspots: MiniMapHotspot[] = heroes
    .filter((hero) => hero.playerId === currentPlayerId.value)
    .map((hero) => ({
      id: `hero:${hero.id}`,
      q: hero.q,
      r: hero.r,
      kind: 'hero',
      tone: 'hero',
      color: getPlayerColor(hero.playerId) ?? '#f8fafc',
      interactive: true,
      selected: selectedHeroId.value === hero.id,
      title: hero.playerName ? `${hero.playerName}: ${hero.name}` : hero.name,
    }));

  return [...settlementHotspots, ...heroHotspots];
});

const preferredCenter = computed(() => {
  const selectedHero = heroes.find((hero) => hero.id === selectedHeroId.value && hero.playerId === currentPlayerId.value);
  if (selectedHero) {
    return { q: selectedHero.q, r: selectedHero.r };
  }

  const currentSettlement = settlementStartMarkers.value.find((marker) => marker.settlementId === currentPlayerSettlementId.value);
  if (currentSettlement) {
    return { q: currentSettlement.q, r: currentSettlement.r };
  }

  const ownHero = heroes.find((hero) => hero.playerId === currentPlayerId.value);
  if (ownHero) {
    return { q: ownHero.q, r: ownHero.r };
  }

  return { q: 0, r: 0 };
});

watch(preferredCenter, (nextCenter) => {
  if (!viewportCenter.value) {
    viewportCenter.value = nextCenter;
  }
}, { immediate: true });

function handleHotspotClick(hotspot: MiniMapHotspot) {
  if (hotspot.kind === 'hero') {
    const heroId = hotspot.id.replace(/^hero:/, '');
    const hero = heroes.find((entry) => entry.id === heroId) ?? null;
    selectHero(hero, false);
    if (hero) {
      moveCamera(hero.q, hero.r);
      viewportCenter.value = { q: hero.q, r: hero.r };
    }
    return;
  }

  moveCamera(hotspot.q, hotspot.r);
  viewportCenter.value = { q: hotspot.q, r: hotspot.r };
}

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function handlePanelClick() {
  if (!expanded.value) {
    expanded.value = true;
    return;
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!expanded.value) {
    return;
  }

  const shell = shellEl.value;
  const target = event.target;
  if (shell && target instanceof Node && !shell.contains(target)) {
    expanded.value = false;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<style scoped>
.ingame-minimap-shell {
  position: fixed;
  top: 50%;
  right: -13.9rem;
  z-index: 30;
  transform: translateY(-50%) rotate(-7deg);
  transform-origin: right center;
  transition: right 0.36s ease, transform 0.36s ease;
  pointer-events: auto;
}

.ingame-minimap-shell--expanded {
  right: 1rem;
  transform: translateY(-50%) rotate(0deg);
}

.ingame-minimap {
  position: relative;
  width: min(18rem, 38vw);
  padding: 0.2rem;
  border-radius: 18px 0 0 18px;
  border: 1px solid rgba(245, 222, 168, 0.22);
  background:
    linear-gradient(180deg, rgba(24, 63, 53, 0.96), rgba(12, 40, 35, 0.94));
  backdrop-filter: blur(10px);
  box-shadow:
    0 18px 38px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  cursor: pointer;
}


.ingame-minimap--expanded {
  border-radius: 18px;
  cursor: default;
}

.ingame-minimap__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.ingame-minimap__title {
  color: rgba(255, 244, 207, 0.9);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ingame-minimap__toggle {
  border: 0;
  background: rgba(250, 230, 170, 0.14);
  color: rgba(255, 244, 207, 0.92);
  border-radius: 999px;
  padding: 0.24rem 0.6rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0;
  cursor: pointer;
  transition: background 0.16s ease, transform 0.16s ease;
}

.ingame-minimap__toggle:hover {
  background: rgba(250, 230, 170, 0.22);
  transform: translateY(-1px);
}

.ingame-minimap__map {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px rgba(255, 244, 207, 0.06),
    0 10px 24px rgba(0, 0, 0, 0.14);
}
</style>
