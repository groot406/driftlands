<template>
  <Transition name="smooth-modal" appear>
    <div v-if="visible" class="menu-overlay smooth-modal-backdrop" @click.self="resumeGame">
      <div class="menu-panel smooth-modal-surface" :class="{ 'menu-panel-settings': showSettings }" @click.stop>
        <Transition name="menu-swap" mode="out-in">
          <div v-if="!showSettings" key="menu" class="menu-view">
            <div class="menu-header">
              <div class="menu-header-copy">
                <p class="menu-kicker pixel-font">Pause</p>
                <h2 class="menu-title">Frontier Menu</h2>
                <p class="menu-summary">Step back, tune the frontier, or head back to the title when you need a break.</p>
              </div>
              <button class="menu-close" @click="resumeGame" title="Resume game">
                ✕
              </button>
            </div>

            <div class="menu-section">
              <div class="menu-section-title">Quick Actions</div>
              <div class="menu-action-list">
                <button class="menu-action" @click="resumeGame">
                  <span class="menu-action-title">Back to Game</span>
                  <span class="menu-action-copy">Return straight to the frontier with no extra menus in the way.</span>
                </button>
                <button class="menu-action" @click="showSettings = true">
                  <span class="menu-action-title">Settings</span>
                  <span class="menu-action-copy">Adjust audio and graphics without leaving the current run.</span>
                </button>
                <button class="menu-action menu-action-danger" @click="returnToTitle">
                  <span class="menu-action-title">Return to Title</span>
                  <span class="menu-action-copy">Leave this session and head back to the title screen.</span>
                </button>
              </div>
            </div>

            <p class="menu-footer">Press ESC to resume</p>
          </div>

          <div v-else key="settings" class="menu-settings-view">
            <Settings @back="showSettings = false" />
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { uiStore, resumeGame, returnToTitle } from '../store/uiStore';
import { computed, ref, watch } from 'vue';
import Settings from './Settings.vue';

const visible = computed(() => uiStore.menuOpen);
const showSettings = ref(false);

// Reset to main menu when menu is closed
watch(visible, (isVisible) => {
  if (!isVisible) {
    showSettings.value = false;
  }
});

</script>

<style scoped>
.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(10px);
}

.menu-panel {
  width: min(520px, calc(100vw - 32px));
  max-height: min(82vh, calc(100vh - 32px));
  overflow-y: auto;
  border-radius: 28px;
  padding: 20px;
  color: #f8fafc;
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.15), transparent 34%),
    radial-gradient(circle at 78% 12%, rgba(251, 191, 36, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(5, 10, 19, 0.98), rgba(12, 18, 33, 0.94));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 34px 80px rgba(2, 6, 23, 0.48);
}

.menu-panel-settings {
  width: min(680px, calc(100vw - 32px));
}

.menu-panel::-webkit-scrollbar {
  width: 8px;
}

.menu-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
}

.menu-view,
.menu-settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.menu-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.menu-header-copy {
  flex: 1;
}

.menu-kicker {
  margin: 0;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.82);
}

.menu-title {
  margin: 8px 0 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: #f8fafc;
}

.menu-summary {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.72);
}

.menu-close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
  color: rgba(248, 250, 252, 0.9);
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.menu-close:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.28);
  background: rgba(15, 23, 42, 0.62);
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.menu-section-title {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.62);
}

.menu-action-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.menu-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 14px 16px;
  border-radius: 18px;
  text-align: left;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.08);
  color: #f8fafc;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.menu-action:hover,
.menu-action:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.26);
  background: rgba(15, 23, 42, 0.68);
  outline: none;
}

.menu-action-danger:hover,
.menu-action-danger:focus-visible {
  border-color: rgba(248, 113, 113, 0.28);
  background: rgba(69, 10, 10, 0.35);
}

.menu-action-title {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.menu-action-copy {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(226, 232, 240, 0.72);
}

.menu-footer {
  margin: 0;
  font-size: 11px;
  color: rgba(191, 219, 254, 0.48);
}

.menu-swap-enter-active,
.menu-swap-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.menu-swap-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.menu-swap-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

@media (max-width: 640px) {
  .menu-panel,
  .menu-panel-settings {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    padding: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-swap-enter-active,
  .menu-swap-leave-active {
    transition-duration: 120ms;
  }

  .menu-swap-enter-from,
  .menu-swap-leave-to {
    transform: none;
  }
}
</style>
