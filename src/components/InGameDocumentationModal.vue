<template>
  <Teleport to="body">
    <Transition name="smooth-modal" appear>
      <div
        v-if="isOpen && activePage"
        ref="backdropEl"
        class="documentation-modal-backdrop smooth-modal-backdrop"
        @click.self="close"
      >
        <PanelModalShell
          class="documentation-modal-panel"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          :aria-labelledby="articleTitleId"
          close-aria-label="Close field guide"
          header-label="Field Guide"
          :header-title="activePage.title"
          header-icon="?"
          header-icon-variant="star"
          header-icon-color="gold"
          @close="close"
        >
          <div class="documentation-modal-layout">
            <aside class="documentation-nav" aria-label="Field guide navigation">
              <label class="documentation-search">
                <span>Search</span>
                <input
                  :value="documentationSearchQuery"
                  ref="searchInputEl"
                  type="search"
                  autocomplete="off"
                  placeholder="Find a topic"
                  @input="setDocumentationQuery(($event.target as HTMLInputElement).value)"
                />
              </label>

              <div class="documentation-categories" aria-label="Categories">
                <button
                  class="documentation-category"
                  :class="{ 'documentation-category--active': selectedDocumentationCategoryId === 'all' }"
                  type="button"
                  :aria-pressed="selectedDocumentationCategoryId === 'all'"
                  @click="setDocumentationCategory('all')"
                >
                  All
                </button>
                <button
                  v-for="category in wikiCategories"
                  :key="category.id"
                  class="documentation-category"
                  :class="{ 'documentation-category--active': selectedDocumentationCategoryId === category.id }"
                  type="button"
                  :aria-pressed="selectedDocumentationCategoryId === category.id"
                  @click="setDocumentationCategory(category.id)"
                >
                  {{ category.label }}
                </button>
              </div>

              <div class="documentation-page-list" aria-label="Pages">
                <button
                  v-for="page in documentationFilteredPages"
                  :key="page.id"
                  class="documentation-page-button"
                  :class="{ 'documentation-page-button--active': page.id === activePage.id }"
                  type="button"
                  :aria-current="page.id === activePage.id ? 'page' : undefined"
                  @click="setDocumentationPage(page.id)"
                >
                  <span class="documentation-page-category">{{ categoryLabel(page.category) }}</span>
                  <span class="documentation-page-title">{{ page.title }}</span>
                  <span class="documentation-page-summary">{{ page.summary }}</span>
                </button>
                <p v-if="documentationFilteredPages.length === 0" class="documentation-empty">
                  No guide pages match that filter.
                </p>
              </div>
            </aside>

            <main class="documentation-article-scroll" tabindex="0">
              <article class="documentation-article">
                <header class="documentation-article-header">
                  <p class="documentation-article-category">{{ categoryLabel(activePage.category) }}</p>
                  <h2 :id="articleTitleId">{{ activePage.title }}</h2>
                  <p>{{ activePage.summary }}</p>
                </header>

                <section
                  v-for="(block, index) in activePage.blocks"
                  :key="`${activePage.id}:${index}`"
                  class="documentation-block"
                  :class="`documentation-block--${block.type}`"
                >
                  <p v-if="block.type === 'paragraph'" class="documentation-paragraph">
                    {{ block.text }}
                  </p>

                  <div
                    v-else-if="block.type === 'callout'"
                    class="documentation-callout"
                    :class="`documentation-callout--${block.tone ?? 'info'}`"
                  >
                    <h3>{{ block.title }}</h3>
                    <p>{{ block.text }}</p>
                  </div>

                  <div v-else-if="block.type === 'table'" class="documentation-table-wrap">
                    <table class="documentation-table">
                      <thead>
                        <tr>
                          <th v-for="column in block.columns" :key="column" scope="col">{{ column }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                          <td v-for="(cell, cellIndex) in row" :key="`${rowIndex}:${cellIndex}`">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div v-else-if="block.type === 'statGrid'" class="documentation-stat-grid">
                    <div v-for="stat in block.stats" :key="`${stat.label}:${stat.value}`" class="documentation-stat">
                      <span>{{ stat.label }}</span>
                      <strong>{{ stat.value }}</strong>
                      <small v-if="stat.note">{{ stat.note }}</small>
                    </div>
                  </div>

                  <ol v-else-if="block.type === 'flow'" class="documentation-flow">
                    <li v-for="(step, stepIndex) in block.steps" :key="`${stepIndex}:${step}`">
                      <span>{{ stepIndex + 1 }}</span>
                      <p>{{ step }}</p>
                    </li>
                  </ol>

                  <div v-else-if="block.type === 'barChart'" class="documentation-chart">
                    <h3>{{ block.title }}</h3>
                    <div v-for="bar in block.bars" :key="bar.label" class="documentation-bar">
                      <div class="documentation-bar-head">
                        <span>{{ bar.label }}</span>
                        <small v-if="bar.note">{{ bar.note }}</small>
                      </div>
                      <div class="documentation-bar-track" aria-hidden="true">
                        <span :style="{ width: `${barWidth(bar.value, bar.max)}%` }" />
                      </div>
                    </div>
                  </div>

                  <div v-else-if="block.type === 'imageGrid'" class="documentation-image-grid">
                    <figure v-for="image in block.images" :key="`${image.label}:${image.src}`" class="documentation-image-tile">
                      <img
                        v-if="resolveTileAsset(image.src)"
                        :src="resolveTileAsset(image.src) ?? ''"
                        :alt="image.label"
                      />
                      <div v-else class="documentation-image-placeholder" aria-hidden="true">
                        {{ image.label }}
                      </div>
                      <figcaption>
                        <strong>{{ image.label }}</strong>
                        <small v-if="image.note">{{ image.note }}</small>
                      </figcaption>
                    </figure>
                  </div>
                </section>
              </article>
            </main>

            <aside class="documentation-reference" aria-label="Related guide pages">
              <section class="documentation-reference-section">
                <h3>Related</h3>
                <button
                  v-for="page in documentationRelatedPages"
                  :key="page.id"
                  class="documentation-related-button"
                  type="button"
                  @click="setDocumentationPage(page.id)"
                >
                  <span>{{ page.title }}</span>
                  <small>{{ categoryLabel(page.category) }}</small>
                </button>
                <p v-if="documentationRelatedPages.length === 0" class="documentation-empty">
                  No related pages yet.
                </p>
              </section>

              <section class="documentation-reference-section documentation-reference-section--summary">
                <h3>Reference</h3>
                <p>{{ activePage.keywords.join(', ') }}</p>
              </section>
            </aside>
          </div>
        </PanelModalShell>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';

import { isWindowActive, isWindowOpen, WINDOW_IDS } from '../core/windowManager.ts';
import { WIKI_CATEGORIES } from '../shared/documentation/wikiIndex.ts';
import type { WikiCategoryId } from '../shared/documentation/wikiTypes.ts';
import {
  activeDocumentationPage,
  closeDocumentation,
  documentationFilteredPages,
  documentationRelatedPages,
  documentationSearchQuery,
  selectedDocumentationCategoryId,
  setDocumentationCategory,
  setDocumentationPage,
  setDocumentationQuery,
} from '../store/documentationStore.ts';
import PanelModalShell from './ui/PanelModalShell.vue';

const tileAssetModules = import.meta.glob('../assets/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const tileAssetUrls = new Map(
  Object.entries(tileAssetModules).map(([path, url]) => [
    path.split('/').pop()?.replace(/\.png$/, '') ?? path,
    url,
  ]),
);

const wikiCategories = WIKI_CATEGORIES;
const articleTitleId = 'documentation-modal-title';
const isOpen = computed(() => isWindowOpen(WINDOW_IDS.DOCUMENTATION_MODAL));
const activePage = computed(() => activeDocumentationPage.value);
const categoryLabels = new Map<WikiCategoryId, string>(wikiCategories.map((category) => [category.id, category.label]));
const backdropEl = ref<HTMLElement | null>(null);
const searchInputEl = ref<HTMLInputElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;
let focusWasManaged = false;
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function categoryLabel(categoryId: WikiCategoryId) {
  return categoryLabels.get(categoryId) ?? categoryId;
}

function barWidth(value: number, max: number | undefined) {
  const denominator = max && max > 0 ? max : Math.max(1, value);
  return Math.max(0, Math.min(100, (value / denominator) * 100));
}

function resolveTileAsset(src: string) {
  if (/^(https?:|data:|\/)/.test(src)) {
    return src;
  }

  const plainKey = src.replace(/\.png$/, '');
  if (!plainKey.includes('/')) {
    return tileAssetUrls.get(plainKey) ?? null;
  }

  return null;
}

function close() {
  closeDocumentation();
}

function getDialogElement() {
  return backdropEl.value?.querySelector<HTMLElement>('.documentation-modal-panel') ?? null;
}

function getFocusableElements() {
  const dialog = getDialogElement();
  if (!dialog) {
    return [];
  }

  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => (
      !element.hasAttribute('disabled')
      && element.tabIndex >= 0
      && element.getClientRects().length > 0
    ));
}

