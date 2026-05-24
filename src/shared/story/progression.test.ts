import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProgressionMetrics,
  evaluateProgression,
  getAvailableStoryTaskKeys,
  getNewlyUnlockedStoryDescriptors,
  getStoryProgressionObjectives,
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
    landingTerrains: overrides.landingTerrains ?? [],
    unlockedHeroIds: overrides.unlockedHeroIds ?? [],
    completedStudyKeys: overrides.completedStudyKeys ?? [],
    heroAbilityChargesEarned: overrides.heroAbilityChargesEarned ?? 0,
  };
}

test('landfall starts unlocked with the first crew, shelter, and frontier basics', () => {
  const progression = evaluateProgression(metrics());
  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.deepEqual(progression.unlockedNodeKeys, ['landfall']);
  assert.deepEqual(progression.unlocked.heroes, ['h1', 'h2', 'h5']);
  assert.ok(progression.unlocked.buildings.includes('house'));
  assert.ok(progression.unlocked.buildings.includes('huntersHut'));
  assert.deepEqual(progression.unlocked.terrains, ['plains', 'forest', 'dirt', 'water']);
  assert.ok(taskKeys.includes('explore'));
  assert.ok(taskKeys.includes('buildHouse'));
  assert.ok(taskKeys.includes('buildHuntersHut'));
  assert.ok(taskKeys.includes('dig'));
  assert.ok(taskKeys.includes('hunt'));
  assert.ok(!taskKeys.includes('buildDock'));
});

test('security accepts any edible food source', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    population: 4,
    resourceStock: {
      meat: 4,
      fish: 4,
    },
  }), previous.unlockedNodeKeys);

  assert.ok(progression.unlockedNodeKeys.includes('security'));
  assert.ok(progression.unlocked.buildings.includes('watchtower'));
});

test('shoreline and farming unlock from discovered water, housing, and population growth', () => {
  const landfall = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest'],
    landingTerrains: ['water', 'forest'],
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
    },
  }), landfall.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);
  const newUnlocks = getNewlyUnlockedStoryDescriptors(progression);

  assert.ok(progression.unlockedNodeKeys.includes('water_source'));
  assert.ok(progression.unlockedNodeKeys.includes('shoreline'));
  assert.ok(progression.unlockedNodeKeys.includes('farming'));
  assert.ok(taskKeys.includes('buildWell'));
  assert.ok(taskKeys.includes('buildDock'));
  assert.ok(taskKeys.includes('tillLand'));
  assert.ok(taskKeys.includes('seedGrain'));
  assert.ok(newUnlocks.some((unlock) => unlock.kind === 'building' && unlock.key === 'dock'));
});

test('shoreline unlocks when water is discovered outside landing reach', () => {
  const landfall = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest'],
    landingTerrains: ['forest'],
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
    },
  }), landfall.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.equal(progression.unlockedNodeKeys.includes('shoreline'), true);
  assert.equal(progression.nextRecommendedNodeKeys.includes('shoreline'), false);
  assert.equal(taskKeys.includes('buildDock'), true);
});

test('inland starts recommend field wells instead of shoreline works', () => {
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['forest', 'dirt'],
    landingTerrains: ['forest', 'dirt'],
  }));
  const objectives = getStoryProgressionObjectives(progression);

  assert.equal(progression.unlockedNodeKeys.includes('shoreline'), false);
  assert.equal(progression.nextRecommendedNodeKeys.includes('shoreline'), false);
  assert.equal(progression.nextRecommendedNodeKeys[0], 'water_source');
  assert.equal(getAvailableStoryTaskKeys(progression).includes('buildDock'), false);
  assert.ok(objectives.some((objective) => objective.title === 'House x1'));
  assert.ok(objectives.some((objective) => objective.title === 'Population 2'));
});

test('inland starts unlock wells before field work', () => {
  const landfall = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['forest', 'dirt'],
    landingTerrains: ['forest', 'dirt'],
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
    },
  }), landfall.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.equal(progression.unlockedNodeKeys.includes('water_source'), true);
  assert.equal(progression.unlockedNodeKeys.includes('farming'), false);
  assert.equal(taskKeys.includes('buildWell'), true);
  assert.equal(taskKeys.includes('tillLand'), false);
  assert.equal(progression.nextRecommendedNodeKeys[0], 'farming');
});

