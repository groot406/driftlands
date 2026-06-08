import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import type { Settler } from '../../../src/shared/game/types/Settler';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { loadSettlers, resetSettlerState, settlers } from '../../../src/shared/game/state/settlerStore';
import { depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { configurePathTelemetry } from '../../../src/shared/game/PathService';
import { resetStudyState } from '../../../src/store/studyStore';
import { loadTestModeSettings, resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { settlerSystem, syncSettlerPopulation } from './settlerSystem';

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
    towerAssignedGuards: overrides.towerAssignedGuards,
  };
}

function tickAt(now: number, dt: number) {
  settlerSystem.tick({
    now,
    dt,
    tick: Math.floor(now / Math.max(1, dt)),
    rng: {} as never,
  });
}

function createSettler(overrides: Partial<Settler> & Pick<Settler, 'id'>): Settler {
  return {
    id: overrides.id,
    nameSeed: overrides.nameSeed ?? 1000,
    gender: overrides.gender ?? 'male',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    facing: overrides.facing ?? 'down',
    appearanceSeed: overrides.appearanceSeed ?? 1,
    homeTileId: overrides.homeTileId ?? '0,0',
    homeAccessTileId: overrides.homeAccessTileId ?? '0,0',
    settlementId: overrides.settlementId ?? null,
    assignedWorkTileId: overrides.assignedWorkTileId ?? null,
    assignedRole: overrides.assignedRole ?? null,
    guardTowerTileId: overrides.guardTowerTileId ?? null,
    workTileId: overrides.workTileId ?? null,
    hiddenWhileWorking: overrides.hiddenWhileWorking ?? null,
    activity: overrides.activity ?? 'idle',
    blockerReason: overrides.blockerReason ?? null,
    stateSinceMs: overrides.stateSinceMs ?? 0,
    hungerMs: overrides.hungerMs ?? 0,
    fatigueMs: overrides.fatigueMs ?? 0,
    happiness: overrides.happiness ?? 100,
    traits: overrides.traits,
    drinkPreference: overrides.drinkPreference,
    workProgressMs: overrides.workProgressMs ?? 0,
    carryingKind: overrides.carryingKind ?? null,
    socialTileId: overrides.socialTileId ?? null,
    movement: overrides.movement,
    carryingPayload: overrides.carryingPayload,
  };
}

test.afterEach(() => {
  configurePathTelemetry(null);
  resetGameRuntime();
  loadWorld([]);
  resetResourceState();
  resetPopulationState();
  resetSettlerState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetStudyState();
  resetTestModeSettings();
});

test('settler and hunger population broadcasts are throttled while continuous hunger updates keep changing state', () => {
  const messages: Array<{ type: string; timestamp?: number }> = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message);
    },
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({ id: 'settler-1', settlementId: '0,0', hungerMs: 180_000 }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 100);
  tickAt(1_100, 100);
  tickAt(1_200, 100);
  tickAt(1_300, 100);

  const settlerMessages = messages.filter((message) => message.type === 'settlers:update' || message.type === 'settlers:patch');
  assert.deepEqual(settlerMessages.map((message) => message.timestamp), [1_000, 1_300]);
  assert.deepEqual(settlerMessages.map((message) => message.type), ['settlers:update', 'settlers:patch']);
  const populationUpdates = messages.filter((message) => message.type === 'population:update');
  assert.equal(populationUpdates.length, 2);
});

test('population sync preserves unassigned settler identities before creating replacements', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 6,
    max: 15,
    beds: 6,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 6,
      max: 15,
      beds: 6,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({ id: 'settler-1', settlementId: '0,0' }),
    createSettler({ id: 'settler-2', settlementId: '0,0' }),
    createSettler({ id: 'settler-3', settlementId: null }),
    createSettler({ id: 'settler-4', settlementId: null }),
    createSettler({ id: 'settler-5', settlementId: null }),
    createSettler({ id: 'settler-6', settlementId: null }),
  ]);

  syncSettlerPopulation(1_000);

  assert.deepEqual(settlers.map((settler) => settler.id), [
    'settler-1',
    'settler-2',
    'settler-3',
    'settler-4',
    'settler-5',
    'settler-6',
  ]);
  assert.deepEqual(settlers.map((settler) => settler.settlementId), [
    '0,0',
    '0,0',
    '0,0',
    '0,0',
    '0,0',
    '0,0',
  ]);
});