function focusInitialElement() {
  const target = searchInputEl.value ?? getFocusableElements()[0] ?? getDialogElement();
  target?.focus({ preventScroll: true });
}

function restorePreviousFocus() {
  if (!focusWasManaged) {
    return;
  }

  const target = previouslyFocusedElement;
  previouslyFocusedElement = null;
  focusWasManaged = false;

  if (target && typeof document !== 'undefined' && document.contains(target)) {
    target.focus({ preventScroll: true });
  }
}

function handleTab(event: KeyboardEvent) {
  if (!isWindowActive(WINDOW_IDS.DOCUMENTATION_MODAL)) {
    return;
  }

  const dialog = getDialogElement();
  if (!dialog) {
    return;
  }

  const focusableElements = getFocusableElements();
  if (focusableElements.length === 0) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement as HTMLElement | null;

  if (!activeElement || !dialog.contains(activeElement)) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
    return;
  }

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus({ preventScroll: true });
  } else if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    handleTab(event);
    return;
  }

  if (event.key === 'Escape' && isWindowActive(WINDOW_IDS.DOCUMENTATION_MODAL)) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

let listenerActive = false;

watch(isOpen, (nextOpen) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (nextOpen && !listenerActive) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusWasManaged = true;
    window.addEventListener('keydown', handleKeydown);
    listenerActive = true;
    void nextTick(focusInitialElement);
  } else if (!nextOpen && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
    listenerActive = false;
    restorePreviousFocus();
  }
}, { immediate: true });