test('progression objectives explain alternate routes for any-of requirements', () => {
  const landfall = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['forest', 'dirt'],
    landingTerrains: ['forest', 'dirt'],
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
    },
  }), landfall.unlockedNodeKeys);

  const objectives = getStoryProgressionObjectives(progression);
  const routeObjective = objectives.find((objective) => objective.description.includes('Choose any route'));

  assert.equal(progression.nextRecommendedNodeKeys[0], 'farming');
  assert.ok(routeObjective);
  assert.match(routeObjective?.description ?? '', /well/i);
  assert.match(routeObjective?.description ?? '', /water/i);
});

test('inland farming unlocks once the colony builds a well', () => {
  const landfall = evaluateProgression(metrics());
  const wells = evaluateProgression(metrics({
    discoveredTerrains: ['forest', 'dirt'],
    landingTerrains: ['forest', 'dirt'],
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
    },
  }), landfall.unlockedNodeKeys);
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['forest', 'dirt'],
    landingTerrains: ['forest', 'dirt'],
    population: 2,
    beds: 2,
    buildingCounts: {
      house: 1,
      well: 1,
    },
  }), wells.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.equal(progression.unlockedNodeKeys.includes('farming'), true);
  assert.equal(taskKeys.includes('buildWell'), true);
  assert.equal(taskKeys.includes('tillLand'), true);
  assert.equal(taskKeys.includes('seedGrain'), true);
});

test('shoreline remains recommended for starts with reachable landing water', () => {
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest'],
    landingTerrains: ['water', 'forest'],
  }));

  assert.equal(progression.unlockedNodeKeys.includes('shoreline'), false);
  assert.equal(progression.nextRecommendedNodeKeys[0], 'shoreline');
});

test('food economy chain unlocks irrigation, stores, and baking from real colony metrics', () => {
  const base = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest', 'dirt', 'grain'],
    population: 3,
    beds: 4,
    resourceStock: {
      grain: 10,
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
  assert.ok(progression.unlocked.buildings.includes('huntersHut'));
  assert.ok(progression.unlocked.buildings.includes('apiary'));
  assert.ok(progression.unlocked.buildings.includes('bakery'));
  assert.ok(taskKeys.includes('buildWell'));
  assert.ok(taskKeys.includes('buildHuntersHut'));
  assert.ok(taskKeys.includes('buildApiary'));
  assert.ok(taskKeys.includes('buildBakery'));
});

test('brewing unlocks brewery, winery, pub, and specialty crops once food is established', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    population: 6,
    buildingCounts: {
      bakery: 1,
    },
  }), previous.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(progression.unlockedNodeKeys.includes('brewing'));
  assert.ok(progression.unlocked.buildings.includes('brewery'));
  assert.ok(progression.unlocked.buildings.includes('winery'));
  assert.ok(progression.unlocked.buildings.includes('pub'));
  assert.ok(taskKeys.includes('buildBrewery'));
  assert.ok(taskKeys.includes('buildWinery'));
  assert.ok(taskKeys.includes('buildPub'));
  assert.ok(taskKeys.includes('seedHops'));
  assert.ok(taskKeys.includes('seedGrapes'));
});

test('frontier and logistics milestones unlock mining, depots, and the fourth hero', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest'],
    population: 5,
    beds: 5,
    resourceStock: {
      bread: 8,
      wood: 12,
    },
    buildingCounts: {
      house: 2,
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
  assert.ok(progression.unlocked.buildings.includes('wall'));
  assert.ok(progression.unlocked.buildings.includes('mine'));
  assert.ok(progression.unlocked.buildings.includes('quarry'));
  assert.ok(progression.unlocked.buildings.includes('supplyDepot'));
  assert.ok(progression.unlocked.buildings.includes('lumberCamp'));
  assert.ok(taskKeys.includes('buildMine'));
  assert.ok(taskKeys.includes('buildQuarry'));
  assert.ok(taskKeys.includes('buildSupplyDepot'));
  assert.equal(taskKeys.includes('buildTradeCenter'), false);
});

