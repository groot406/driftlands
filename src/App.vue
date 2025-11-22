<template>
  <!-- Scene swap with fade -->
  <Transition name="fade" mode="out-in">
    <TitleScreen v-if="isTitle()" key="title"/>
    <div v-else key="game" class="w-full h-screen relative">
      <div class="opacity-30"><TitleBackground :move="false" :blur="15" /></div>
      <Game />
      <InGameMenu />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Game from './components/Game.vue';
import TitleScreen from './components/TitleScreen.vue';
import InGameMenu from './components/InGameMenu.vue';
import { isTitle } from './store/uiStore';
import TitleBackground from "./components/TitleBackground.vue";
</script>

<style>
body, html {
  background: black;
  overflow:hidden;
  user-select: none;
}
</style>