onUnmounted(() => {
  if (typeof window !== 'undefined' && listenerActive) {
    window.removeEventListener('keydown', handleKeydown);
  }

  restorePreviousFocus();
});
</script>

<style scoped>
.documentation-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 72;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background:
    radial-gradient(circle at 50% 20%, rgba(127, 86, 45, 0.22), transparent 34rem),
    rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(10px);
}

.documentation-modal-panel {
  --panel-modal-border-width: 22px;
  --panel-modal-background:
    repeating-linear-gradient(90deg, rgba(255, 244, 214, 0.018) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #17120c 0%, #0d0f0e 100%);
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100vw - 24px));
  height: min(820px, calc(100dvh - 24px));
  color: #f3e4c9;
}

.documentation-modal-layout {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(190px, 230px);
  gap: 14px;
  flex: 1;
  min-height: 0;
  padding: 14px;
}

.documentation-nav,
.documentation-reference,
.documentation-article-scroll {
  min-height: 0;
  border: 1px solid rgba(160, 113, 57, 0.32);
  background:
    radial-gradient(circle at top, rgba(117, 73, 33, 0.14), transparent 16rem),
    rgba(9, 11, 10, 0.72);
  box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.36);
}

.documentation-nav,
.documentation-reference {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  padding: 12px;
}

