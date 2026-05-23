<template>
  <Transition name="debug-tools-panel" appear>
    <div class="debug-tools-backdrop smooth-modal-backdrop" @click.self="$emit('close')">
      <PanelModalShell
        as="div"
        class="debug-tools-panel"
        header-label="Developer Tools"
        header-title="World Debug Panel"
        header-icon="*"
        close-aria-label="Close debug panel"
        @close="$emit('close')"
      >
        <div class="debug-tools-shell">
          <nav class="debug-tools-tabs" aria-label="Debug panel sections">
            <button
              v-if="showDebugTools"
              class="debug-tools-tab"
              :class="{ 'debug-tools-tab--active': activeTab === 'tools' }"
              type="button"
              @click="activeTab = 'tools'"
            >
              Controls
            </button>
            <button
              v-if="showDebugTools"
              class="debug-tools-tab"
              :class="{ 'debug-tools-tab--active': activeTab === 'fps' }"
              type="button"
              @click="activeTab = 'fps'"
            >
              FPS
            </button>
            <button
              v-if="showAdminTools"
              class="debug-tools-tab"
              :class="{ 'debug-tools-tab--active': activeTab === 'season' }"
              type="button"
              @click="activeTab = 'season'"
            >
              Season
            </button>
          </nav>

          <section class="debug-tools-content">
            <WorldControls v-if="activeTab === 'tools' && showDebugTools" />
            <div v-else-if="activeTab === 'fps' && showDebugTools" class="debug-tools-fps-panel">
              <FpsCounter />
            </div>
            <WorldControls v-else-if="activeTab === 'season' && showAdminTools" admin-focus />
          </section>
        </div>
      </PanelModalShell>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import FpsCounter from './FpsCounter.vue';
import WorldControls from './WorldControls.vue';
import PanelModalShell from './ui/PanelModalShell.vue';

type DebugToolsTab = 'tools' | 'fps' | 'season';

const props = defineProps<{
  mode: 'debug' | 'admin';
  showDebugTools: boolean;
  showAdminTools: boolean;
}>();

defineEmits<{
  close: [];
}>();

const activeTab = ref<DebugToolsTab>(resolveInitialTab());

function resolveInitialTab(): DebugToolsTab {
  if (props.mode === 'admin' && props.showAdminTools) {
    return 'season';
  }
  if (props.showDebugTools) {
    return 'tools';
  }
  return 'season';
}

function ensureAvailableTab() {
  if (activeTab.value === 'season' && props.showAdminTools) return;
  if ((activeTab.value === 'tools' || activeTab.value === 'fps') && props.showDebugTools) return;
  activeTab.value = resolveInitialTab();
}

watch(() => props.mode, () => {
  activeTab.value = resolveInitialTab();
});

watch(() => [props.showDebugTools, props.showAdminTools], ensureAvailableTab);
</script>

<style scoped>
.debug-tools-backdrop {
  position: fixed;
  inset: 0;
  z-index: 58;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  pointer-events: auto;
  background:
    radial-gradient(circle at 50% 45%, rgba(46, 36, 25, 0.2), transparent 30rem),
    rgba(1, 5, 12, 0.68);
  backdrop-filter: blur(3px) brightness(0.78);
}

.debug-tools-panel {
  box-sizing: border-box;
  width: min(68rem, calc(100vw - 2rem));
  height: min(46rem, calc(100dvh - 2rem));
  display: flex;
  flex-direction: column;
  border-radius: 0;
  --panel-modal-border-width: 20px;
  --panel-header-title-size: clamp(1.8rem, 2.8vw, 2.28rem);
}

.debug-tools-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.72rem;
  min-height: 0;
  flex: 1;
  padding: 0.95rem 1.1rem 1.1rem;
  color: #f3e4c9;
}

.debug-tools-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.42rem;
}

.debug-tools-tab {
  min-height: 2.55rem;
  border: 1px solid rgba(132, 94, 44, 0.34);
  border-radius: 3px;
  background:
    linear-gradient(180deg, rgba(65, 45, 26, 0.42), rgba(15, 17, 18, 0.66)),
    rgba(12, 12, 11, 0.76);
  color: rgba(232, 211, 170, 0.72);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.78rem;
  font-weight: 800;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.78);
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    transform 120ms ease;
}

.debug-tools-tab:hover,
.debug-tools-tab--active {
  border-color: rgba(201, 154, 75, 0.62);
  background:
    linear-gradient(180deg, rgba(82, 57, 30, 0.72), rgba(21, 18, 14, 0.86)),
    rgba(12, 12, 11, 0.88);
  color: #fff1d4;
}

.debug-tools-tab--active {
  transform: translateY(-1px);
}

.debug-tools-content {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 0.25rem;
  scrollbar-color: rgba(201, 154, 75, 0.5) rgba(10, 9, 8, 0.36);
}

.debug-tools-content :deep(.world-controls) {
  width: 100%;
  max-width: none;
  max-height: none;
  height: auto;
  min-height: 0;
  overflow: visible;
  border-color: rgba(55, 37, 20, 0.34);
  border-radius: 0;
  background:
    radial-gradient(circle at top left, rgba(116, 71, 32, 0.18), transparent 18rem),
    rgba(16, 13, 10, 0.9);
  box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.42);
}

.debug-tools-content :deep(.debug-panel-body),
.debug-tools-content :deep(.debug-tab-panel),
.debug-tools-content :deep(.test-mode-section--fill) {
  overflow: visible;
}

.debug-tools-content :deep(.debug-panel-body) {
  display: grid;
  grid-auto-rows: max-content;
  padding-bottom: 1rem;
}

.debug-tools-content :deep(.debug-tab-panel) {
  flex: none;
  min-height: auto;
}

.debug-tools-content :deep(.test-mode-section) {
  flex: none;
  min-height: auto;
}

.debug-tools-content :deep(.test-mode-section-actions) {
  row-gap: 0.45rem;
}

.debug-tools-content :deep(.test-mode-list),
.debug-tools-content :deep(.season-debug-grid),
.debug-tools-content :deep(.season-debug-goals) {
  overflow: visible;
}

.debug-tools-content :deep(.debug-panel-header) {
  background: rgba(18, 15, 12, 0.86);
}

.debug-tools-fps-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(55, 37, 20, 0.34);
  border-radius: 0;
  background:
    radial-gradient(circle at top left, rgba(116, 71, 32, 0.18), transparent 18rem),
    rgba(16, 13, 10, 0.9);
  padding: 0.75rem;
  box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.42);
}

.debug-tools-fps-panel :deep(.fps-counter) {
  left: 0;
  width: 100%;
  max-width: none;
  min-width: 0;
  align-self: stretch;
  border-color: rgba(139, 93, 43, 0.42);
  border-radius: 0;
  background: rgba(6, 8, 8, 0.72);
  color: #fff0d2;
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.42);
}

.debug-tools-panel-enter-active,
.debug-tools-panel-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.debug-tools-panel-enter-from,
.debug-tools-panel-leave-to {
  opacity: 0;
}

.debug-tools-panel-enter-from .debug-tools-panel,
.debug-tools-panel-leave-to .debug-tools-panel {
  transform: translateY(0.4rem) scale(0.985);
}

@media (max-width: 720px) {
  .debug-tools-backdrop {
    padding: 0.5rem;
  }

  .debug-tools-panel {
    width: 100dvw;
    max-width: 100dvw;
    height: 100dvh;
    max-height: 100dvh;
  }

  .debug-tools-shell {
    padding: 0.75rem;
  }

  .debug-tools-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
