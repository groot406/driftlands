import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateTutorial, type TutorialMetrics } from './tutorialGuide.ts';

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

test('tutorial explains perimeter security as watchtower progress', () => {
  const tutorial = evaluateTutorial(metrics({
    selectedHeroCount: 1,
    discoveredTiles: 18,
    terrainCounts: { water: 4, grain: 1 },
    resourceStock: { wood: 10, grain: 4 },
    variantCounts: { road: 1 },
    buildingCounts: { house: 1, dock: 1 },
    population: {
      current: 3,
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