.documentation-search {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.documentation-search span,
.documentation-reference h3,
.documentation-page-category,
.documentation-article-category {
  font-family: 'Press Start 2P', 'VT323', 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #f4c66b;
}

.documentation-search input {
  width: 100%;
  min-height: 36px;
  border: 1px solid rgba(201, 153, 84, 0.28);
  border-radius: 8px;
  background: rgba(7, 10, 10, 0.84);
  padding: 0 10px;
  color: #fff7df;
  font-size: 13px;
  outline: none;
}

.documentation-search input:focus {
  border-color: rgba(247, 202, 113, 0.72);
  box-shadow: 0 0 0 2px rgba(247, 202, 113, 0.12);
}

.documentation-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.documentation-category,
.documentation-page-button,
.documentation-related-button {
  border: 1px solid rgba(160, 113, 57, 0.26);
  background: rgba(23, 24, 18, 0.72);
  color: #ead6ad;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.documentation-category {
  min-width: 0;
  min-height: 30px;
  max-width: 100%;
  border-radius: 8px;
  padding: 0 9px;
  font-size: 11px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.documentation-category:hover,
.documentation-category:focus-visible,
.documentation-category--active,
.documentation-page-button:hover,
.documentation-page-button:focus-visible,
.documentation-page-button--active,
.documentation-related-button:hover,
.documentation-related-button:focus-visible {
  border-color: rgba(247, 202, 113, 0.62);
  background: rgba(64, 45, 23, 0.68);
  color: #fff4d4;
  outline: none;
}

.documentation-page-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.documentation-page-button {
  display: grid;
  gap: 4px;
  width: 100%;
  min-height: 74px;
  border-radius: 8px;
  padding: 10px;
  text-align: left;
}

.documentation-page-title,
.documentation-related-button span {
  min-width: 0;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.documentation-page-summary,
.documentation-related-button small,
.documentation-empty,
.documentation-reference-section p {
  font-size: 11px;
  line-height: 1.45;
  color: rgba(230, 213, 174, 0.72);
}

.documentation-page-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.documentation-article-scroll {
  overflow-y: auto;
  padding: 18px;
}

.documentation-article {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  margin: 0 auto;
}

.documentation-article-header {
  display: grid;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(160, 113, 57, 0.32);
}

.documentation-article-header h2 {
  margin: 0;
  font-size: clamp(1.5rem, 2.6vw, 2.3rem);
  line-height: 1.08;
  color: #fff1c8;
  letter-spacing: 0;
}

.documentation-article-header p:last-child,
.documentation-paragraph {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: #eadbbf;
}

.documentation-block {
  min-width: 0;
}

.documentation-callout,
.documentation-chart,
.documentation-table-wrap,
.documentation-stat-grid,
.documentation-flow,
.documentation-image-grid {
  border: 1px solid rgba(160, 113, 57, 0.28);
  background: rgba(14, 15, 13, 0.62);
}

.documentation-callout {
  padding: 14px;
  border-left-width: 4px;
}

.documentation-callout--warning {
  border-left-color: #d78342;
}

.documentation-callout--success {
  border-left-color: #70ad6c;
}

.documentation-callout--info {
  border-left-color: #caa461;
}

.documentation-callout h3,
.documentation-chart h3 {
  margin: 0 0 7px;
  font-size: 15px;
  color: #fff1c8;
}

.documentation-callout p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #e8d4ac;
}

.documentation-table-wrap {
  overflow-x: auto;
}

.documentation-table {
  width: 100%;
  min-width: 420px;
  border-collapse: collapse;
}

.documentation-table th,
.documentation-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(160, 113, 57, 0.22);
  text-align: left;
  vertical-align: top;
  font-size: 13px;
  line-height: 1.45;
}

.documentation-table th {
  color: #f4c66b;
  background: rgba(64, 45, 23, 0.46);
}

.documentation-table td {
  color: #eadbbf;
}

.documentation-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
}

