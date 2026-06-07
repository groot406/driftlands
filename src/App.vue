<template>
  <!-- Scene swap with fade -->
  <Transition name="fade" mode="out-in">
    <TitleScreen v-if="isTitle()" key="title"/>
    <div
      v-else
      key="game"
      class="w-full h-screen relative"
      :class="{ 'browser-light-rendering': browserLightRendering }"
    >
      <Game />
      <InGameMenu />
    </div>
  </Transition>
  <ChangelogModal />
</template>

<script setup lang="ts">
import Game from './components/Game.vue';
import TitleScreen from './components/TitleScreen.vue';
import InGameMenu from './components/InGameMenu.vue';
import ChangelogModal from './components/ChangelogModal.vue';
import { isTitle } from './store/uiStore';
import { computed } from 'vue';
import { shouldUseBrowserLightRendering } from './store/graphicsStore';

const browserLightRendering = computed(() => shouldUseBrowserLightRendering());
</script>

<style>
body, html {
  background: black;
  overflow:hidden;
  user-select: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
}

.pixel-font {
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
}

.browser-light-rendering *,
.browser-light-rendering *::before,
.browser-light-rendering *::after {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

.browser-light-rendering :is(
  .pop-bubble,
  .resource-bubble,
  .menu-shortcut-btn,
  .debug-toggle-btn,
  .tutorial-toggle-btn,
  .goals-toggle-btn,
  .conversation-recall-btn,
  .calamity-countdown-hud,
  .ingame-minimap,
  .hero-card,
  .hero-card-status-icon,
  .hero-floating-menu,
  .skill-menu,
  .nine-slice-panel,
  .panel-frame,
  .panel-icon-banner,
  .panel-stat-card
) {
  filter: none !important;
}
</style>
