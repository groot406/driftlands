import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProgressionMetrics,
  evaluateProgression,
  getAvailableStoryTaskKeys,
  getNewlyUnlockedStoryDescriptors,
  type ProgressionMetrics,
} from './progression.ts';

function metrics(overrides: Partial<ProgressionMetrics> = {}): ProgressionMetrics {
  return {
    ...createEmptyProgressionMetrics(),
    discoveredTerrains: overrides.discoveredTerrains ?? [],
    resourceStock: overrides.resourceStock ?? {},
    buildingCounts: overrides.buildingCounts ?? {},
    operationalBuildingCounts: overrides.operationalBuildingCounts ?? {},
    population: overrides.population ?? 0,
    beds: overrides.beds ?? 0,
    frontierDistance: overrides.frontierDistance ?? 0,
    unlockedHeroIds: overrides.unlockedHeroIds ?? [],
  };
}

test('landfall starts unlocked with the first crew, shelter, and frontier basics', () => {
  const progression = evaluateProgression(metrics());
  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.deepEqual(progression.unlockedNodeKeys, ['landfall']);
  assert.deepEqual(progression.unlocked.heroes, ['h1', 'h2']);
  assert.ok(progression.unlocked.buildings.includes('campfire'));
  assert.ok(progression.unlocked.buildings.includes('house'));
  assert.deepEqual(progression.unlocked.terrains, ['plains', 'forest', 'dirt', 'water']);
  assert.ok(taskKeys.includes('explore'));
  assert.ok(taskKeys.includes('buildHouse'));
  assert.ok(taskKeys.includes('dig'));
  assert.ok(!taskKeys.includes('buildDock'));
});

test('shoreline and farming unlock from discovered water, housing, and population growth', () => {
  const landfall = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest'],
    frontierDistance: 2,
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
    },
  }), landfall.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(progression.unlockedNodeKeys.includes('shoreline'));
  assert.ok(progression.unlockedNodeKeys.includes('farming'));
  assert.ok(taskKeys.includes('buildDock'));
  assert.ok(taskKeys.includes('tillLand'));
  assert.ok(taskKeys.includes('seedGrain'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'building' && unlock.key === 'dock'));
});

test('food economy chain unlocks irrigation, stores, and baking from real colony metrics', () => {
  const base = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest', 'dirt', 'grain'],
    frontierDistance: 4,
    population: 3,
    beds: 4,
    resourceStock: {
      grain: 10,
      stone: 2,
    },
    buildingCounts: {
      house: 1,
      granary: 1,
    },
    operationalBuildingCounts: {
      granary: 1,
    },
  }), base.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(progression.unlockedNodeKeys.includes('irrigation'));
  assert.ok(progression.unlockedNodeKeys.includes('stores'));
  assert.ok(progression.unlockedNodeKeys.includes('baking'));
  assert.ok(progression.unlocked.heroes.includes('h3'));
  assert.ok(progression.unlocked.buildings.includes('well'));
  assert.ok(progression.unlocked.buildings.includes('granary'));
  assert.ok(progression.unlocked.buildings.includes('bakery'));
  assert.ok(taskKeys.includes('buildWell'));
  assert.ok(taskKeys.includes('buildBakery'));
});

test('frontier and logistics milestones unlock mining, depots, and the fourth hero', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest', 'mountain'],
    frontierDistance: 6,
    population: 4,
    beds: 4,
    buildingCounts: {
      house: 1,
      watchtower: 1,
      supplyDepot: 1,
    },
  }), previous.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(progression.unlockedNodeKeys.includes('security'));
  assert.ok(progression.unlockedNodeKeys.includes('mountain_frontier'));
  assert.ok(progression.unlockedNodeKeys.includes('logistics'));
  assert.ok(progression.unlockedNodeKeys.includes('timber_industry'));
  assert.ok(progression.unlocked.heroes.includes('h4'));
  assert.ok(progression.unlocked.buildings.includes('watchtower'));
  assert.ok(progression.unlocked.buildings.includes('mine'));
  assert.ok(progression.unlocked.buildings.includes('supplyDepot'));
  assert.ok(progression.unlocked.buildings.includes('lumberCamp'));
  assert.ok(taskKeys.includes('buildMine'));
  assert.ok(taskKeys.includes('buildSupplyDepot'));
});

test('masonry, expansion, and deep frontier unlock upgrades and late terrain bands', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest', 'mountain', 'snow', 'dessert'],
    frontierDistance: 10,
    population: 7,
    beds: 8,
    resourceStock: {
      stone: 8,
      ore: 12,
    },
    buildingCounts: {
      house: 2,
      watchtower: 1,
      supplyDepot: 1,
      townCenter: 1,
    },
  }), previous.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(progression.unlockedNodeKeys.includes('masonry'));
  assert.ok(progression.unlockedNodeKeys.includes('harsh_frontier'));
  assert.ok(progression.unlockedNodeKeys.includes('expansion'));
  assert.ok(progression.unlockedNodeKeys.includes('deep_frontier'));
  assert.ok(progression.unlocked.upgrades.includes('stone_house_upgrade'));
  assert.ok(progression.unlocked.upgrades.includes('warehouse_upgrade'));
  assert.ok(progression.unlocked.upgrades.includes('sawmill_upgrade'));
  assert.ok(progression.unlocked.upgrades.includes('reinforced_mine_upgrade'));
  assert.ok(progression.unlocked.terrains.includes('snow'));
  assert.ok(progression.unlocked.terrains.includes('dessert'));
  assert.ok(progression.unlocked.terrains.includes('vulcano'));
  assert.ok(taskKeys.includes('upgradeHouseToStone'));
  assert.ok(taskKeys.includes('upgradeMineToReinforced'));
});

test('previously unlocked milestones stay unlocked after metrics dip on reload', () => {
  const richProgression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest', 'mountain'],
    frontierDistance: 6,
    population: 4,
    beds: 4,
    resourceStock: {
      grain: 10,
      stone: 8,
    },
    buildingCounts: {
      house: 1,
      watchtower: 1,
      granary: 1,
      supplyDepot: 1,
    },
    operationalBuildingCounts: {
      granary: 1,
    },
  }));

  const reloaded = evaluateProgression(metrics({
    discoveredTerrains: ['water'],
    frontierDistance: 2,
    population: 1,
    beds: 2,
  }), richProgression.unlockedNodeKeys);

  assert.deepEqual(reloaded.unlockedNodeKeys, richProgression.unlockedNodeKeys);
  assert.deepEqual(reloaded.recentlyUnlockedNodeKeys, []);
});