.documentation-stat {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  background: rgba(9, 11, 10, 0.45);
}

.documentation-stat span,
.documentation-stat small {
  font-size: 11px;
  line-height: 1.35;
  color: rgba(230, 213, 174, 0.72);
}

.documentation-stat strong {
  min-width: 0;
  font-size: 18px;
  line-height: 1.15;
  color: #fff1c8;
  overflow-wrap: anywhere;
}

.documentation-flow {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.documentation-flow li {
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  background: rgba(9, 11, 10, 0.45);
}

.documentation-flow span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: rgba(124, 84, 38, 0.7);
  color: #fff1c8;
  font-size: 12px;
  font-weight: 900;
}

.documentation-flow p {
  margin: 0;
  font-size: 13px;
  color: #eadbbf;
}

.documentation-chart {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.documentation-bar {
  display: grid;
  gap: 6px;
}

.documentation-bar-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #eadbbf;
  font-size: 13px;
  line-height: 1.35;
}

.documentation-bar-head small {
  color: rgba(230, 213, 174, 0.68);
  text-align: right;
}

.documentation-bar-track {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(4, 6, 7, 0.82);
}

.documentation-bar-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #b07a3e, #f4c66b);
}

.documentation-image-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
}

.documentation-image-tile {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 10px;
  background: rgba(9, 11, 10, 0.45);
}

.documentation-image-tile img,
.documentation-image-placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  background: rgba(4, 6, 7, 0.72);
}

.documentation-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px dashed rgba(201, 153, 84, 0.34);
  text-align: center;
  font-size: 11px;
  color: rgba(230, 213, 174, 0.72);
  overflow-wrap: anywhere;
}

.documentation-image-tile figcaption {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.documentation-image-tile strong {
  font-size: 12px;
  line-height: 1.3;
  color: #fff1c8;
  overflow-wrap: anywhere;
}

.documentation-image-tile small {
  font-size: 11px;
  line-height: 1.35;
  color: rgba(230, 213, 174, 0.72);
}

.documentation-reference-section {
  display: grid;
  gap: 8px;
}

.documentation-reference h3 {
  margin: 0;
}

.documentation-related-button {
  display: grid;
  gap: 4px;
  width: 100%;
  min-height: 52px;
  border-radius: 8px;
  padding: 9px;
  text-align: left;
}

.documentation-reference-section--summary {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(160, 113, 57, 0.28);
}

.documentation-reference-section p,
.documentation-empty {
  margin: 0;
  overflow-wrap: anywhere;
}

.documentation-page-list::-webkit-scrollbar,
.documentation-article-scroll::-webkit-scrollbar {
  width: 8px;
}

.documentation-page-list::-webkit-scrollbar-thumb,
.documentation-article-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(201, 153, 84, 0.28);
}

@media (max-width: 940px) {
  .documentation-modal-backdrop {
    align-items: stretch;
    padding: 10px;
  }

  .documentation-modal-panel {
    width: 100%;
    height: calc(100dvh - 20px);
  }

  .documentation-modal-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 10px;
    padding: 10px;
  }

  .documentation-nav,
  .documentation-reference {
    max-height: 28dvh;
  }

  .documentation-page-list {
    max-height: 13rem;
  }

  .documentation-reference {
    overflow-y: auto;
  }

  .documentation-reference-section--summary {
    margin-top: 0;
  }
}

@media (max-width: 640px) {
  .documentation-modal-panel {
    --panel-modal-border-width: 14px;
  }

  .documentation-stat-grid,
  .documentation-image-grid {
    grid-template-columns: 1fr;
  }

  .documentation-article-scroll {
    padding: 13px;
  }

  .documentation-article-header h2 {
    font-size: 1.42rem;
  }

  .documentation-bar-head {
    display: grid;
  }

  .documentation-bar-head small {
    text-align: left;
  }
}
</style>
