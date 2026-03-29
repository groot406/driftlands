import test from 'node:test';
import assert from 'node:assert/strict';

import { applyBiomeModifiers, detectBiome } from './biomes';
import { weightedTerrainChoice } from './terrain';
import type { TerrainKey } from './terrainDefs';

function withSeededRandom<T>(seed: number, run: () => T): T {
  const original = Math.random;
  let state = seed >>> 0;

  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function buildWeights(): Record<TerrainKey, number> {
  return {
    towncenter: 0,
    plains: 30,
    forest: 26,
    water: 20,
    mountain: 12,
    dirt: 16,
    snow: 10,
    dessert: 9,
    vulcano: 4,
    grain: 14,
  };
}

test('detectBiome picks the strongest matching regional signal instead of the first match', () => {
  const nearby: TerrainKey[] = [
    'water', 'water', 'water', 'water', 'water', 'water', 'water', 'water', 'water', 'water',
    'plains', 'plains', 'plains', 'plains', 'plains', 'plains',
    'forest', 'dirt',
  ];

  assert.equal(detectBiome(nearby), 'lake');
});

test('applyBiomeModifiers keeps transition terrain possible instead of hard-zeroing it', () => {
  const original = buildWeights();
  const adjusted = applyBiomeModifiers('lake', { ...original });

  assert.ok(adjusted.water > original.water);
  assert.ok(adjusted.plains > original.plains);
  assert.ok(adjusted.mountain > 0);
  assert.ok(adjusted.mountain < original.mountain);
});

test('weightedTerrainChoice strongly favors the dominant nearby terrain cluster', () => {
  const picks: Partial<Record<TerrainKey, number>> = {};

  withSeededRandom(0xdecafbad, () => {
    for (let i = 0; i < 400; i++) {
      const terrain = weightedTerrainChoice(
        ['forest', 'forest', 'forest', 'forest', 'plains', 'dirt'],
        ['forest', 'forest', 'forest', 'forest', 'forest', 'forest', 'forest', 'plains', 'plains', 'dirt', 'water', 'forest'],
      ).terrain;
      picks[terrain] = (picks[terrain] ?? 0) + 1;
    }
  });

  assert.ok((picks.forest ?? 0) > 200);
  assert.ok((picks.forest ?? 0) > (picks.plains ?? 0));
  assert.ok((picks.water ?? 0) < 20);
});
