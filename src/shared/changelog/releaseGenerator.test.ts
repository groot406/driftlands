import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendChangelogEntry,
  applyChangelogDraftAction,
  buildManualChangelogEntry,
  normalizeChangelogDraftContent,
  serializeClientVersionManifest,
  summarizeReleaseCommitLog,
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

test('normalizeChangelogDraftContent trims release notes and supplies fallbacks', () => {
  assert.deepEqual(normalizeChangelogDraftContent({
    title: '  ',
    bullets: ['  ', '  Faster routes.  '],
  }), {
    title: 'Driftlands update',
    bullets: ['Faster routes.'],
  });
});

test('applyChangelogDraftAction approves, edits, and aborts changelog drafts', () => {
  const draft = {
    title: 'Generated title',
    bullets: ['Generated bullet.'],
  };

  assert.deepEqual(applyChangelogDraftAction(draft, { type: 'approve' }), {
    content: draft,
    approved: true,
    aborted: false,
  });

  assert.deepEqual(applyChangelogDraftAction(draft, {
    type: 'edit',
    title: 'Edited title',
    bullets: ['Edited bullet.', 'Another edited bullet.'],
  }), {
    content: {
      title: 'Edited title',
      bullets: ['Edited bullet.', 'Another edited bullet.'],
    },
    approved: false,
    aborted: false,
  });

  assert.equal(applyChangelogDraftAction(draft, { type: 'abort' }).aborted, true);
});

test('serializeClientVersionManifest writes stable public JSON', () => {
  assert.equal(serializeClientVersionManifest({
    clientReleaseId: 'frontend-100-head',
    releasedAt: 100,
    gitHead: 'head',
  }), `{
  "clientReleaseId": "frontend-100-head",
  "releasedAt": 100,
  "gitHead": "head"
}
`);
});

test('summarizeReleaseCommitLog does not fall back to old commits after a previous changelog', () => {
  assert.equal(
    summarizeReleaseCommitLog('', 'abc123 Old unrelated commit', 'previoushead'),
    '(no commits since previous changelog)',
  );
  assert.equal(
    summarizeReleaseCommitLog('', 'abc123 Initial release', null),
    'abc123 Initial release',
  );
});
