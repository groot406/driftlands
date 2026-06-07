import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendChangelogEntry,
  buildManualChangelogEntry,
  type ExistingChangelogModule,
} from './releaseGenerator.ts';

test('buildManualChangelogEntry creates a release entry with target, git head, timestamp, title, and bullets', () => {
  const entry = buildManualChangelogEntry({
    target: 'backend',
    releasedAt: 123456,
    gitHead: 'abc1234',
    title: 'Better colony memory',
    bullets: ['Returning players see what changed.', 'Server releases include notes.'],
  });

  assert.equal(entry.id, 'backend-123456-abc1234');
  assert.equal(entry.target, 'backend');
  assert.equal(entry.releasedAt, 123456);
  assert.equal(entry.gitHead, 'abc1234');
  assert.equal(entry.title, 'Better colony memory');
  assert.deepEqual(entry.bullets, ['Returning players see what changed.', 'Server releases include notes.']);
});

test('appendChangelogEntry appends newest entry without replacing existing entries', () => {
  const existing: ExistingChangelogModule = {
    entries: [
      {
        id: 'frontend-100-oldhead',
        releasedAt: 100,
        target: 'frontend',
        title: 'Old client notes',
        bullets: ['Older changes.'],
        gitHead: 'oldhead',
      },
    ],
  };
  const next = appendChangelogEntry(existing, {
    id: 'backend-200-newhead',
    releasedAt: 200,
    target: 'backend',
    title: 'New server notes',
    bullets: ['New changes.'],
    gitHead: 'newhead',
  });

  assert.deepEqual(next.entries.map((entry) => entry.id), ['frontend-100-oldhead', 'backend-200-newhead']);
});
