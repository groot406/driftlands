import test from 'node:test';
import assert from 'node:assert/strict';

import type { BaseMessage, ResourceWithdrawMessage } from '../../../src/shared/protocol';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { loadWorld } from '../../../src/shared/game/world';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { loadPopulationSnapshot, resetPopulationState, getPopulationState } from '../../../src/shared/game/state/populationStore';
import { depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { jobSystem } from './jobSystem';
import { populationSystem } from './populationSystem';

function captureBroadcasts() {
  const messages: BaseMessage[] = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message);
    },
  });
  return messages;
}

function createTowncenterTile(): Tile {
  return {
    id: '0,0',
    q: 0,
    r: 0,
    biome: 'plains',
    terrain: 'towncenter',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    variant: null,
  };
}

function createDockTile(): Tile {
  return {
    id: '0,1',
    q: 0,
    r: 1,
    biome: 'lake',
    terrain: 'water',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    supportBand: 'stable',
    variant: 'water_dock_a',
  };
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetPopulationState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetGameRuntime();
});

test('population upkeep broadcasts the food withdrawn for the colony meal tick', () => {
  loadWorld([createTowncenterTile()]);
  depositResourceToStorage('0,0', 'food', 5);
  loadPopulationSnapshot({
    current: 2,
    max: 2,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  const broadcasts = captureBroadcasts();
  const start = Date.now();
  populationSystem.init();

  populationSystem.tick({
    now: start + 60_000,
    dt: 60_000,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(resourceInventory.food, 3);
  assert.deepEqual(
    broadcasts.filter((message) => message.type === 'resource:withdraw'),
    [
      {
        type: 'resource:withdraw',
        heroId: 'colony',
        storageTileId: '0,0',
        resource: { type: 'food', amount: 2 },
      } satisfies ResourceWithdrawMessage,
    ],
  );
});

test('starving settlers recover immediately once enough food reaches storage', () => {
  loadWorld([createTowncenterTile()]);
  depositResourceToStorage('0,0', 'food', 6);
  loadPopulationSnapshot({
    current: 2,
    max: 10,
    beds: 10,
    hungerMs: 120_000,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  const broadcasts = captureBroadcasts();
  const start = Date.now();
  populationSystem.init();

  populationSystem.tick({
    now: start + 1_000,
    dt: 1_000,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(getPopulationState().hungerMs, 0);
  assert.equal(resourceInventory.food, 4);
  assert.equal(
    broadcasts.some((message) => message.type === 'population:update'),
    true,
  );
});

test('population growth requires enough reserve for the next larger colony meal', () => {
  loadWorld([createTowncenterTile()]);
  depositResourceToStorage('0,0', 'food', 4);
  loadPopulationSnapshot({
    current: 2,
    max: 10,
    beds: 10,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  const start = Date.now();
  populationSystem.init();

  populationSystem.tick({
    now: start + 60_000,
    dt: 60_000,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(getPopulationState().current, 2);
  assert.equal(resourceInventory.food, 2);
});

test('a hungry colony settles at the population its staffed food jobs can sustain', () => {
  loadWorld([createTowncenterTile(), createDockTile()]);
  loadPopulationSnapshot({
    current: 4,
    max: 10,
    beds: 10,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });

  const start = Date.now();
  populationSystem.init();
  jobSystem.init();

  for (let minute = 1; minute <= 7; minute++) {
    const now = start + (minute * 60_000);
    populationSystem.tick({
      now,
      dt: 60_000,
      tick: minute,
      rng: {} as never,
    });
    jobSystem.tick({
      now,
      dt: 60_000,
      tick: minute,
      rng: {} as never,
    });
  }

  assert.equal(getPopulationState().current, 2);
  assert.equal(getPopulationState().hungerMs, 0);
  assert.equal(resourceInventory.food, 2);
});