test('house trade goods are slowly consumed by residents for happiness', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_house',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      houseGoods: { silk: 1 },
      houseGoodsConsumedAtMs: 0,
    }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      settlementId: '0,0',
      homeTileId: '1,0',
      homeAccessTileId: '0,0',
      happiness: 40,
    }),
  ]);

  tickAt(180_001, 1);

  assert.equal(tileIndex['1,0']?.houseGoods?.silk, 0);
  assert.ok((settlers[0]?.happiness ?? 0) > 40);
});

test('fast settler cycles speed up house trade-good happiness recovery', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_house',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      houseGoods: { silk: 1 },
      houseGoodsConsumedAtMs: 0,
    }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      settlementId: '0,0',
      homeTileId: '1,0',
      homeAccessTileId: '0,0',
      happiness: 40,
    }),
  ]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: true,
    bypassHunger: true,
    bypassMorale: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: true,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  tickAt(36_001, 1_000);

  assert.equal(tileIndex['1,0']?.houseGoods?.silk, 0);
  assert.ok((settlers[0]?.happiness ?? 0) > 50);
});

test('settlers prioritize shopping for home goods before pub visits', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_pub', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'plains_shop', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 3,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 3,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 1,
      settlementId: '0,0',
      homeTileId: '2,0',
      homeAccessTileId: '1,0',
      happiness: 70,
    }),
    createSettler({
      id: 'publican',
      q: 1,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'job',
      activity: 'working',
    }),
    createSettler({
      id: 'shopkeeper',
      q: 0,
      r: 1,
      settlementId: '0,0',
      assignedWorkTileId: '0,1',
      assignedRole: 'job',
      activity: 'working',
    }),
  ]);
  depositResourceToStorage('0,0', 'beer', 1);
  depositResourceToStorage('0,0', 'silk', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'shopping');
  assert.equal(tileIndex['2,0']?.houseGoods?.silk, 1);
});

test('each pub visitor consumes one ordered drink from stock', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_pub', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 3,
    max: 15,
    beds: 3,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 3,
      max: 15,
      beds: 3,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 1,
      r: 0,
      settlementId: '0,0',
      happiness: 40,
      drinkPreference: 'beer',
    }),
    createSettler({
      id: 'settler-2',
      q: 1,
      r: 0,
      settlementId: '0,0',
      happiness: 45,
      drinkPreference: 'beer',
    }),
    createSettler({
      id: 'publican',
      q: 1,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'job',
      activity: 'working',
    }),
  ]);
  depositResourceToStorage('0,0', 'beer', 2);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'socializing');
  assert.equal(settlers[1]?.activity, 'socializing');
  assert.equal(resourceInventory.beer, 0);
});

test('shop venue movement reuses the reachable access path', () => {
  const pathEvents: Array<{ source?: string; cacheHit?: boolean }> = [];
  configurePathTelemetry((event) => {
    pathEvents.push(event);
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'plains_shop', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 2,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 2,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      homeTileId: '1,0',
      homeAccessTileId: '0,0',
      happiness: 70,
    }),
    createSettler({
      id: 'shopkeeper',
      q: 0,
      r: 1,
      settlementId: '0,0',
      assignedWorkTileId: '0,1',
      assignedRole: 'job',
      activity: 'working',
    }),
  ]);
  depositResourceToStorage('0,0', 'silk', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'commuting_shop');
  assert.equal(pathEvents.filter((event) => event.source === 'settler_reachability').length, 1);
  assert.equal(pathEvents.filter((event) => event.source === 'settler_movement' && event.cacheHit).length, 1);
});

test('settlers visit the nearest reachable staffed shop with capacity', () => {
  loadWorld([
    createTile({ id: '-1,0', q: -1, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_shop', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '3,-1', q: 3, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '4,-1', q: 4, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '5,-1', q: 5, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '6,-1', q: 6, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '7,-1', q: 7, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '8,-1', q: 8, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,-1', q: 9, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,0', q: 9, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '10,0', q: 10, r: 0, terrain: 'plains', variant: 'plains_shop', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 3,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 3,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      homeTileId: '-1,0',
      homeAccessTileId: '0,0',
      happiness: 70,
    }),
    createSettler({
      id: 'far-shopkeeper',
      q: 9,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '10,0',
      assignedRole: 'job',
      activity: 'working',
    }),
    createSettler({
      id: 'near-shopkeeper',
      q: 1,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      assignedRole: 'job',
      activity: 'working',
    }),
  ]);
  depositResourceToStorage('0,0', 'silk', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'commuting_shop');
  assert.equal(settlers[0]?.socialTileId, '2,0');
  assert.deepEqual(settlers[0]?.movement?.target, { q: 2, r: 0 });
});

