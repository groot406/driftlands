<template>
  <Teleport to="body">
    <Transition name="unlock-modal">
      <div
        v-if="announcement"
        class="unlock-modal-backdrop"
        @click.self="dismissUnlockAnnouncement"
      >
        <PanelModalShell
          class="unlock-modal"
          role="dialog"
          aria-modal="true"
          header-label="Unlocked"
          :header-title="announcement.title"
          header-icon="*"
          header-icon-color="amber"
          header-icon-variant="star"
          close-title="Close unlock details"
          close-aria-label="Close unlock details"
          @close="dismissUnlockAnnouncement"
        >
          <div class="unlock-modal__body">
            <div class="unlock-modal__intro">
              <p class="unlock-modal__subtitle">{{ announcement.subtitle }}</p>
            </div>

            <Transition name="unlock-page" mode="out-in">
              <article
                v-if="currentItem"
                :key="`${currentItem.kind}:${currentItem.key}`"
                class="unlock-modal__item"
              >
                <div v-if="currentPreview" class="unlock-modal__preview" aria-hidden="true">
                  <div class="unlock-modal__preview-tile">
                    <img v-if="currentPreview.baseSrc" :src="currentPreview.baseSrc" alt="" class="unlock-modal__preview-base">
                    <img
                      v-if="currentPreview.terrainOverlaySrc"
                      :src="currentPreview.terrainOverlaySrc"
                      alt=""
                      class="unlock-modal__preview-overlay"
                      :style="currentPreview.terrainOverlayStyle"
                    >
                    <img
                      v-if="currentPreview.buildingOverlaySrc"
                      :src="currentPreview.buildingOverlaySrc"
                      alt=""
                      class="unlock-modal__preview-overlay"
                      :style="currentPreview.buildingOverlayStyle"
                    >
                  </div>
                </div>

                <div class="unlock-modal__item-top">
                  <span class="unlock-modal__kind">{{ currentItem.kind }}</span>
                  <h3>{{ currentItem.label }}</h3>
                </div>
                <p class="unlock-modal__summary">{{ currentItem.summary }}</p>
                <ul class="unlock-modal__details">
                  <li v-for="detail in currentItem.details" :key="detail">{{ detail }}</li>
                </ul>
              </article>
            </Transition>

            <footer class="unlock-modal__footer">
              <span></span>
              <div class="unlock-modal__footer-actions">
                <span v-if="pageTotal > 1" class="unlock-modal__page-chip">{{ pageIndex + 1 }} / {{ pageTotal }}</span>
                <PanelActionButton
                  v-if="pageTotal > 1"
                  type="button"
                  size="medium"
                  variant="secondary"
                  :disabled="pageIndex <= 0"
                  @click="previousPage"
                >
                  Previous
                </PanelActionButton>
                <PanelActionButton type="button" size="medium" @click="goForward">
                  {{ forwardLabel }}
                </PanelActionButton>
              </div>
            </footer>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { studyState, studyVersion } from '../store/clientStudyStore.ts';
import { runSnapshot } from '../store/runStore.ts';
import {
  activeUnlockAnnouncement,
  buildProgressionUnlockAnnouncementItems,
  buildStudyUnlockAnnouncementItems,
  dismissUnlockAnnouncement,
  queueUnlockAnnouncement,
  type UnlockAnnouncementPreview,
  unlockAnnouncementCount,
} from '../store/unlockAnnouncementStore.ts';
import PanelActionButton from './ui/PanelActionButton.vue';
import PanelModalShell from './ui/PanelModalShell.vue';

interface ResolvedUnlockPreview {
  baseSrc: string | null;
  terrainOverlaySrc: string | null;
  buildingOverlaySrc: string | null;
  terrainOverlayStyle: { transform: string };
  buildingOverlayStyle: { transform: string };
}

const tileImageModules = import.meta.glob('../assets/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const tileImageSources = Object.fromEntries(
  Object.entries(tileImageModules).map(([path, url]) => {
    const match = path.match(/([^/]+)\.png$/);
    return [match?.[1] ?? path, url];
  }),
) as Record<string, string>;

