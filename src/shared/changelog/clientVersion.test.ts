import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReleaseChangelogEntry } from './changelog.ts';
import {
  buildClientVersionManifest,
  getLatestClientReleaseEntry,
  isDifferentClientVersion,
} from './clientVersion.ts';

const entries: ReleaseChangelogEntry[] = [
  {
    id: 'frontend-100-old',
    releasedAt: 100,
    target: 'frontend',
    title: 'Old interface',
    bullets: ['Old.'],
    gitHead: 'old',
  },
  {
    id: 'backend-300-server',
    releasedAt: 300,
    target: 'backend',
    title: 'Server only',
    bullets: ['Server.'],
    gitHead: 'server',
  },
  {
    id: 'both-200-game',
    releasedAt: 200,
    target: 'both',
    title: 'Game update',
    bullets: ['Game.'],
    gitHead: 'game',
  },
];

test('getLatestClientReleaseEntry ignores backend-only entries', () => {
  assert.equal(getLatestClientReleaseEntry(entries)?.id, 'both-200-game');
});

test('buildClientVersionManifest uses the latest frontend or both changelog entry', () => {
  assert.deepEqual(buildClientVersionManifest(entries), {
    clientReleaseId: 'both-200-game',
    releasedAt: 200,
    gitHead: 'game',
  });
});

test('isDifferentClientVersion detects remote client release changes', () => {
  const current = buildClientVersionManifest(entries);

  assert.equal(isDifferentClientVersion(current, current), false);
  assert.equal(isDifferentClientVersion(current, {
    clientReleaseId: 'frontend-400-new',
    releasedAt: 400,
    gitHead: 'new',
  }), true);
  assert.equal(isDifferentClientVersion(current, null), false);
});