test('settlers visit the nearest reachable staffed pub with capacity', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_pub', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '3,-1', q: 3, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '4,-1', q: 4, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '5,-1', q: 5, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '6,-1', q: 6, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '7,-1', q: 7, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '8,-1', q: 8, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,-1', q: 9, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,0', q: 9, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '10,0', q: 10, r: 0, terrain: 'plains', variant: 'plains_pub', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 3,
    max: 15,
    beds: 3,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 3,
      max: 15,
      beds: 3,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      happiness: 40,
    }),
    createSettler({
      id: 'far-publican',
      q: 9,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '10,0',
      assignedRole: 'job',
      activity: 'working',
    }),
    createSettler({
      id: 'near-publican',
      q: 1,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      assignedRole: 'job',
      activity: 'working',
    }),
  ]);
  depositResourceToStorage('0,0', 'beer', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'commuting_social');
  assert.equal(settlers[0]?.socialTileId, '2,0');
  assert.deepEqual(settlers[0]?.movement?.target, { q: 2, r: 0 });
});

test('hungry settlers choose the nearest reachable food storehouse', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_food_storehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '4,0', q: 4, r: 0, terrain: 'plains', variant: 'plains_food_storehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      hungerMs: 180_000,
    }),
  ]);
  depositResourceToStorage('1,0', 'meat', 1);
  depositResourceToStorage('4,0', 'meat', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'fetching_food');
  assert.deepEqual(settlers[0]?.movement?.target, { q: 1, r: 0 });
});

test('hungry settlers skip unreachable closer food storage for a reachable source', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'water', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_food_storehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,2', q: 0, r: 2, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,3', q: 0, r: 3, terrain: 'plains', variant: 'plains_food_storehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      hungerMs: 180_000,
    }),
  ]);
  depositResourceToStorage('2,0', 'meat', 1);
  depositResourceToStorage('0,3', 'meat', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'fetching_food');
  assert.deepEqual(settlers[0]?.movement?.target, { q: 0, r: 3 });
});

test('hungry settlers can cross physically reachable tiles even when settlement control is stale', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: 'other', ownerSettlementId: 'other' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_food_storehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      hungerMs: 180_000,
    }),
  ]);
  depositResourceToStorage('2,0', 'meat', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'fetching_food');
  assert.deepEqual(settlers[0]?.movement?.target, { q: 2, r: 0 });
  assert.equal(settlers[0]?.blockerReason ?? null, null);
});

test('blocked food reachability is rejected before pathfinding while cooldown holds', () => {
  const pathEvents: Array<{ source?: string }> = [];
  configurePathTelemetry((event) => {
    pathEvents.push(event);
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'water', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_warehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      hungerMs: 180_000,
    }),
  ]);
  depositResourceToStorage('2,0', 'meat', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);
  tickAt(1_500, 500);

  assert.equal(settlers[0]?.activity, 'waiting');
  assert.equal(settlers[0]?.blockerReason?.code, 'path_blocked');
  assert.equal(pathEvents.filter((event) => event.source === 'settler_reachability').length, 0);
});

test('blocked food reachability waits across several planning passes without pathfinding', () => {
  const pathEvents: Array<{ source?: string }> = [];
  configurePathTelemetry((event) => {
    pathEvents.push(event);
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'water', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_warehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      hungerMs: 180_000,
    }),
  ]);
  depositResourceToStorage('2,0', 'meat', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);
  tickAt(2_500, 1_500);
  tickAt(4_000, 1_500);

  assert.equal(settlers[0]?.activity, 'waiting');
  assert.equal(settlers[0]?.blockerReason?.code, 'path_blocked');
  assert.equal(pathEvents.filter((event) => event.source === 'settler_reachability').length, 0);
});

test('dock access selection stops after the nearest reachable tile', () => {
  const pathEvents: Array<{ source?: string }> = [];
  configurePathTelemetry((event) => {
    pathEvents.push(event);
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'water', variant: 'water_dock_d', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '-1,1', q: -1, r: 1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '0,1',
      assignedRole: 'job',
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'working');
  assert.equal(pathEvents.filter((event) => event.source === 'settler_reachability').length, 0);
});

test('unhomed settlers choose the nearest reachable open house slot', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'plains_food_storehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,0', q: 9, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '10,0', q: 10, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 4,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 4,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      homeTileId: 'missing-house',
      homeAccessTileId: 'missing-access',
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.homeTileId, '2,0');
  assert.equal(settlers[0]?.homeAccessTileId, '1,0');
});

