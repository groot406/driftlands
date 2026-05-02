import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { loadSettlers, resetSettlerState, settlers } from '../../../src/shared/game/state/settlerStore';
import { depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { onGameplayEvent } from '../../../src/shared/gameplay/events';
import { loadTestModeSettings, resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { DRINK_PREFERENCES, SETTLER_TRAITS } from '../../../src/shared/game/settlerPreferences.ts';
import { settlerSystem } from './settlerSystem';

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
    jobSiteEnabled: overrides.jobSiteEnabled ?? null,
  };
}

function createTowncenterTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r'> = { id: '0,0', q: 0, r: 0 }): Tile {
  return createTile({
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    terrain: 'towncenter',
    controlledBySettlementId: overrides.controlledBySettlementId ?? overrides.id,
    ownerSettlementId: overrides.ownerSettlementId ?? overrides.id,
  });
}

function loadPopulation(current: number, beds: number) {
  loadPopulationSnapshot({
    current,
    max: Math.max(10, current, beds),
    beds,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });
}

function tickAt(now: number, dt: number = 1_000) {
  settlerSystem.tick({
    now,
    dt,
    tick: Math.floor(now / Math.max(1, dt)),
    rng: {} as never,
  });
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetPopulationState();
  resetSettlerState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetTestModeSettings();
});

test('new settlers spawn at a town center in their own settlement', () => {
  loadWorld([
    createTowncenterTile(),
    createTowncenterTile({ id: '20,0', q: 20, r: 0 }),
  ]);
  loadPopulationSnapshot({
    current: 1,
    max: 30,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 15,
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
        settlementId: '20,0',
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
      },
    ],
  });

  settlerSystem.tick({
    now: 1_000,
    dt: 1_000,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(settlers.length, 1);
  assert.equal(settlers[0]?.settlementId, '20,0');
  assert.equal(settlers[0]?.homeTileId, '20,0');
  assert.equal(settlers[0]?.q, 20);
  assert.equal(settlers[0]?.r, 0);
});

test('passive growth creates the settler in the settlement that grew', () => {
  loadWorld([
    createTowncenterTile(),
    createTowncenterTile({ id: '20,0', q: 20, r: 0 }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 30,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 15,
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
        settlementId: '20,0',
        current: 0,
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
      },
    ],
  });
  depositResourceToStorage('20,0', 'food', 1);
  settlerSystem.init();

  tickAt(Date.now() + 61_000, 1_000);

  assert.equal(settlers.length, 1);
  assert.equal(settlers[0]?.settlementId, '20,0');
  assert.equal(settlers[0]?.homeTileId, '20,0');
  assert.equal(settlers[0]?.q, 20);
  assert.equal(settlers[0]?.r, 0);
});

test('passive growth emits a settlement-scoped population change event', () => {
  loadWorld([
    createTowncenterTile(),
    createTowncenterTile({ id: '20,0', q: 20, r: 0 }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 30,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 15,
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
        settlementId: '20,0',
        current: 0,
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
      },
    ],
  });
  depositResourceToStorage('20,0', 'food', 1);
  const events: Array<{ type: string; settlementId?: string | null }> = [];
  const unsubscribe = onGameplayEvent((event) => events.push(event));

  try {
    settlerSystem.init();
    tickAt(Date.now() + 61_000, 1_000);
  } finally {
    unsubscribe();
  }

  assert.ok(events.some((event) => event.type === 'population:changed' && event.settlementId === '20,0'));
});

test('fast population growth test mode reduces the passive growth interval to 6 seconds', () => {
  loadWorld([
    createTowncenterTile(),
    createTowncenterTile({ id: '20,0', q: 20, r: 0 }),
  ]);
  loadPopulationSnapshot({
    current: 0,
    max: 30,
    beds: 1,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [
      {
        settlementId: '0,0',
        current: 0,
        max: 15,
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
        settlementId: '20,0',
        current: 0,
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
      },
    ],
  });
  depositResourceToStorage('20,0', 'food', 1);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: true,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });
  settlerSystem.init();

  tickAt(Date.now() + 6_000, 1_000);

  assert.equal(settlers.length, 1);
  assert.equal(settlers[0]?.settlementId, '20,0');
  assert.ok((settlers[0]?.traits?.length ?? 0) >= 1);
  assert.ok(SETTLER_TRAITS.includes(settlers[0]?.traits?.[0] ?? 'long_worker'));
  assert.ok(DRINK_PREFERENCES.includes(settlers[0]?.drinkPreference ?? 'either'));
});

