import test from 'node:test';
import assert from 'node:assert/strict';

import type { BaseMessage } from '../../../src/shared/protocol';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { loadWorld } from '../../../src/shared/game/world';
import { getWorkforceSnapshot, resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { getStorageResourceAmount, depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { jobSystem } from './jobSystem';

function captureBroadcasts() {
  const messages: BaseMessage[] = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message);
    },
  });
  return messages;
}

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    biome: overrides.biome ?? 'plains',
    terrain: overrides.terrain,
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    variant: overrides.variant ?? null,
    activationState: overrides.activationState ?? 'active',
    controlledBySettlementId: overrides.controlledBySettlementId ?? '0,0',
    ownerSettlementId: overrides.ownerSettlementId ?? '0,0',
    supportBand: overrides.supportBand ?? 'stable',
  };
}

function createTowncenterTile(): Tile {
  return createTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
  });
}

function loadPopulation(current: number, beds: number, hungerMs: number = 0) {
  loadPopulationSnapshot({
    current,
    max: Math.max(current, beds, 10),
    beds,
    hungerMs,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });
}

function tickAt(now: number) {
  jobSystem.tick({
    now,
    dt: 1_000,
    tick: Math.floor(now / 1_000),
    rng: {} as never,
  });
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetPopulationState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetGameRuntime();
});

test('workforce availability is capped by beds, pauses on hunger, and returns afterward', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'grain', variant: 'grain_granary' }),
  ]);
  loadPopulation(3, 1, 0);
  jobSystem.init();

  let snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.availableWorkers, 1);
  assert.equal(snapshot.assignedWorkers, 1);

  const broadcasts = captureBroadcasts();
  loadPopulation(3, 2, 60_000);
  tickAt(1_000);

  snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.availableWorkers, 0);
  assert.equal(snapshot.assignedWorkers, 0);
  assert.ok(broadcasts.some((message) => message.type === 'jobs:update'));

  loadPopulation(3, 2, 0);
  tickAt(2_000);

  snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.availableWorkers, 2);
  assert.equal(snapshot.assignedWorkers, 2);
  assert.equal(snapshot.idleWorkers, 0);
});

test('workers are assigned in a stable even order across job sites', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'grain', variant: 'grain_granary' }),
    createTile({ id: '3,0', q: 3, r: 0, terrain: 'grain', variant: 'grain_granary' }),
    createTile({ id: '4,0', q: 4, r: 0, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(2, 4, 0);
  jobSystem.init();

  const snapshot = getWorkforceSnapshot();
  assert.deepEqual(
    snapshot.sites.map((site) => ({
      tileId: site.tileId,
      assignedWorkers: site.assignedWorkers,
    })),
    [
      { tileId: '1,0', assignedWorkers: 1 },
      { tileId: '2,0', assignedWorkers: 1 },
      { tileId: '3,0', assignedWorkers: 0 },
      { tileId: '4,0', assignedWorkers: 0 },
    ],
  );
});

test('granary and bakery can complete a full passive production chain', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'grain', variant: 'grain_granary' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(2, 2, 0);
  jobSystem.init();

  tickAt(1_000);
  tickAt(61_000);

  assert.equal(resourceInventory.grain, 1);
  assert.equal(resourceInventory.food, 2);
  assert.equal(getStorageResourceAmount('0,0', 'grain'), 1);
  assert.equal(getStorageResourceAmount('0,0', 'food'), 2);
});

test('lumber camp produces wood once staffed for a full cycle', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp' }),
  ]);
  loadPopulation(1, 1, 0);
  jobSystem.init();

  tickAt(1_000);
  tickAt(61_000);

  assert.equal(resourceInventory.wood, 2);
  assert.equal(getStorageResourceAmount('0,0', 'wood'), 2);
});

test('production skips the whole cycle when output storage is full', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(1, 1, 0);
  depositResourceToStorage('0,0', 'stone', 239);
  depositResourceToStorage('0,0', 'grain', 1);
  jobSystem.init();

  tickAt(1_000);
  tickAt(61_000);

  assert.equal(resourceInventory.food, 0);
  assert.equal(resourceInventory.grain, 1);
  assert.equal(getWorkforceSnapshot().sites[0]?.status, 'storage_full');
});
