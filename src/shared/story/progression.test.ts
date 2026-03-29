import test from 'node:test';
import assert from 'node:assert/strict';

import { createStoryProgression, getAvailableStoryTaskKeys, getNewlyUnlockedStoryDescriptors } from './progression.ts';

test('story progression starts with a limited opening roster and toolkit', () => {
  const progression = createStoryProgression(1);

  assert.deepEqual(progression.heroes.available, ['h1', 'h2']);
  assert.deepEqual(progression.heroes.newlyUnlocked, []);
  assert.deepEqual(progression.buildings.available, ['dock']);
  assert.deepEqual(progression.terrains.available, ['plains', 'forest', 'dirt', 'water']);
  assert.ok(getAvailableStoryTaskKeys(progression).includes('explore'));
  assert.ok(getAvailableStoryTaskKeys(progression).includes('buildDock'));
  assert.ok(!getAvailableStoryTaskKeys(progression).includes('buildMine'));
});

test('story progression unlocks buildings through their build tasks', () => {
  const progression = createStoryProgression(3);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(taskKeys.includes('buildMine'));
  assert.ok(taskKeys.includes('buildDock'));
  assert.ok(taskKeys.includes('mineOre'));
  assert.ok(taskKeys.includes('fishAtDock'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'hero' && unlock.key === 'h4'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'terrain' && unlock.key === 'mountain'));
});

test('mission 2 unlocks dock fishing before the mountain tier', () => {
  const progression = createStoryProgression(2);
  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(taskKeys.includes('buildDock'));
  assert.ok(taskKeys.includes('fishAtDock'));
  assert.ok(progression.buildings.available.includes('dock'));
  assert.ok(progression.tasks.newlyUnlocked.includes('fishAtDock'));
});
