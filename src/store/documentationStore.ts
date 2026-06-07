import { computed, ref, watch } from 'vue';

import { closeWindow, openWindow, WINDOW_IDS } from '../core/windowManager.ts';
import {
  getRelatedWikiPages,
  getWikiPageById,
  getWikiPages,
  searchWikiPages,
  WIKI_CATEGORIES,
} from '../shared/documentation/wikiIndex.ts';
import type { WikiCategoryId } from '../shared/documentation/wikiTypes.ts';

type DocumentationCategoryFilter = WikiCategoryId | 'all';

const DOCUMENTATION_STORAGE_KEY = 'driftlands-documentation-state-v1';
const DEFAULT_PAGE_ID = 'getting-started';
const VALID_CATEGORY_IDS = new Set<WikiCategoryId>(WIKI_CATEGORIES.map((category) => category.id));

function getDefaultPageId() {
  return getWikiPageById(DEFAULT_PAGE_ID)?.id ?? getWikiPages()[0]?.id ?? '';
}

function resolvePageId(pageId: string | null | undefined) {
  if (pageId && getWikiPageById(pageId)) {
    return pageId;
  }

  return getDefaultPageId();
}

function isDocumentationCategoryFilter(value: unknown): value is DocumentationCategoryFilter {
  return value === 'all' || (typeof value === 'string' && VALID_CATEGORY_IDS.has(value as WikiCategoryId));
}

function readStoredDocumentationState() {
  if (typeof window === 'undefined') {
    return { pageId: getDefaultPageId(), categoryId: 'all' as DocumentationCategoryFilter };
  }

  try {
    const raw = window.localStorage.getItem(DOCUMENTATION_STORAGE_KEY);
    if (!raw) {
      return { pageId: getDefaultPageId(), categoryId: 'all' as DocumentationCategoryFilter };
    }

    const parsed = JSON.parse(raw) as { pageId?: unknown; categoryId?: unknown };
    return {
      pageId: resolvePageId(typeof parsed.pageId === 'string' ? parsed.pageId : undefined),
      categoryId: isDocumentationCategoryFilter(parsed.categoryId) ? parsed.categoryId : 'all',
    };
  } catch {
    return { pageId: getDefaultPageId(), categoryId: 'all' as DocumentationCategoryFilter };
  }
}

function persistDocumentationState() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(DOCUMENTATION_STORAGE_KEY, JSON.stringify({
      pageId: selectedDocumentationPageId.value,
      categoryId: selectedDocumentationCategoryId.value,
    }));
  } catch {
  }
}

const storedState = readStoredDocumentationState();

export const selectedDocumentationPageId = ref(storedState.pageId);
export const documentationSearchQuery = ref('');
export const selectedDocumentationCategoryId = ref<DocumentationCategoryFilter>(storedState.categoryId);

export const documentationFilteredPages = computed(() => {
  const pages = searchWikiPages(documentationSearchQuery.value);
  const categoryId = selectedDocumentationCategoryId.value;

  if (categoryId === 'all') {
    return pages;
  }

  return pages.filter((page) => page.category === categoryId);
});

export const activeDocumentationPage = computed(() => (
  getWikiPageById(selectedDocumentationPageId.value) ?? getWikiPageById(getDefaultPageId())
));

export const documentationRelatedPages = computed(() => {
  const page = activeDocumentationPage.value;
  return page ? getRelatedWikiPages(page) : [];
});

export function openDocumentation(pageId?: string) {
  selectedDocumentationPageId.value = resolvePageId(pageId ?? selectedDocumentationPageId.value);
  openWindow(WINDOW_IDS.DOCUMENTATION_MODAL);
}

export function closeDocumentation() {
  closeWindow(WINDOW_IDS.DOCUMENTATION_MODAL);
}

export function setDocumentationPage(pageId: string) {
  selectedDocumentationPageId.value = resolvePageId(pageId);
}

export function setDocumentationQuery(query: string) {
  documentationSearchQuery.value = query;
}

export function setDocumentationCategory(categoryId: DocumentationCategoryFilter) {
  selectedDocumentationCategoryId.value = isDocumentationCategoryFilter(categoryId) ? categoryId : 'all';
}

watch([selectedDocumentationPageId, selectedDocumentationCategoryId], persistDocumentationState);