const announcement = activeUnlockAnnouncement;
const queueCount = unlockAnnouncementCount;
const pageIndex = ref(0);
const completedStudyKeySignature = computed(() => studyState.completedStudyKeys.join('|'));
const studySnapshotState = computed(() => ({
  completedKeySignature: completedStudyKeySignature.value,
  hasSnapshot: studyState.studies.length > 0,
  version: studyVersion.value,
}));
const pageTotal = computed(() => Math.max(announcement.value?.items.length ?? 0, 0));
const currentItem = computed(() => announcement.value?.items[Math.min(pageIndex.value, Math.max(0, pageTotal.value - 1))] ?? null);
const currentPreview = computed(() => resolvePreview(currentItem.value?.preview ?? null));
const hasNextPage = computed(() => pageIndex.value < pageTotal.value - 1);
const footerLabel = computed(() => {
  if (pageTotal.value > 1) {
    return 'One unlock per page.';
  }

  if (queueCount.value > 1) {
    return `${queueCount.value - 1} more unlock report${queueCount.value === 2 ? '' : 's'} queued.`;
  }

  return 'This option now appears on matching tiles.';
});
const forwardLabel = computed(() => {
  if (hasNextPage.value) {
    return 'Next';
  }

  return queueCount.value > 1 ? 'Next Report' : 'Back to Colony';
});

watch(
  () => runSnapshot.value?.progression ?? null,
  (next, previous) => {
    const items = buildProgressionUnlockAnnouncementItems(previous, next);
    queueUnlockAnnouncement(items, 'Your colony reached a new milestone. Here is exactly what changed.');
  },
);

watch(studySnapshotState, (next, previous) => {
  if (!next.hasSnapshot || !previous?.hasSnapshot) {
    return;
  }

  const previousKeys = previous.completedKeySignature ? previous.completedKeySignature.split('|').filter(Boolean) : [];
  const nextKeys = next.completedKeySignature ? next.completedKeySignature.split('|').filter(Boolean) : [];
  const items = buildStudyUnlockAnnouncementItems(previousKeys, nextKeys);
  queueUnlockAnnouncement(items, 'A completed study unlocked new work for the colony.');
});

watch(
  () => announcement.value?.id ?? null,
  () => {
    pageIndex.value = 0;
  },
);

function getTileImageSource(key: string | null | undefined) {
  if (!key) {
    return null;
  }

  return tileImageSources[key] ?? null;
}

function createOverlayStyle(offset: { x: number; y: number }) {
  return {
    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
  };
}

function resolvePreview(preview: UnlockAnnouncementPreview | null | undefined): ResolvedUnlockPreview | null {
  if (!preview) {
    return null;
  }

  const resolved = {
    baseSrc: getTileImageSource(preview.baseAssetKey),
    terrainOverlaySrc: getTileImageSource(preview.terrainOverlayAssetKey),
    buildingOverlaySrc: getTileImageSource(preview.buildingOverlayAssetKey),
    terrainOverlayStyle: createOverlayStyle(preview.terrainOverlayOffset),
    buildingOverlayStyle: createOverlayStyle(preview.buildingOverlayOffset),
  };

  return resolved.baseSrc || resolved.terrainOverlaySrc || resolved.buildingOverlaySrc
    ? resolved
    : null;
}

function previousPage() {
  pageIndex.value = Math.max(0, pageIndex.value - 1);
}

function goForward() {
  if (hasNextPage.value) {
    pageIndex.value++;
    return;
  }

  dismissUnlockAnnouncement();
}

function handleKeyDown(event: KeyboardEvent) {
  if (!announcement.value) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    dismissUnlockAnnouncement();
    return;
  }

  if (event.key === 'ArrowLeft' && pageTotal.value > 1) {
    event.preventDefault();
    event.stopPropagation();
    previousPage();
    return;
  }

  if ((event.key === 'ArrowRight' || event.key === 'Enter') && pageTotal.value > 1) {
    event.preventDefault();
    event.stopPropagation();
    goForward();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, { capture: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
});
</script>

<style scoped>
.unlock-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 72;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    linear-gradient(180deg, rgba(8, 10, 13, 0.5), rgba(8, 10, 13, 0.74)),
    rgba(0, 0, 0, 0.46);
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.unlock-modal {
  display: flex;
  flex-direction: column;
  width: min(44rem, calc(100vw - 1.25rem));
  max-height: min(44rem, calc(100dvh - 1.25rem));
  --panel-modal-border-width: 18px;
  --panel-modal-border-image-width: 32px;
  --panel-header-height: 5.15rem;
}