test('settlers keep an existing valid home when a closer slot is open', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '3,0', q: 3, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '4,0', q: 4, r: 0, terrain: 'plains', variant: 'plains_house', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 4,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 4,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      homeTileId: '4,0',
      homeAccessTileId: '3,0',
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.homeTileId, '4,0');
  assert.equal(settlers[0]?.homeAccessTileId, '3,0');
});

test('unassigned idle settlers choose the nearest eligible open job site', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'water', variant: 'water_dock_a', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '3,-1', q: 3, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '4,-1', q: 4, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '5,-1', q: 5, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '6,-1', q: 6, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '7,-1', q: 7, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '8,-1', q: 8, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,-1', q: 9, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '9,0', q: 9, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '10,0', q: 10, r: 0, terrain: 'water', variant: 'water_dock_a', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers[0]?.assignedRole, 'job');
  assert.equal(settlers[0]?.assignedWorkTileId, '2,0');
});

test('idle job assignment does not steal active workers from valid sites', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'water', variant: 'water_dock_a', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '3,-1', q: 3, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '4,-1', q: 4, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '5,-1', q: 5, r: -1, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '5,0', q: 5, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '6,0', q: 6, r: 0, terrain: 'water', variant: 'water_dock_a', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 2,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 2,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'active-worker',
      q: 5,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '6,0',
      assignedRole: 'job',
      activity: 'working',
    }),
    createSettler({
      id: 'idle-worker',
      q: 0,
      r: 0,
      settlementId: '0,0',
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.find((settler) => settler.id === 'active-worker')?.assignedWorkTileId, '6,0');
  assert.equal(settlers.find((settler) => settler.id === 'idle-worker')?.assignedWorkTileId, '2,0');
});

test('working settlers stagger non-urgent planning while preserving accumulated work time', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 1,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'job',
      activity: 'idle',
      happiness: 60,
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 100);
  assert.equal(settlers[0]?.activity, 'working');
  assert.equal(settlers[0]?.workProgressMs, 100);

  tickAt(1_100, 100);
  assert.equal(settlers[0]?.workProgressMs, 100);

  tickAt(2_100, 1_000);
  assert.equal(settlers[0]?.workProgressMs, 1_200);
});

test('settler planning cap defers excess idle settlers without dropping accumulated planning time', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    ...Array.from({ length: 6 }, (_, index) => createTile({
      id: `${index + 1},0`,
      q: index + 1,
      r: 0,
      terrain: 'forest',
      variant: 'forest_lumber_camp',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
    })),
  ]);
  loadPopulationSnapshot({
    current: 6,
    max: 15,
    beds: 6,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 6,
      max: 15,
      beds: 6,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers(Array.from({ length: 6 }, (_, index) => createSettler({
    id: `settler-${index + 1}`,
    q: 0,
    r: 0,
    settlementId: '0,0',
    activity: 'idle',
    hungerMs: 0,
    fatigueMs: 0,
  })));
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.filter((settler) => settler.activity !== 'idle').length, 4);
  assert.equal(settlers.filter((settler) => settler.activity === 'idle').length, 2);

  tickAt(2_000, 1_000);

  assert.equal(settlers.filter((settler) => settler.activity !== 'idle').length, 6);
});

test('settlers report cached fixed route hits for repeated home commutes', () => {
  const pathEvents: Array<{ source?: string; cacheHit?: boolean }> = [];
  configurePathTelemetry((event) => {
    pathEvents.push(event);
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'forest', variant: 'forest_lumber_camp', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 1,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 2,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      assignedRole: 'job',
      activity: 'working',
      fatigueMs: 10 * 60_000,
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 100);
  assert.equal(settlers[0]?.activity, 'commuting_home');

  settlers[0]!.q = 2;
  settlers[0]!.r = 0;
  settlers[0]!.activity = 'working';
  settlers[0]!.movement = undefined;
  settlers[0]!.fatigueMs = 10 * 60_000;

  tickAt(2_000, 100);

  assert.equal(settlers[0]?.activity, 'commuting_home');
  assert.equal(pathEvents.filter((event) => event.source === 'settler_movement' && !event.cacheHit).length, 1);
  assert.equal(pathEvents.filter((event) => event.source === 'settler_movement' && event.cacheHit).length, 1);
});

test('settlers report shared cached fixed route hits across matching commutes', () => {
  const pathEvents: Array<{ source?: string; cacheHit?: boolean }> = [];
  configurePathTelemetry((event) => {
    pathEvents.push(event);
  });
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'forest', variant: 'forest_lumber_camp', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);
  loadPopulationSnapshot({
    current: 2,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 2,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      q: 2,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      assignedRole: 'job',
      activity: 'working',
      fatigueMs: 10 * 60_000,
    }),
    createSettler({
      id: 'settler-2',
      q: 2,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      assignedRole: 'job',
      activity: 'working',
      fatigueMs: 10 * 60_000,
    }),
  ]);
  settlerSystem.init();

  tickAt(1_000, 100);

  assert.equal(settlers[0]?.activity, 'commuting_home');
  assert.equal(settlers[1]?.activity, 'commuting_home');
  assert.equal(pathEvents.filter((event) => event.source === 'settler_movement' && !event.cacheHit).length, 1);
  assert.equal(pathEvents.filter((event) => event.source === 'settler_movement' && event.cacheHit).length, 1);
});

