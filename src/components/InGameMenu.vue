<template>
  <Transition name="fade-menu" appear>
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center text-white">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        class="relative bg-slate-800/90 border border-slate-700 rounded-lg p-6 flex flex-col gap-4 transition-all duration-300"
        :class="showSettings ? 'w-[min(92vw,560px)] max-h-[80vh] overflow-y-auto' : 'w-[min(92vw,320px)]'"
      >
        <!-- Main Menu -->
        <div v-if="!showSettings" class="animate-in slide-in-from-left-2 duration-500">
          <h2 class="pixel-font text-xl mb-4">Menu</h2>
          <div class="flex flex-col gap-2 pixel-font text-xs">
            <button class="menu-btn" @click="resumeGame">Back to Game</button>
            <button class="menu-btn" @click="openMissionCenterFromMenu">Mission Centre</button>
            <button class="menu-btn" @click="openNotificationCenterFromMenu">Notification Log</button>
            <button class="menu-btn" @click="showSettings = true">Settings</button>
            <button class="menu-btn" @click="returnToTitle">Return to Title</button>
          </div>
          <p class="text-xs text-slate-500 mt-4">ESC to toggle</p>
        </div>

        <!-- Settings Panel -->
        <div v-else class="animate-in slide-in-from-right-2 duration-500">
          <Settings @back="showSettings = false" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { uiStore, resumeGame, returnToTitle } from '../store/uiStore';
import { computed, ref, watch } from 'vue';
import Settings from './Settings.vue';
import { openWindow, WINDOW_IDS } from '../core/windowManager';

const visible = computed(() => uiStore.menuOpen);
const showSettings = ref(false);

function openMissionCenterFromMenu() {
  resumeGame();
  openWindow(WINDOW_IDS.MISSION_CENTER);
}

function openNotificationCenterFromMenu() {
  resumeGame();
  openWindow(WINDOW_IDS.NOTIFICATION_CENTER);
}

// Reset to main menu when menu is closed
watch(visible, (isVisible) => {
  if (!isVisible) {
    showSettings.value = false;
  }
});

</script>

<style scoped>
.menu-btn {
  @apply px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left;
}

/* Menu fade transition */
.fade-menu-enter-active,
.fade-menu-leave-active {
  transition: all 0.3s ease;
}

.fade-menu-enter-from,
.fade-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Panel slide animations */
.animate-in {
  animation-fill-mode: both;
}

.slide-in-from-left-2 {
  animation: slide-in-left 0.2s ease-out;
}

.slide-in-from-right-2 {
  animation: slide-in-right 0.2s ease-out;
}

@keyframes slide-in-left {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