.unlock-modal__body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 0.85rem;
  overflow: hidden;
  padding: 1rem 1.1rem calc(1.35rem + env(safe-area-inset-bottom, 0px));
}

.unlock-modal__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
}

.unlock-modal__subtitle {
  min-width: 0;
  margin: 0;
  color: rgba(243, 228, 201, 0.82);
  font-size: 0.92rem;
  line-height: 1.45;
}

.unlock-modal__page-chip {
  flex-shrink: 0;
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 4px;
  background: rgba(69, 44, 12, 0.58);
  color: #fde68a;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  padding: 0.38rem 0.5rem;
}

.unlock-modal__item {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scroll-padding-bottom: 1rem;
  border: 1px solid rgba(190, 136, 65, 0.32);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(35, 42, 43, 0.86), rgba(15, 18, 18, 0.88)),
    rgba(15, 18, 18, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 239, 196, 0.08);
  padding: 0.85rem 0.95rem calc(1.15rem + env(safe-area-inset-bottom, 0px));
}

.unlock-modal__preview {
  display: flex;
  justify-content: center;
  margin: 0.05rem 0 0.8rem;
}

.unlock-modal__preview-tile {
  position: relative;
  width: 9.5rem;
  height: 7.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 35%, rgba(125, 211, 252, 0.16), transparent 62%),
    linear-gradient(180deg, rgba(8, 47, 73, 0.28), rgba(12, 15, 16, 0.42));
  overflow: hidden;
}

.unlock-modal__preview-base,
.unlock-modal__preview-overlay {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(7.75rem, 86%);
  height: auto;
  image-rendering: pixelated;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 10px 10px rgba(0, 0, 0, 0.25));
}

.unlock-modal__preview-overlay {
  pointer-events: none;
}

.unlock-modal__item-top {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.unlock-modal__kind {
  flex-shrink: 0;
  border: 1px solid rgba(125, 211, 252, 0.32);
  border-radius: 4px;
  background: rgba(8, 47, 73, 0.52);
  color: #bae6fd;
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;
  padding: 0.28rem 0.42rem;
  text-transform: uppercase;
}

.unlock-modal__item h3 {
  min-width: 0;
  margin: 0;
  color: #fff3d2;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.unlock-modal__summary {
  margin: 0.48rem 0 0;
  color: rgba(244, 231, 208, 0.82);
  font-size: 0.85rem;
  line-height: 1.45;
}

.unlock-modal__details {
  display: grid;
  gap: 0.38rem;
  margin: 0.7rem 0 0;
  padding: 0;
  list-style: none;
}

.unlock-modal__details li {
  position: relative;
  padding-left: 1rem;
  color: rgba(215, 226, 222, 0.86);
  font-size: 0.78rem;
  line-height: 1.42;
}

.unlock-modal__details li::before {
  content: '';
  position: absolute;
  top: 0.52em;
  left: 0;
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.32);
}

.unlock-modal__footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(190, 136, 65, 0.28);
  padding-top: 0.85rem;
  color: rgba(236, 220, 189, 0.72);
  font-size: 0.78rem;
}

.unlock-modal__footer-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-shrink: 0;
}

.unlock-modal-enter-active,
.unlock-modal-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.unlock-modal-enter-from,
.unlock-modal-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}

.unlock-page-enter-active,
.unlock-page-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.unlock-page-enter-from {
  opacity: 0;
  transform: translateX(0.35rem);
}

.unlock-page-leave-to {
  opacity: 0;
  transform: translateX(-0.35rem);
}

@media (max-width: 640px) {
  .unlock-modal-backdrop {
    align-items: flex-end;
    padding: 0.5rem;
  }

  .unlock-modal {
    width: 100%;
    max-height: calc(100dvh - 1rem);
    --panel-modal-border-width: 14px;
    --panel-modal-border-image-width: 26px;
  }

  .unlock-modal__body {
    padding: 0.78rem 0.78rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
  }

  .unlock-modal__preview-tile {
    width: 8.3rem;
    height: 6.35rem;
  }

  .unlock-modal__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .unlock-modal__footer-actions {
    width: 100%;
  }

  .unlock-modal__footer-actions :deep(.panel-action-button) {
    flex: 1;
  }
}
</style>
