import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../core/types/Tile.ts';
import { loadWorld } from '../core/world.ts';
import { recalculateSettlementSupport, resetSettlementSupportState } from './settlementSupportStore.ts';
import {
  computeReachTileIds,
  computeReachTileIdsForTC,
  computeReachTileIdsForWatchtower,
  getPopulationState,
  initializePopulation,
  isTileWithinReach,
  recalculatePopulationLimits,
  resetPopulationState,
} from './populationStore.ts';

function tile(q: number, r: number, terrain: Tile['terrain'], variant: Tile['variant'] = null): Tile {
  return {
    id: `${q},${r}`,
    q,
    r,
    biome: null,
    terrain,
    variant,
    discovered: true,
  };
}

test('watchtowers chain their reach when each next tower is inside current reach', () => {
  loadWorld([
    tile(0, 0, 'towncenter'),
    tile(7, 0, 'plains', 'plains_watchtower'),
    tile(12, 0, 'plains', 'plains_watchtower'),
  ]);

  try {
    recalculateSettlementSupport(0, 0);
    const globalReach = computeReachTileIds();
    const townCenterReach = computeReachTileIdsForTC(0, 0);
    const watchtowerReach = computeReachTileIdsForWatchtower(12, 0);

    assert.equal(globalReach.has('18,0'), true);
    assert.equal(townCenterReach.has('18,0'), true);
    assert.equal(watchtowerReach.has('18,0'), true);
    assert.equal(isTileWithinReach(18, 0), true);
  } finally {
    loadWorld([]);
    resetSettlementSupportState();
  }
});

test('town centers provide population cap but no starting beds or settlers', () => {
  loadWorld([
    tile(0, 0, 'towncenter'),
  ]);

  try {
    initializePopulation();

    const population = getPopulationState();
    assert.equal(population.max, 15);
    assert.equal(population.beds, 0);
    assert.equal(population.current, 0);
  } finally {
    loadWorld([]);
    resetSettlementSupportState();
    resetPopulationState();
  }
});

test('houses within reach provide the first beds after the town center is built', () => {
  loadWorld([
    tile(0, 0, 'towncenter'),
    tile(1, 0, 'plains', 'plains_house'),
  ]);

  try {
    const limits = recalculatePopulationLimits();

    assert.equal(limits.max, 15);
    assert.equal(limits.beds, 2);
  } finally {
    loadWorld([]);
    resetSettlementSupportState();
    resetPopulationState();
  }
});

test('active roads extend reach into the surrounding frontier beyond the base town-center ring', () => {
  loadWorld([
    tile(0, 0, 'towncenter'),
    tile(9, 0, 'plains', 'road'),
    {
      id: '10,-1',
      q: 10,
      r: -1,
      biome: 'plains',
      terrain: 'plains',
      variant: null,
      discovered: false,
      isBaseTile: true,
      activationState: 'inactive',
    } satisfies Tile,
  ]);

  try {
    recalculateSettlementSupport(0, 0);
    const townCenterReach = computeReachTileIdsForTC(0, 0);

    assert.equal(townCenterReach.has('10,-1'), true);
    assert.equal(isTileWithinReach(10, -1), true);
  } finally {
    loadWorld([]);
    resetSettlementSupportState();
  }
});