test('masonry, expansion, and deep frontier unlock upgrades and late terrain bands', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    population: 7,
    beds: 8,
    resourceStock: {
      stone: 8,
      ore: 12,
      tools: 6,
    },
    buildingCounts: {
      house: 2,
      supplyDepot: 1,
      bakery: 1,
      townCenter: 1,
      workshop: 1,
    },
    operationalBuildingCounts: {
      mine: 1,
      lumberCamp: 1,
      workshop: 1,
    },
  }), previous.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(progression.unlockedNodeKeys.includes('masonry'));
  assert.ok(progression.unlockedNodeKeys.includes('harsh_frontier'));
  assert.ok(progression.unlockedNodeKeys.includes('toolmaking'));
  assert.ok(progression.unlockedNodeKeys.includes('expansion'));
  assert.ok(progression.unlockedNodeKeys.includes('deep_frontier'));
  assert.ok(progression.unlocked.buildings.includes('workshop'));
  assert.ok(progression.unlocked.buildings.includes('tradeCenter'));
  assert.ok(progression.unlocked.buildings.includes('weaponSmith'));
  assert.ok(progression.unlocked.buildings.includes('barracks'));
  assert.equal(progression.unlocked.upgrades.includes('stone_house_upgrade'), false);
  assert.equal(progression.unlocked.upgrades.includes('warehouse_upgrade'), false);
  assert.ok(progression.unlocked.upgrades.includes('stone_road_upgrade'));
  assert.ok(progression.unlocked.upgrades.includes('sawmill_upgrade'));
  assert.ok(progression.unlocked.upgrades.includes('reinforced_mine_upgrade'));
  assert.ok(progression.unlocked.terrains.includes('snow'));
  assert.ok(progression.unlocked.terrains.includes('dessert'));
  assert.ok(progression.unlocked.terrains.includes('vulcano'));
  assert.equal(taskKeys.includes('upgradeHouseToStone'), false);
  assert.equal(taskKeys.includes('upgradeDepotToWarehouse'), false);
  assert.ok(taskKeys.includes('upgradeMineToReinforced'));
  assert.ok(taskKeys.includes('buildTradeCenter'));
  assert.ok(taskKeys.includes('buildWeaponSmith'));
  assert.ok(taskKeys.includes('buildBarracks'));
});

test('desert industry unlocks sand, ovens, and glass housing after harsh frontier discovery', () => {
  const previous = evaluateProgression(metrics());
  const progression = evaluateProgression(metrics({
    discoveredTerrains: ['dessert'],
    population: 6,
    resourceStock: {
      wood: 10,
    },
    buildingCounts: {
      supplyDepot: 1,
    },
  }), previous.unlockedNodeKeys);

  const taskKeys = getAvailableStoryTaskKeys(progression);

  assert.ok(progression.unlockedNodeKeys.includes('desert_industry'));
  assert.ok(progression.unlocked.buildings.includes('oven'));
  assert.ok(progression.unlocked.upgrades.includes('glass_house_upgrade'));
  assert.ok(taskKeys.includes('gatherSand'));
  assert.ok(taskKeys.includes('buildOven'));
  assert.ok(taskKeys.includes('upgradeHouseToGlass'));
});

test('hero methods require an earned hero charge without needing studies', () => {
  const locked = evaluateProgression(metrics());
  assert.equal(locked.unlockedNodeKeys.includes('hero_methods'), false);

  const unlocked = evaluateProgression(metrics({
    heroAbilityChargesEarned: 1,
  }));
  assert.ok(unlocked.unlockedNodeKeys.includes('hero_methods'));
});

test('previously unlocked milestones stay unlocked after metrics dip on reload', () => {
  const richProgression = evaluateProgression(metrics({
    discoveredTerrains: ['water', 'forest'],
    population: 7,
    beds: 8,
    resourceStock: {
      grain: 10,
      food: 8,
      wood: 12,
      stone: 8,
      ore: 12,
      tools: 6,
    },
    buildingCounts: {
      house: 2,
      watchtower: 1,
      granary: 1,
      supplyDepot: 1,
      bakery: 1,
      workshop: 1,
      townCenter: 1,
    },
    operationalBuildingCounts: {
      granary: 1,
      mine: 1,
      lumberCamp: 1,
      workshop: 1,
    },
  }));

  const reloaded = evaluateProgression(metrics({
    discoveredTerrains: ['water'],
    population: 1,
    beds: 2,
  }), richProgression.unlockedNodeKeys);

  assert.deepEqual(reloaded.unlockedNodeKeys, richProgression.unlockedNodeKeys);
  assert.deepEqual(reloaded.recentlyUnlockedNodeKeys, []);
});

test('retired upgrade unlocks in saved progression do not crash task lookup', () => {
  const progression = evaluateProgression(metrics({
    population: 5,
    buildingCounts: {
      house: 2,
    },
  }));

  progression.unlocked.upgrades.push('market_charter' as never);

  const taskKeys = getAvailableStoryTaskKeys(progression);
  assert.equal(taskKeys.includes('grantMarketCharter'), false);
});
