import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acknowledgeChangelogEntries,
  changelogModalOpen,
  getPendingChangelogEntries,
  replaceChangelogSnapshot,
  resetChangelogStore,
  setClientChangelogEntriesForTest,
} from './changelogStore.ts';

test.afterEach(() => {
  resetChangelogStore();
});

test('store merges client and server changelogs and opens for unseen entries', () => {
  setClientChangelogEntriesForTest([
    {
      id: 'frontend-200',
      releasedAt: 200,
      target: 'frontend',
      title: 'Client polish',
      bullets: ['The map is easier to read.'],
    },
  ]);

  replaceChangelogSnapshot({
    entries: [
      {
        id: 'backend-100',
        releasedAt: 100,
        target: 'backend',
        title: 'Server polish',
        bullets: ['Settlers keep better records.'],
      },
    ],
    lastSeenChangelogAt: 50,
  });

  assert.equal(changelogModalOpen.value, true);
  assert.deepEqual(getPendingChangelogEntries.value.map((entry) => entry.id), ['backend-100', 'frontend-200']);
});

test('acknowledgeChangelogEntries closes the modal and advances the local checkpoint', () => {
  replaceChangelogSnapshot({
    entries: [
      {
        id: 'backend-100',
        releasedAt: 100,
        target: 'backend',
        title: 'Server polish',
        bullets: ['Settlers keep better records.'],
      },
    ],
    lastSeenChangelogAt: null,
  });

  const seenAt = acknowledgeChangelogEntries();

  assert.equal(seenAt, 100);
  assert.equal(changelogModalOpen.value, false);
  assert.deepEqual(getPendingChangelogEntries.value, []);
});