test('upgraded houses slowly restore resident happiness from comfort', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_glass_house',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      houseGoodsConsumedAtMs: 0,
    }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 6,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 6,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      settlementId: '0,0',
      homeTileId: '1,0',
      homeAccessTileId: '0,0',
      happiness: 40,
    }),
  ]);

  tickAt(180_001, 1);

  assert.ok((settlers[0]?.happiness ?? 0) > 43.9);
});

test('base houses provide a small passive happiness recovery', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_house',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      houseGoodsConsumedAtMs: 0,
    }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 1,
      max: 15,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([
    createSettler({
      id: 'settler-1',
      settlementId: '0,0',
      homeTileId: '1,0',
      homeAccessTileId: '0,0',
      happiness: 40,
    }),
  ]);

  tickAt(180_001, 1);

  assert.ok((settlers[0]?.happiness ?? 0) > 40.9);
});

test('population sync rebalances overfilled settlement buckets before creating replacements', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '20,0', q: 20, r: 0, terrain: 'towncenter', controlledBySettlementId: '20,0', ownerSettlementId: '20,0' }),
  ]);
  loadPopulationSnapshot({
    current: 6,
    max: 30,
    beds: 6,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 4,
        max: 15,
        beds: 4,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
      {
        settlementId: '20,0',
        current: 2,
        max: 15,
        beds: 2,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
    ],
  });
  loadSettlers([
    createSettler({ id: 'settler-1', settlementId: '0,0' }),
    createSettler({ id: 'settler-2', settlementId: '0,0' }),
    createSettler({ id: 'settler-3', settlementId: '20,0' }),
    createSettler({ id: 'settler-4', settlementId: '20,0' }),
    createSettler({ id: 'settler-5', settlementId: '20,0' }),
    createSettler({ id: 'settler-6', settlementId: '20,0' }),
  ]);

  syncSettlerPopulation(1_000);

  assert.deepEqual(settlers.map((settler) => settler.id), [
    'settler-1',
    'settler-2',
    'settler-3',
    'settler-4',
    'settler-5',
    'settler-6',
  ]);
  assert.equal(settlers.filter((settler) => settler.settlementId === '0,0').length, 4);
  assert.equal(settlers.filter((settler) => settler.settlementId === '20,0').length, 2);
});

test('assigned tower guards spawn visible garrison settlers and scale back when removed', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_watchtower', controlledBySettlementId: '0,0', ownerSettlementId: '0,0', towerAssignedGuards: 2 }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 0,
      max: 10,
      beds: 0,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.length, 2);
  assert.deepEqual(
    settlers.map((settler) => ({
      assignedRole: settler.assignedRole,
      guardTowerTileId: settler.guardTowerTileId,
      assignedWorkTileId: settler.assignedWorkTileId,
      activity: settler.activity,
    })),
    [
      { assignedRole: 'guard', guardTowerTileId: '2,0', assignedWorkTileId: '1,0', activity: 'commuting_work' },
      { assignedRole: 'guard', guardTowerTileId: '2,0', assignedWorkTileId: '1,0', activity: 'commuting_work' },
    ],
  );

  tickAt(5_000, 4_000);
  assert.deepEqual(settlers.map((settler) => settler.activity), ['idle', 'idle']);

  tileIndex['2,0']!.towerAssignedGuards = 1;
  tickAt(6_000, 1_000);

  assert.equal(settlers.length, 1);
  assert.equal(settlers[0]?.assignedRole, 'guard');
  assert.equal(settlers[0]?.guardTowerTileId, '2,0');
});

