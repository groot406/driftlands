import test from 'node:test';
import assert from 'node:assert/strict';

import { createStoryProgression, getAvailableStoryTaskKeys, getNewlyUnlockedStoryDescriptors } from './progression.ts';

test('mission 1 starts with basic exploration heroes, tasks, and terrains', () => {
  const progression = createStoryProgression(1);

  assert.deepEqual(progression.heroes.available, ['h1', 'h2']);
  assert.deepEqual(progression.heroes.newlyUnlocked, []);
  assert.deepEqual(progression.buildings.available, []);
  assert.deepEqual(progression.terrains.available, ['plains', 'forest', 'dirt']);
  assert.ok(getAvailableStoryTaskKeys(progression).includes('explore'));
  assert.ok(getAvailableStoryTaskKeys(progression).includes('chopWood'));
  assert.ok(getAvailableStoryTaskKeys(progression).includes('buildRoad'));
  assert.ok(!getAvailableStoryTaskKeys(progression).includes('buildDock'));
  assert.ok(!getAvailableStoryTaskKeys(progression).includes('buildHouse'));
  assert.ok(!getAvailableStoryTaskKeys(progression).includes('buildMine'));
});

test('mission 2 unlocks dock, house, water terrain, and shore tasks', () => {
  const progression = createStoryProgression(2);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(taskKeys.includes('buildDock'));
  assert.ok(taskKeys.includes('buildHouse'));
  assert.ok(taskKeys.includes('harvestWaterLilies'));
  assert.ok(taskKeys.includes('plantTrees'));
  assert.ok(progression.buildings.available.includes('dock'));
  assert.ok(progression.buildings.available.includes('house'));
  assert.ok(progression.terrains.available.includes('water'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'dock'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'house'));
  assert.ok(newUnlocks.some((u) => u.kind === 'terrain' && u.key === 'water'));
});

test('mission 3 unlocks farming tasks and grain terrain', () => {
  const progression = createStoryProgression(3);
  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(taskKeys.includes('tillLand'));
  assert.ok(taskKeys.includes('seedGrain'));
  assert.ok(taskKeys.includes('harvestGrain'));
  assert.ok(progression.terrains.available.includes('grain'));
});

test('mission 4 unlocks third hero, well, and irrigation', () => {
  const progression = createStoryProgression(4);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(progression.heroes.available.includes('h3'));
  assert.ok(taskKeys.includes('buildWell'));
  assert.ok(taskKeys.includes('irregateDirtTask'));
  assert.ok(newUnlocks.some((u) => u.kind === 'hero' && u.key === 'h3'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'well'));
});

test('mission 5 unlocks watchtower, granary, and food production tasks', () => {
  const progression = createStoryProgression(5);
  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(taskKeys.includes('buildWatchtower'));
  assert.ok(taskKeys.includes('buildGranary'));
  assert.ok(taskKeys.includes('collectRations'));
  assert.ok(taskKeys.includes('fishAtDock'));
  assert.ok(progression.buildings.available.includes('watchtower'));
  assert.ok(progression.buildings.available.includes('granary'));
});

test('mission 6 unlocks mine, ore extraction, and mountain terrain', () => {
  const progression = createStoryProgression(6);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(taskKeys.includes('buildMine'));
  assert.ok(taskKeys.includes('mineOre'));
  assert.ok(progression.buildings.available.includes('mine'));
  assert.ok(progression.terrains.available.includes('mountain'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'mine'));
  assert.ok(newUnlocks.some((u) => u.kind === 'terrain' && u.key === 'mountain'));
});

test('mission 7 unlocks fourth hero, supply depot, lumber camp, and timber', () => {
  const progression = createStoryProgression(7);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(progression.heroes.available.includes('h4'));
  assert.ok(taskKeys.includes('buildSupplyDepot'));
  assert.ok(taskKeys.includes('buildLumberCamp'));
  assert.ok(taskKeys.includes('gatherTimber'));
  assert.ok(newUnlocks.some((u) => u.kind === 'hero' && u.key === 'h4'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'supplyDepot'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'lumberCamp'));
});

test('mission 8 unlocks harsh terrains without new buildings or tasks', () => {
  const progression = createStoryProgression(8);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(progression.terrains.available.includes('snow'));
  assert.ok(progression.terrains.available.includes('dessert'));
  assert.equal(progression.buildings.newlyUnlocked.length, 0);
  assert.equal(progression.tasks.newlyUnlocked.length, 0);
  assert.ok(newUnlocks.some((u) => u.kind === 'terrain' && u.key === 'snow'));
  assert.ok(newUnlocks.some((u) => u.kind === 'terrain' && u.key === 'dessert'));
});

test('mission 9 unlocks town center', () => {
  const progression = createStoryProgression(9);
  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(taskKeys.includes('buildTownCenter'));
  assert.ok(progression.buildings.available.includes('townCenter'));
  assert.ok(newUnlocks.some((u) => u.kind === 'building' && u.key === 'townCenter'));
});

test('mission 10 unlocks volcano terrain as the final frontier', () => {
  const progression = createStoryProgression(10);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(progression.terrains.available.includes('vulcano'));
  assert.ok(newUnlocks.some((u) => u.kind === 'terrain' && u.key === 'vulcano'));
  // Everything should be available by mission 10
  assert.deepEqual(progression.heroes.available, ['h1', 'h2', 'h3', 'h4']);
});

test('missions beyond 10 have the full roster with no new unlocks', () => {
  const progression = createStoryProgression(15);

  assert.deepEqual(progression.heroes.available, ['h1', 'h2', 'h3', 'h4']);
  assert.deepEqual(progression.heroes.newlyUnlocked, []);
  assert.deepEqual(progression.buildings.newlyUnlocked, []);
  assert.deepEqual(progression.tasks.newlyUnlocked, []);
  assert.deepEqual(progression.terrains.newlyUnlocked, []);
});
