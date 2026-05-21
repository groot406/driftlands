import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore';
import { loadTestModeSettings, resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { setIo } from '../messages/messageRouter';
import { FIRST_SHIP_ARRIVAL_MAX_MS, FIRST_SHIP_ARRIVAL_MIN_MS, SHIP_APPROACH_MS, shipOrderState } from './shipOrderState';

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    ...overrides,
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
    jobSiteEnabled: overrides.jobSiteEnabled ?? null,
  };
}

test.afterEach(() => {
  shipOrderState.reset();
  loadWorld([]);
  resetResourceState();
  resetTestModeSettings();
});

test('unlimited resources allow loading ship cargo without stored warehouse stock', () => {
  const emitted: unknown[] = [];
  setIo({ emit: (_event: string, message: unknown) => emitted.push(message) });

  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_harbor' }),
  ]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: true,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  shipOrderState.tick(1_000);
  const scheduledArrival = shipOrderState.getOverview().nextArrivalAt;
  assert.ok(scheduledArrival);
  assert.equal(shipOrderState.getOverview().activeOrder, null);
  assert.ok(scheduledArrival >= 1_000 + FIRST_SHIP_ARRIVAL_MIN_MS);
  assert.ok(scheduledArrival <= 1_000 + FIRST_SHIP_ARRIVAL_MAX_MS);

  shipOrderState.tick(scheduledArrival);
  assert.equal(shipOrderState.getOverview().activeOrder, null);
  assert.equal(shipOrderState.getOverview().visibleShip?.phase, 'approaching');

  shipOrderState.tick(scheduledArrival + SHIP_APPROACH_MS);
  const order = shipOrderState.getOverview().activeOrder;
  assert.ok(order);
  assert.equal(shipOrderState.getOverview().visibleShip?.phase, 'docked');

  const accepted = shipOrderState.contribute({
    settlementId: '0,0',
    playerId: 'player-1',
    playerName: 'Player 1',
    resources: { wood: 5 },
  });

  assert.equal(accepted, true);
  assert.equal(shipOrderState.getOverview().activeOrder?.fulfilled.wood, 5);
  assert.equal(emitted.some((message) => (message as { type?: string }).type === 'resource:withdraw'), false);
});

test('ship names are selected randomly instead of always starting with the first vessel', () => {
  const originalRandom = Math.random;
  const randomValues = [0, 0.99];
  Math.random = () => randomValues.shift() ?? 0.99;

  try {
    loadWorld([
      createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
      createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_harbor' }),
    ]);

    shipOrderState.tick(1_000);
    const scheduledArrival = shipOrderState.getOverview().nextArrivalAt;
    assert.ok(scheduledArrival);

    shipOrderState.tick(scheduledArrival);
    shipOrderState.tick(scheduledArrival + SHIP_APPROACH_MS);

    assert.equal(shipOrderState.getOverview().activeOrder?.name, 'Copper Gull');
  } finally {
    Math.random = originalRandom;
  }
});

test('each harbor can host its own owner-only ship order', () => {
  setIo({ emit() {} });

  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_harbor', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '10,0', q: 10, r: 0, terrain: 'towncenter', ownerSettlementId: '10,0', controlledBySettlementId: '10,0' }),
    createTile({ id: '11,0', q: 11, r: 0, terrain: 'plains', variant: 'plains_harbor', ownerSettlementId: '10,0', controlledBySettlementId: '10,0' }),
  ]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: true,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  shipOrderState.tick(1_000);
  const arrivals = Object.values(shipOrderState.getOverview().nextArrivals);
  assert.equal(arrivals.length, 2);

  const arrivalAt = Math.max(...arrivals);
  shipOrderState.tick(arrivalAt);
  assert.equal(shipOrderState.getOverview().visibleShips.length, 2);

  shipOrderState.tick(arrivalAt + SHIP_APPROACH_MS);
  const activeOrders = shipOrderState.getOverview().activeOrders;
  assert.equal(activeOrders.length, 2);

  const firstOrder = activeOrders.find((order) => order.harborTileId === '1,0');
  const secondOrder = activeOrders.find((order) => order.harborTileId === '11,0');
  assert.ok(firstOrder);
  assert.ok(secondOrder);

  assert.equal(shipOrderState.loadCargo({
    orderId: firstOrder.id,
    settlementId: '10,0',
    playerId: 'player-2',
    playerName: 'Player 2',
    resources: { wood: 5 },
  }), false);

  assert.equal(shipOrderState.loadCargo({
    orderId: firstOrder.id,
    settlementId: '0,0',
    playerId: 'player-1',
    playerName: 'Player 1',
    resources: { wood: 5 },
  }), true);

  const updatedFirstOrder = shipOrderState.getOverview().activeOrders.find((order) => order.id === firstOrder.id);
  const updatedSecondOrder = shipOrderState.getOverview().activeOrders.find((order) => order.id === secondOrder.id);
  assert.equal(updatedFirstOrder?.fulfilled.wood, 5);
  assert.equal(updatedSecondOrder?.fulfilled.wood, undefined);
});
