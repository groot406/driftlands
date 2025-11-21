<template>
  <!-- Scene swap with fade -->
  <Transition name="fade" mode="out-in">
    <TitleScreen v-if="isTitle()" key="title"/>
    <div v-else key="game" class="w-full h-screen relative">
      <Game />
      <PauseMenu />
    </div>
  </Transition>
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