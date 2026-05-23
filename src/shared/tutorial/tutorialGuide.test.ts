import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateTutorial, getFieldGuideTopicDefinitions, type TutorialMetrics } from './tutorialGuide.ts';

function metrics(overrides: Partial<TutorialMetrics> = {}): TutorialMetrics {
  return {
    selectedHeroCount: 0,
    discoveredTiles: 7,
    terrainCounts: {},
    variantCounts: {},
    buildingCounts: {},
    resourceStock: {},
    ...overrides,
    population: {
      current: overrides.population?.current ?? 1,
      beds: overrides.population?.beds ?? 0,
      max: overrides.population?.max ?? 15,
      hungerMs: overrides.population?.hungerMs ?? 0,
      inactiveTileCount: overrides.population?.inactiveTileCount ?? 0,
    },
  };
}

test('tutorial starts by asking the player to pick a hero', () => {
  const tutorial = evaluateTutorial(metrics());

  assert.equal(tutorial.currentStep?.id, 'select-hero');
  assert.equal(tutorial.completedCount, 0);
});

test('tutorial advances through scouting, wood, road, and shelter gates', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 12,
    resourceStock: { wood: 3 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1 },
    population: {
      current: 1,
      beds: 2,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(tutorial.steps.find((step) => step.id === 'select-hero')?.completed, true);
  assert.equal(tutorial.steps.find((step) => step.id === 'scout-frontier')?.completed, true);
  assert.equal(tutorial.steps.find((step) => step.id === 'gather-wood')?.completed, true);
  assert.equal(tutorial.steps.find((step) => step.id === 'lay-road')?.completed, true);
  assert.equal(tutorial.steps.find((step) => step.id === 'raise-house')?.completed, true);
  assert.equal(tutorial.currentStep?.id, 'build-dock');
});

test('shoreline tutorial route completes early food by building a dock', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 12,
    landingArchetype: 'shoreline',
    terrainCounts: { water: 2 },
    resourceStock: { wood: 3 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1, dock: 1 },
    population: {
      current: 1,
      beds: 2,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  const earlyFood = tutorial.steps.find((step) => step.id === 'build-dock');
  assert.equal(earlyFood?.title, 'Open the shoreline');
  assert.equal(earlyFood?.completed, true);
  assert.equal(tutorial.currentStep?.id, 'grow-population');
});

test('woodland tutorial route completes early food by hunting or a hunter hut', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 12,
    landingArchetype: 'woodland',
    terrainCounts: { forest: 3 },
    resourceStock: { wood: 3, meat: 5 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1 },
    population: {
      current: 1,
      beds: 2,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  const earlyFood = tutorial.steps.find((step) => step.id === 'build-dock');
  assert.equal(earlyFood?.title, 'Secure forest food');
  assert.match(earlyFood?.action ?? '', /Hunt|Hunter Hut/);
  assert.equal(earlyFood?.completed, true);
  assert.equal(tutorial.currentStep?.id, 'grow-population');
});

test('open-field tutorial route points players to planting trees before forest food', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 12,
    landingArchetype: 'open_field',
    terrainCounts: { plains: 6 },
    resourceStock: { wood: 3 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1 },
    population: {
      current: 1,
      beds: 2,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  const earlyFood = tutorial.currentStep;
  assert.equal(earlyFood?.id, 'build-dock');
  assert.equal(earlyFood?.title, 'Grow a food route');
  assert.match(earlyFood?.action ?? '', /Plant Trees/);
  assert.equal(earlyFood?.completed, false);
});

test('tutorial explains perimeter security as watchtower progress', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 18,
    terrainCounts: { water: 4, grain: 1 },
    resourceStock: { wood: 10, grain: 4, fish: 8 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1, dock: 1 },
    population: {
      current: 4,
      beds: 4,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(tutorial.currentStep?.id, 'secure-perimeter');
  assert.match(tutorial.currentStep?.objective ?? '', /watchtower/i);
  assert.match(tutorial.currentStep?.why ?? '', /Perimeter security/i);
});

