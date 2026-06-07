import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeDocumentationPage,
  closeDocumentation,
  documentationFilteredPages,
  documentationRelatedPages,
  documentationSearchQuery,
  selectedDocumentationCategoryId,
  selectedDocumentationPageId,
  openDocumentation,
  setDocumentationCategory,
  setDocumentationPage,
  setDocumentationQuery,
} from './documentationStore.ts';
import { getWikiPageById, getWikiPages, searchWikiPages } from '../shared/documentation/wikiIndex.ts';

test.afterEach(() => {
  setDocumentationQuery('');
  setDocumentationCategory('all');
  setDocumentationPage('getting-started');
  closeDocumentation();
});

test('openDocumentation falls back to the default page for invalid page ids', () => {
  openDocumentation('missing-page');

  assert.equal(selectedDocumentationPageId.value, 'getting-started');
  assert.equal(activeDocumentationPage.value?.id, 'getting-started');
});

test('query filters pages by wiki search text', () => {
  setDocumentationQuery('harbor');

  assert.ok(documentationFilteredPages.value.length > 0);
  assert.ok(documentationFilteredPages.value.length < getWikiPages().length);
  assert.ok(documentationFilteredPages.value.some((page) => page.id === 'harbors-and-ship-orders'));
  assert.deepEqual(
    documentationFilteredPages.value.map((page) => page.id),
    searchWikiPages('harbor').map((page) => page.id),
  );
});

test('category filters pages independently of query', () => {
  setDocumentationCategory('logistics');

  assert.equal(selectedDocumentationCategoryId.value, 'logistics');
  assert.ok(documentationFilteredPages.value.length > 0);
  assert.ok(documentationFilteredPages.value.every((page) => page.category === 'logistics'));
});

test('active page exposes related pages from the documentation index', () => {
  const page = getWikiPageById('getting-started');
  assert.ok(page);

  setDocumentationPage('getting-started');

  assert.ok(documentationRelatedPages.value.length > 0);
  assert.deepEqual(
    documentationRelatedPages.value.map((relatedPage) => relatedPage.id),
    ['heroes-and-orders', 'starter-strategies', 'settlement-support'],
  );
});