test('appetite traits change how fast settlers become hungry', () => {
  loadWorld([createTowncenterTile()]);
  loadPopulation(2, 2);
  loadSettlers([
    {
      id: 'big-eater',
      q: 0,
      r: 0,
      facing: 'down',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: null,
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: ['big_eater'],
      drinkPreference: 'either',
      workProgressMs: 0,
      carryingKind: null,
    },
    {
      id: 'small-eater',
      q: 0,
      r: 0,
      facing: 'down',
      appearanceSeed: 2,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: null,
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: ['small_eater'],
      drinkPreference: 'either',
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  settlerSystem.init();

  tickAt(60_000, 60_000);

  assert.ok((settlers[0]?.hungerMs ?? 0) > (settlers[1]?.hungerMs ?? 0));
});

test('settlers prefer their favored pub drink when both options are stocked', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_pub' }),
  ]);
  loadPopulation(2, 2);
  loadSettlers([
    {
      id: 'wine-lover',
      q: 1,
      r: 0,
      facing: 'down',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: null,
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 40,
      traits: ['easy_to_please'],
      drinkPreference: 'wine',
      workProgressMs: 0,
      carryingKind: null,
    },
    {
      id: 'publican',
      q: 1,
      r: 0,
      facing: 'down',
      appearanceSeed: 2,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'job',
      activity: 'working',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: ['long_worker'],
      drinkPreference: 'beer',
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  depositResourceToStorage('0,0', 'beer', 1);
  depositResourceToStorage('0,0', 'wine', 1);
  settlerSystem.init();

  tickAt(1_000, 1_000);

  assert.equal(resourceInventory.wine, 0);
  assert.equal(resourceInventory.beer, 1);
  assert.equal(settlers[0]?.activity, 'socializing');
  assert.ok((settlers[0]?.happiness ?? 0) > 40);
});

test('settlers only consume food after they arrive at storage', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains' }),
  ]);
  loadPopulation(1, 1);
  loadSettlers([
    {
      id: 'settler-1',
      q: 1,
      r: 0,
      facing: 'left',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: null,
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 90_000,
      fatigueMs: 0,
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  depositResourceToStorage('0,0', 'food', 2);
  settlerSystem.init();

  tickAt(1_000, 1_000);
  assert.equal(resourceInventory.food, 2);
  assert.equal(settlers[0]?.movement?.target.q, 0);
  assert.equal(settlers[0]?.movement?.target.r, 0);

  tickAt(6_000, 5_000);
  assert.equal(resourceInventory.food, 1);
  assert.equal(settlers[0]?.hungerMs, 0);
  assert.equal(settlers[0]?.q, 0);
  assert.equal(settlers[0]?.r, 0);
});

test('job output reaches inventory only after a settler returns to storage', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp' }),
  ]);
  loadPopulation(1, 1);
  loadSettlers([
    {
      id: 'settler-1',
      q: 0,
      r: 0,
      facing: 'right',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);
  tickAt(62_000, 61_000);

  assert.equal(resourceInventory.wood, 0);
  assert.equal(settlers[0]?.carryingKind, 'output');
  assert.equal(settlers[0]?.movement?.target.q, 0);
  assert.equal(settlers[0]?.movement?.target.r, 0);

  tickAt(69_000, 7_000);
  assert.equal(resourceInventory.wood, 1);
  assert.equal(settlers[0]?.carryingPayload, undefined);
  assert.equal(settlers[0]?.q, 0);
  assert.equal(settlers[0]?.r, 0);
});

test('tired settlers go home to sleep before resuming work', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp' }),
  ]);
  loadPopulation(1, 1);
  loadSettlers([
    {
      id: 'settler-1',
      q: 1,
      r: 0,
      facing: 'left',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      activity: 'working',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 181_000,
      workProgressMs: 5_000,
      carryingKind: null,
    },
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);
  assert.equal(settlers[0]?.movement?.target.q, 0);
  assert.equal(settlers[0]?.activity, 'commuting_home');

  tickAt(7_000, 6_000);
  assert.equal(settlers[0]?.activity, 'sleeping');

  tickAt(53_000, 46_000);
  assert.equal(settlers[0]?.fatigueMs, 0);
  assert.equal(settlers[0]?.activity === 'sleeping', false);
});

test('settlers blocked by missing job inputs stay waiting instead of flickering idle', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(1, 1);
  loadSettlers([
    {
      id: 'settler-1',
      q: 0,
      r: 0,
      facing: 'right',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'job',
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  settlerSystem.init();

  tickAt(1_000, 1_000);
  assert.equal(settlers[0]?.activity, 'waiting');
  assert.deepEqual(settlers[0]?.blockerReason, {
    code: 'missing_input',
    resourceType: 'grain',
    amount: 1,
    tileId: '1,0',
  });

  tickAt(2_000, 1_000);
  assert.equal(settlers[0]?.activity, 'waiting');
  assert.equal(settlers[0]?.blockerReason?.code, 'missing_input');
});