test('perimeter step explains population and food blockers before watchtower', () => {
  const populationBlocked = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 18,
    terrainCounts: { water: 4, grain: 1 },
    resourceStock: { wood: 10, grain: 4, fish: 8 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1, dock: 1 },
    population: {
      current: 2,
      beds: 4,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(populationBlocked.currentStep?.id, 'secure-perimeter');
  assert.match(populationBlocked.currentStep?.objective ?? '', /Reach 4 settlers/);
  assert.match(populationBlocked.currentStep?.action ?? '', /food stocked and beds open/);
  assert.equal(populationBlocked.currentStep?.progressLabel, '2/4 settlers');

  const foodBlocked = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 18,
    terrainCounts: { water: 4, grain: 1 },
    resourceStock: { wood: 10, grain: 4, fish: 3 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1, dock: 1 },
    population: {
      current: 4,
      beds: 4,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(foodBlocked.currentStep?.id, 'secure-perimeter');
  assert.match(foodBlocked.currentStep?.objective ?? '', /Store 8 edible food/);
  assert.match(foodBlocked.currentStep?.action ?? '', /Hunt, fish, or bake/);
  assert.equal(foodBlocked.currentStep?.progressLabel, '3/8 food stored');
});

test('tutorial waits for online support after population reaches four', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 18,
    terrainCounts: { water: 4, grain: 1 },
    resourceStock: { wood: 10, grain: 4 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 2, dock: 1, watchtower: 1 },
    population: {
      current: 4,
      beds: 4,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 2,
    },
  }));

  assert.equal(tutorial.currentStep?.id, 'stabilize-colony');
  assert.equal(tutorial.currentStep?.completed, false);
  assert.equal(tutorial.currentStep?.progressLabel, '2 inactive tiles');
});

test('ridge step points at population before known mountain industry', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 24,
    terrainCounts: { water: 4, grain: 1, mountain: 3 },
    resourceStock: { wood: 20, grain: 4, water: 1 },
    variantCounts: { road: 4, dirt_tilled: 1 },
    buildingCounts: {
      house: 2,
      dock: 1,
      watchtower: 1,
      granary: 1,
      well: 1,
    },
    population: {
      current: 4,
      beds: 6,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(tutorial.currentStep?.id, 'mine-ridges');
  assert.match(tutorial.currentStep?.objective ?? '', /5 settlers/);
  assert.match(tutorial.currentStep?.action ?? '', /food stocked/);
  assert.doesNotMatch(tutorial.currentStep?.action ?? '', /Scout toward mountain tiles/);
  assert.equal(tutorial.currentStep?.progressLabel, '4/5 settlers');
});

test('study step points at workshop before a tool-gated library', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 28,
    terrainCounts: { water: 4, grain: 1, mountain: 3 },
    resourceStock: { wood: 24, stone: 8, ore: 4, tools: 0, grain: 4, water: 1 },
    variantCounts: { road: 4, dirt_tilled: 1 },
    buildingCounts: {
      house: 2,
      dock: 1,
      watchtower: 1,
      granary: 1,
      well: 1,
      quarry: 1,
    },
    population: {
      current: 5,
      beds: 6,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(tutorial.currentStep?.id, 'study-and-upgrade');
  assert.match(tutorial.currentStep?.objective ?? '', /workshop before the library/i);
  assert.match(tutorial.currentStep?.action ?? '', /Build a workshop first/i);
  assert.equal(tutorial.currentStep?.progressLabel, '0/2 tools');
});

test('tutorial adds a comfort step after tools and studies begin', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 30,
    terrainCounts: { water: 4, grain: 1, mountain: 3 },
    resourceStock: { wood: 24, stone: 8, ore: 4, tools: 2, grain: 4, water: 1 },
    variantCounts: { road: 4, dirt_tilled: 1 },
    buildingCounts: {
      house: 2,
      dock: 1,
      watchtower: 1,
      granary: 1,
      well: 1,
      quarry: 1,
      supplyDepot: 1,
      workshop: 1,
    },
    population: {
      current: 6,
      beds: 6,
      max: 15,
      hungerMs: 0,
      inactiveTileCount: 0,
    },
  }));

  assert.equal(tutorial.currentStep?.id, 'raise-comfort');
  assert.match(tutorial.currentStep?.objective ?? '', /comfort/i);
  assert.match(tutorial.currentStep?.action ?? '', /pub|shop|upgrade houses/i);
  assert.equal(tutorial.currentStep?.progressLabel, '0/1 comfort route');
});

test('field guide covers the major systems and terrain alternatives', () => {
  const topics = getFieldGuideTopicDefinitions();
  const categories = new Set(topics.map((topic) => topic.category));
  const allGuideText = topics
    .flatMap((topic) => [topic.title, topic.summary, ...topic.cues])
    .join(' ');

  assert.ok(topics.length >= 18);
  assert.deepEqual(
    Array.from(categories).sort(),
    ['Basics', 'Food', 'Frontier', 'Industry', 'Logistics', 'Progression', 'Settlement'],
  );
  assert.match(allGuideText, /If the terrain you need is missing|If mountains are hard to find/);
  assert.match(allGuideText, /roadmap/i);
  assert.match(allGuideText, /job sites/i);
  assert.match(allGuideText, /ship orders/i);
  assert.match(allGuideText, /Pubs|trade goods|house upgrades/i);
  assert.match(allGuideText, /Market stock/i);
  assert.match(allGuideText, /repair/i);
  assert.match(allGuideText, /Calamities/i);
});
