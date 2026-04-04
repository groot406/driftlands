import test from 'node:test';
import assert from 'node:assert/strict';

import type { BaseMessage, ResourceWithdrawMessage } from '../../../src/shared/protocol';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { loadWorld } from '../../../src/shared/game/world';
import { loadPopulationSnapshot, resetPopulationState, getPopulationState } from '../../../src/shared/game/state/populationStore';
import { depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
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

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetPopulationState();
  resetSettlementSupportState();
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
