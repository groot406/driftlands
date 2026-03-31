import test from 'node:test';
import assert from 'node:assert/strict';

import { createStoryProgression, getAvailableStoryTaskKeys, getNewlyUnlockedStoryDescriptors } from './progression.ts';

test('story progression starts with a limited opening roster and toolkit', () => {
  const progression = createStoryProgression(1);

  assert.deepEqual(progression.heroes.available, ['h1', 'h2']);
  assert.deepEqual(progression.heroes.newlyUnlocked, []);
  assert.deepEqual(progression.buildings.available, ['dock', 'house']);
  assert.deepEqual(progression.terrains.available, ['plains', 'forest', 'dirt', 'water', 'grain']);
  assert.ok(getAvailableStoryTaskKeys(progression).includes('explore'));
  assert.ok(getAvailableStoryTaskKeys(progression).includes('buildDock'));
  assert.ok(getAvailableStoryTaskKeys(progression).includes('buildHouse'));
  assert.ok(!getAvailableStoryTaskKeys(progression).includes('buildMine'));
  assert.ok(!getAvailableStoryTaskKeys(progression).includes('buildWatchtower'));
});

test('mission 2 unlocks watchtower, mine, and mountain terrain', () => {
  const progression = createStoryProgression(2);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(taskKeys.includes('buildWatchtower'));
  assert.ok(taskKeys.includes('buildMine'));
  assert.ok(taskKeys.includes('mineOre'));
  assert.ok(taskKeys.includes('fishAtDock'));
  assert.ok(taskKeys.includes('buildDock'));
  assert.ok(progression.buildings.available.includes('watchtower'));
  assert.ok(progression.buildings.available.includes('mine'));
  assert.ok(progression.terrains.available.includes('mountain'));
  assert.ok(progression.tasks.newlyUnlocked.includes('fishAtDock'));
  assert.ok(progression.tasks.newlyUnlocked.includes('mineOre'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'building' && unlock.key === 'watchtower'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'terrain' && unlock.key === 'mountain'));
});

test('mission 3 unlocks supply depot, lumber camp, and fourth hero', () => {
  const progression = createStoryProgression(3);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(taskKeys.includes('buildSupplyDepot'));
  assert.ok(taskKeys.includes('buildLumberCamp'));
  assert.ok(taskKeys.includes('gatherTimber'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'hero' && unlock.key === 'h4'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'building' && unlock.key === 'supplyDepot'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'building' && unlock.key === 'lumberCamp'));
  // mountain terrain was already unlocked at mission 2
  assert.ok(!newUnlocks.some((unlock) => unlock.kind === 'terrain' && unlock.key === 'mountain'));
});