test('assigned tower guards spawn from the barracks that trained them', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '3,0', q: 3, r: 0, terrain: 'plains', variant: 'plains_barracks', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({
      id: '4,0',
      q: 4,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      towerAssignedGuards: 1,
      towerGuardOriginTileIds: ['3,0'],
    } as Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current: 0,
      max: 10,
      beds: 0,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
  loadSettlers([]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.length, 1);
  assert.equal(settlers[0]?.q, 3);
  assert.equal(settlers[0]?.r, 0);
  assert.equal(settlers[0]?.homeTileId, '3,0');
  assert.equal(settlers[0]?.homeAccessTileId, '3,0');
});

test('raid orders spawn visible guard settlers for a foreign watchtower', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0', raidTargetTileId: '2,0', raidCommittedGuards: 2 }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_watchtower', controlledBySettlementId: '9,0', ownerSettlementId: '9,0', towerAssignedGuards: 0 }),
    createTile({ id: '9,0', q: 9, r: 0, terrain: 'towncenter', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 10,
        beds: 0,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
      {
        settlementId: '9,0',
        current: 0,
        max: 10,
        beds: 0,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
    ],
  });
  loadSettlers([]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.length, 2);
  assert.deepEqual(
    settlers.map((settler) => ({
      assignedRole: settler.assignedRole,
      settlementId: settler.settlementId,
      guardTowerTileId: settler.guardTowerTileId,
      assignedWorkTileId: settler.assignedWorkTileId,
    })),
    [
      { assignedRole: 'guard', settlementId: '0,0', guardTowerTileId: '2,0', assignedWorkTileId: '1,0' },
      { assignedRole: 'guard', settlementId: '0,0', guardTowerTileId: '2,0', assignedWorkTileId: '1,0' },
    ],
  );

  const firstWaveIds = settlers.map((settler) => settler.id);
  tickAt(2_000, 1_000);

  assert.equal(settlers.length, 2);
  assert.deepEqual(settlers.map((settler) => settler.id), firstWaveIds);
});

test('watchtower raid settlers spread across reachable target access tiles', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0', raidTargetTileId: '2,0', raidCommittedGuards: 4 }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '1,1', q: 1, r: 1, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_watchtower', controlledBySettlementId: '9,0', ownerSettlementId: '9,0', towerAssignedGuards: 0 }),
    createTile({ id: '2,1', q: 2, r: 1, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '3,-1', q: 3, r: -1, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '3,0', q: 3, r: 0, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '9,0', q: 9, r: 0, terrain: 'towncenter', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 10,
        beds: 0,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
      {
        settlementId: '9,0',
        current: 0,
        max: 10,
        beds: 0,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
    ],
  });
  loadSettlers([]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.length, 4);
  assert.ok(new Set(settlers.map((settler) => settler.assignedWorkTileId)).size > 1);
  assert.equal(settlers.some((settler) => settler.assignedWorkTileId === '2,0'), false);
  assert.deepEqual(settlers.map((settler) => settler.combatHealth), [100, 100, 100, 100]);
  assert.deepEqual(settlers.map((settler) => settler.combatHealthMax), [100, 100, 100, 100]);
});

test('raid orders spawn visible guard settlers for a foreign town center', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0', raidTargetTileId: '2,0', raidCommittedGuards: 2 }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'towncenter', controlledBySettlementId: '9,0', ownerSettlementId: '9,0' }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 10,
        beds: 0,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
      {
        settlementId: '9,0',
        current: 0,
        max: 10,
        beds: 0,
        hungerMs: 0,
        supportCapacity: 0,
        ownedTileCount: 0,
        activeTileCount: 0,
        inactiveTileCount: 0,
        fragileTileCount: 0,
        uncontrolledTileCount: 0,
        pressureState: 'stable',
      },
    ],
  });
  loadSettlers([]);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(settlers.length, 2);
  assert.deepEqual(
    settlers.map((settler) => ({
      assignedRole: settler.assignedRole,
      settlementId: settler.settlementId,
      guardTowerTileId: settler.guardTowerTileId,
      assignedWorkTileId: settler.assignedWorkTileId,
    })),
    [
      { assignedRole: 'guard', settlementId: '0,0', guardTowerTileId: '2,0', assignedWorkTileId: '1,0' },
      { assignedRole: 'guard', settlementId: '0,0', guardTowerTileId: '2,0', assignedWorkTileId: '1,0' },
    ],
  );
  assert.deepEqual(settlers.map((settler) => settler.combatHealth), [100, 100]);
});
