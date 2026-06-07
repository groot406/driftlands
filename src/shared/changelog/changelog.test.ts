import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLatestChangelogTimestamp,
  getUnseenChangelogEntries,
  mergeChangelogEntries,
  type ReleaseChangelogEntry,
} from './changelog.ts';

const entries: ReleaseChangelogEntry[] = [
  {
    id: 'backend-100',
    releasedAt: 100,
    target: 'backend',
    title: 'Server polish',
    bullets: ['Settlers remember their work more reliably.'],
  },
  {
    id: 'frontend-200',
    releasedAt: 200,
    target: 'frontend',
    title: 'Clearer controls',
    bullets: ['The toolbar is easier to scan.'],
  },
  {
    id: 'both-300',
    releasedAt: 300,
    target: 'both',
    title: 'New season tools',
    bullets: ['Season progress is easier to follow.'],
  },
];

test('getUnseenChangelogEntries returns accumulated entries newer than the acknowledged timestamp', () => {
  assert.deepEqual(
    getUnseenChangelogEntries(entries, 100).map((entry) => entry.id),
    ['frontend-200', 'both-300'],
  );
});

test('getUnseenChangelogEntries treats null as no changelog seen yet', () => {
  assert.deepEqual(
    getUnseenChangelogEntries(entries, null).map((entry) => entry.id),
    ['backend-100', 'frontend-200', 'both-300'],
  );
});

test('mergeChangelogEntries dedupes by id and keeps chronological order', () => {
  const merged = mergeChangelogEntries([
    entries[1]!,
    entries[2]!,
  ], [
    entries[0]!,
    { ...entries[1]!, title: 'Duplicate from server' },
  ]);

  assert.deepEqual(merged.map((entry) => entry.id), ['backend-100', 'frontend-200', 'both-300']);
  assert.equal(merged.find((entry) => entry.id === 'frontend-200')?.title, 'Clearer controls');
});

test('getLatestChangelogTimestamp returns the highest releasedAt value', () => {
  assert.equal(getLatestChangelogTimestamp(entries), 300);
  assert.equal(getLatestChangelogTimestamp([]), null);
});
