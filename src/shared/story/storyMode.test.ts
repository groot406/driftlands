import test from 'node:test';
import assert from 'node:assert/strict';

import { createStoryBeat, evaluateStoryChapterNumber, type StoryChapterProgressMetrics } from './storyMode.ts';

function metrics(overrides: Partial<StoryChapterProgressMetrics> = {}): StoryChapterProgressMetrics {
  return {
    population: overrides.population ?? 1,
    frontierDistance: overrides.frontierDistance ?? 1,
    resourceStock: overrides.resourceStock ?? {},
    buildingCounts: overrides.buildingCounts ?? {},
    operationalBuildingCounts: overrides.operationalBuildingCounts ?? {},
    discoveredTerrains: overrides.discoveredTerrains ?? [],
  };
}

test('waterless woodland settlements can advance past the old shoreline chapter through hunting', () => {
  const chapterNumber = evaluateStoryChapterNumber(metrics({
    population: 2,
    resourceStock: { meat: 5 },
    buildingCounts: { house: 1 },
    discoveredTerrains: ['forest'],
  }), 1);

  assert.equal(chapterNumber, 3);
});

test('chapter two story text adapts to woodland and open-field landings', () => {
  const mutator = {
    key: 'timber_rush' as const,
    name: 'Timber Rush',
    description: 'Build quickly.',
  };
  const woodland = createStoryBeat(2, 3, mutator, {
    landingArchetype: 'woodland',
    discoveredTerrains: ['forest'],
  });
  const openField = createStoryBeat(2, 3, mutator, {
    landingArchetype: 'open_field',
    discoveredTerrains: ['plains'],
  });

  assert.equal(woodland.title, 'Embers Under Canopy');
  assert.match(woodland.briefing, /hunter hut/i);
  assert.equal(openField.title, 'Saplings Under Canvas');
  assert.match(openField.briefing, /plant saplings/i);
  assert.doesNotMatch(openField.briefing, /shoreline|dock/i);
});
