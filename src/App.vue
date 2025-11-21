<template>
  <!-- Title Screen -->
  <TitleScreen v-if="isTitle()" />
  <!-- Game Scene -->
  <div v-else class="w-full h-screen relative">
    <Game />
    <PauseMenu />
  </div>
</template>

<script setup lang="ts">
import Game from './components/Game.vue';
import TitleScreen from './components/TitleScreen.vue';
import PauseMenu from './components/PauseMenu.vue';
import { isTitle } from './store/uiStore';
</script>

<style>
body, html {
  background: black;
  overflow:hidden;
  user-select: none;
}
</style>