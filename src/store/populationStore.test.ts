import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import type { TaskInstance } from '../core/types/Task.ts';
import type { Tile } from '../core/types/Tile.ts';
import { loadWorld, tileIndex } from '../core/world.ts';
import { getBuildingDefinitionByKey } from '../shared/buildings/registry.ts';
import {
  computeControlledTileIdsForSettlement,
  recalculateSettlementSupport,
  resetSettlementSupportState,
} from './settlementSupportStore.ts';
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

test('new town centers stay in the builder settlement and add population cap', () => {
  loadWorld([
    tile(0, 0, 'towncenter'),
    {
      id: '10,0',
      q: 10,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      variant: null,
      discovered: true,
      isBaseTile: true,
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
    } satisfies Tile,
  ]);

  try {
    const buildTownCenter = getBuildingDefinitionByKey('townCenter');
    const frontierTile = tileIndex['10,0'];
    const builder: Hero = {
      id: 'builder',
      name: 'Builder',
      avatar: '',
      settlementId: '0,0',
      q: 10,
      r: 0,
      stats: { xp: 0, hp: 1, atk: 1, spd: 1 },
      facing: 'down',
    };
    const task: TaskInstance = {
      id: 'build-town-center',
      type: 'buildTownCenter',
      tileId: '10,0',
      progressXp: 0,
      requiredXp: 0,
      createdMs: 0,
      lastUpdateMs: 0,
      participants: {},
      active: true,
    };

    assert.ok(frontierTile);
    buildTownCenter?.onComplete?.(frontierTile, task, [builder]);

    recalculateSettlementSupport({ '0,0': 0 }, 0);
    const limits = recalculatePopulationLimits();

    assert.equal(frontierTile.terrain, 'towncenter');
    assert.equal(frontierTile.ownerSettlementId, '0,0');
    assert.equal(computeControlledTileIdsForSettlement('0,0').has('10,0'), true);
    assert.equal(limits.max, 30);
  } finally {
    loadWorld([]);
    resetSettlementSupportState();
    resetPopulationState();
  }
});
