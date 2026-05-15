import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import type { Settler } from '../../../src/shared/game/types/Settler';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import { depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { loadTestModeSettings, resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { ensureBarracksMilitaryState, ensureTownCenterMilitaryState } from '../../../src/shared/game/military.ts';
import { militarySystem } from './militarySystem';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { loadSettlers, resetSettlerState } from '../../../src/shared/game/state/settlerStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { resetStudyState } from '../../../src/store/studyStore';

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

function tickAt(now: number, dt: number) {
  militarySystem.tick({
    now,
    dt,
    tick: Math.floor(now / Math.max(1, dt)),
    rng: {} as never,
  });
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetTestModeSettings();
  resetPopulationState();
  resetSettlerState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetStudyState();
});

test('fast guard training test mode completes barracks training in one tenth the normal time', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_barracks', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: true,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  const townCenter = ensureTownCenterMilitaryState(tileIndex['0,0']);
  const barracks = ensureBarracksMilitaryState(tileIndex['1,0']);

  assert.ok(townCenter);
  assert.ok(barracks);

  barracks!.barracksTrainingQueue = 1;
  barracks!.barracksTrainingProgressMs = 0;
  depositResourceToStorage('0,0', 'food', 2);
  depositResourceToStorage('0,0', 'weapons', 1);

  tickAt(8_999, 8_999);

  assert.equal(barracks!.barracksTrainingQueue, 1);
  assert.equal(townCenter!.guardReserve ?? 0, 0);
  assert.equal(resourceInventory.food ?? 0, 2);
  assert.equal(resourceInventory.weapons ?? 0, 1);

  tickAt(9_000, 1);

  assert.equal(barracks!.barracksTrainingQueue, 0);
  assert.equal(barracks!.barracksTrainingProgressMs ?? 0, 0);
  assert.equal(townCenter!.guardReserve ?? 0, 1);
  assert.equal(resourceInventory.food ?? 0, 0);
  assert.equal(resourceInventory.weapons ?? 0, 0);
});

test('capturing a watchtower transfers nearby tower territory to the attacker', () => {
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '6,0',
      raidCommittedGuards: 1,
      guardReserve: 0,
    }),
    createTile({
      id: '6,0',
      q: 6,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      controlledBySettlementId: '12,0',
      ownerSettlementId: '12,0',
      towerAssignedGuards: 0,
      towerCaptureProgress: 99.8,
      towerDurability: 25,
      towerDurabilityMax: 100,
    }),
    createTile({
      id: '7,0',
      q: 7,
      r: 0,
      terrain: 'plains',
      controlledBySettlementId: '12,0',
      ownerSettlementId: '12,0',
    }),
    createTile({
      id: '12,0',
      q: 12,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '12,0',
      ownerSettlementId: '12,0',
      borderMode: 'open',
    }),
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
        settlementId: '12,0',
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
  loadSettlers([
    {
      id: 'raider-1',
      nameSeed: 1,
      q: 6,
      r: 0,
      facing: 'down',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '6,0',
      assignedRole: 'guard',
      guardTowerTileId: '6,0',
      workTileId: '6,0',
      hiddenWhileWorking: false,
      activity: 'working',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: [],
      drinkPreference: 'either',
      workProgressMs: 0,
      carryingKind: null,
      socialTileId: null,
    },
  ] satisfies Settler[]);

  tickAt(1_000, 1_000);

  assert.equal(tileIndex['6,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['6,0']?.controlledBySettlementId, '0,0');
  assert.equal(tileIndex['7,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['7,0']?.controlledBySettlementId, '0,0');
  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['0,0']?.guardReserve ?? 0, 1);
});

test('raid orders stay active while raiders are still being deployed', () => {
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '6,0',
      raidCommittedGuards: 2,
      guardReserve: 0,
    }),
    createTile({
      id: '6,0',
      q: 6,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      controlledBySettlementId: '12,0',
      ownerSettlementId: '12,0',
      towerAssignedGuards: 1,
      towerDurability: 100,
      towerDurabilityMax: 100,
    }),
    createTile({
      id: '12,0',
      q: 12,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '12,0',
      ownerSettlementId: '12,0',
      borderMode: 'open',
    }),
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
        settlementId: '12,0',
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

  tickAt(1_000, 1_000);

  assert.equal(tileIndex['0,0']?.raidTargetTileId, '6,0');
  assert.equal(tileIndex['0,0']?.raidCommittedGuards ?? 0, 2);
  assert.equal(tileIndex['6,0']?.towerAttackerSettlementId ?? null, '0,0');
});

test('adjacent raiders and defenders fight until the raid resolves', () => {
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '2,0',
      raidCommittedGuards: 2,
      guardReserve: 0,
    }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      controlledBySettlementId: '9,0',
      ownerSettlementId: '9,0',
    }),
    createTile({
      id: '2,0',
      q: 2,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      controlledBySettlementId: '9,0',
      ownerSettlementId: '9,0',
      towerAssignedGuards: 1,
      towerDurability: 100,
      towerDurabilityMax: 100,
    }),
    createTile({
      id: '9,0',
      q: 9,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '9,0',
      ownerSettlementId: '9,0',
      borderMode: 'open',
    }),
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
  loadSettlers([
    {
      id: 'raider-1',
      nameSeed: 1,
      q: 1,
      r: 0,
      facing: 'down',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'guard',
      guardTowerTileId: '2,0',
      workTileId: '2,0',
      hiddenWhileWorking: false,
      activity: 'raiding',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: [],
      drinkPreference: 'either',
      workProgressMs: 0,
      carryingKind: null,
      socialTileId: null,
    },
    {
      id: 'raider-2',
      nameSeed: 2,
      q: 1,
      r: 0,
      facing: 'down',
      appearanceSeed: 2,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'guard',
      guardTowerTileId: '2,0',
      workTileId: '2,0',
      hiddenWhileWorking: false,
      activity: 'raiding',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: [],
      drinkPreference: 'either',
      workProgressMs: 0,
      carryingKind: null,
      socialTileId: null,
    },
    {
      id: 'defender-1',
      nameSeed: 3,
      q: 1,
      r: 0,
      facing: 'down',
      appearanceSeed: 3,
      homeTileId: '9,0',
      homeAccessTileId: '9,0',
      settlementId: '9,0',
      assignedWorkTileId: '1,0',
      assignedRole: 'guard',
      guardTowerTileId: '2,0',
      workTileId: '2,0',
      hiddenWhileWorking: false,
      activity: 'defending',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      traits: [],
      drinkPreference: 'either',
      workProgressMs: 0,
      carryingKind: null,
      socialTileId: null,
    },
  ] satisfies Settler[]);

  tickAt(5_000, 5_000);
  assert.equal(tileIndex['2,0']?.towerAssignedGuards ?? 0, 0);
  assert.equal(tileIndex['0,0']?.raidCommittedGuards ?? 0, 1);

  tickAt(250_000, 245_000);
  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['2,0']?.ownerSettlementId, '0,0');
});
