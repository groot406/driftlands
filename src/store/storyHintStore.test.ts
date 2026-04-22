import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearScoutStoryHintsForTile,
  clearStoryTileHints,
  getActiveStoryTileHints,
  setStoryTileHint,
} from './storyHintStore.ts';

test.afterEach(() => {
  clearStoryTileHints();
});

test('clearScoutStoryHintsForTile removes only scout hints on the discovered tile', () => {
  setStoryTileHint({
    id: 'scout:wood',
    kind: 'scout',
    q: 3,
    r: -1,
    label: 'Found Forest',
    createdAt: 1,
  });
  setStoryTileHint({
    id: 'scout:water',
    kind: 'scout',
    q: 4,
    r: -1,
    label: 'Found Water',
    createdAt: 2,
  });
  setStoryTileHint({
    id: 'story:forest',
    kind: 'forest',
    q: 3,
    r: -1,
    label: 'Forest nearby',
    createdAt: 3,
  });

  clearScoutStoryHintsForTile(3, -1);

  assert.deepEqual(
    getActiveStoryTileHints.value.map((hint) => hint.id),
    ['scout:water', 'story:forest'],
  );
});
