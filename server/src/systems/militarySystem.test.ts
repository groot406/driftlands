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
import { loadSettlers, resetSettlerState, settlers } from '../../../src/shared/game/state/settlerStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { resetStudyState } from '../../../src/store/studyStore';
import { onGameplayEvent } from '../../../src/shared/gameplay/events.ts';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { playerSettlementState } from '../state/playerSettlementState.ts';

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

function loadPopulationForSettlements(settlementIds: string[]) {
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: settlementIds.map((settlementId) => ({
      settlementId,
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
    })),
  });
}

function createGuardSettler(overrides: Partial<Settler> & Pick<Settler, 'id' | 'q' | 'r' | 'settlementId' | 'assignedWorkTileId' | 'guardTowerTileId'>): Settler {
  return {
    id: overrides.id,
    nameSeed: overrides.nameSeed ?? 1,
    q: overrides.q,
    r: overrides.r,
    facing: overrides.facing ?? 'down',
    appearanceSeed: overrides.appearanceSeed ?? 1,
    homeTileId: overrides.homeTileId ?? overrides.settlementId ?? '0,0',
    homeAccessTileId: overrides.homeAccessTileId ?? overrides.settlementId ?? '0,0',
    settlementId: overrides.settlementId,
    assignedWorkTileId: overrides.assignedWorkTileId,
    assignedRole: 'guard',
    guardTowerTileId: overrides.guardTowerTileId,
    workTileId: overrides.workTileId ?? overrides.guardTowerTileId,
    hiddenWhileWorking: overrides.hiddenWhileWorking ?? false,
    activity: overrides.activity ?? 'raiding',
    stateSinceMs: overrides.stateSinceMs ?? 0,
    hungerMs: overrides.hungerMs ?? 0,
    fatigueMs: overrides.fatigueMs ?? 0,
    happiness: overrides.happiness ?? 100,
    traits: overrides.traits ?? [],
    drinkPreference: overrides.drinkPreference ?? 'either',
    workProgressMs: overrides.workProgressMs ?? 0,
    carryingKind: overrides.carryingKind ?? null,
    socialTileId: overrides.socialTileId ?? null,
    combatHealth: overrides.combatHealth,
    combatHealthMax: overrides.combatHealthMax,
  };
}

test.afterEach(() => {
  resetGameRuntime();
  loadWorld([]);
  resetResourceState();
  resetTestModeSettings();
  resetPopulationState();
  resetSettlerState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetStudyState();
  playerSettlementState.reset();
});

test('staffed watchtower arrow fire damages an in-range raider and broadcasts settler health', () => {
  const messages: Array<{ type: string; settlers?: Settler[] }> = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message as { type: string; settlers?: Settler[] });
    },
  });
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '4,0',
      raidCommittedGuards: 1,
      guardReserve: 0,
    }),
    createTile({
      id: '4,0',
      q: 4,
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
  loadPopulationForSettlements(['0,0', '9,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '3,0',
      guardTowerTileId: '4,0',
      combatHealth: 100,
      combatHealthMax: 100,
    }),
    createGuardSettler({
      id: 'defender-1',
      q: 4,
      r: 0,
      settlementId: '9,0',
      assignedWorkTileId: '4,0',
      guardTowerTileId: '4,0',
      activity: 'defending',
    }),
  ]);

  tickAt(1_000, 1_000);

  const raider = settlers.find((settler) => settler.id === 'raider-1');
  assert.ok(raider);
  assert.equal(raider.combatHealthMax, 100);
  assert.equal(raider.combatHealth, 88);
  const settlerUpdate = messages.find((message) => message.type === 'settlers:update');
  assert.ok(settlerUpdate);
  assert.equal(settlerUpdate.settlers?.find((settler) => settler.id === 'raider-1')?.combatHealth, 88);
});

test('watchtower arrow fire spreads volley damage across in-range raiders', () => {
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '4,0',
      raidCommittedGuards: 2,
      guardReserve: 0,
    }),
    createTile({
      id: '4,0',
      q: 4,
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
  loadPopulationForSettlements(['0,0', '9,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 3,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '3,0',
      guardTowerTileId: '4,0',
      combatHealth: 100,
      combatHealthMax: 100,
    }),
    createGuardSettler({
      id: 'raider-2',
      q: 4,
      r: -1,
      settlementId: '0,0',
      assignedWorkTileId: '4,-1',
      guardTowerTileId: '4,0',
      combatHealth: 100,
      combatHealthMax: 100,
    }),
    createGuardSettler({
      id: 'defender-1',
      q: 4,
      r: 0,
      settlementId: '9,0',
      assignedWorkTileId: '4,0',
      guardTowerTileId: '4,0',
      activity: 'defending',
    }),
  ]);

  tickAt(1_000, 1_000);

  assert.equal(settlers.find((settler) => settler.id === 'raider-1')?.combatHealth, 94);
  assert.equal(settlers.find((settler) => settler.id === 'raider-2')?.combatHealth, 94);
});

test('watchtower arrow fire kills a low-health raider and clears an empty raid', () => {
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '4,0',
      raidCommittedGuards: 1,
      raidGuardOriginTileIds: ['1,0'],
      guardReserve: 0,
    }),
    createTile({
      id: '4,0',
      q: 4,
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
  loadPopulationForSettlements(['0,0', '9,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '3,0',
      guardTowerTileId: '4,0',
      combatHealth: 5,
      combatHealthMax: 100,
    }),
    createGuardSettler({
      id: 'defender-1',
      q: 4,
      r: 0,
      settlementId: '9,0',
      assignedWorkTileId: '4,0',
      guardTowerTileId: '4,0',
      activity: 'defending',
    }),
  ]);

  tickAt(1_000, 1_000);

  assert.equal(settlers.some((settler) => settler.id === 'raider-1'), false);
  assert.equal(tileIndex['0,0']?.raidCommittedGuards ?? 0, 0);
  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['4,0']?.ownerSettlementId, '9,0');
});

test('assigned watchtower guards do not fire until a defender has arrived', () => {
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '4,0',
      raidCommittedGuards: 1,
      guardReserve: 0,
    }),
    createTile({
      id: '4,0',
      q: 4,
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
  loadPopulationForSettlements(['0,0', '9,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 0,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '3,0',
      guardTowerTileId: '4,0',
      combatHealth: 100,
      combatHealthMax: 100,
    }),
  ]);

  tickAt(1_000, 1_000);

  assert.equal(settlers.find((settler) => settler.id === 'raider-1')?.combatHealth, 100);
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
  depositResourceToStorage('0,0', 'meat', 2);
  depositResourceToStorage('0,0', 'weapons', 1);

  tickAt(8_999, 8_999);

  assert.equal(barracks!.barracksTrainingQueue, 1);
  assert.equal(townCenter!.guardReserve ?? 0, 0);
  assert.equal(resourceInventory.meat ?? 0, 2);
  assert.equal(resourceInventory.weapons ?? 0, 1);

  tickAt(9_000, 1);

  assert.equal(barracks!.barracksTrainingQueue, 0);
  assert.equal(barracks!.barracksTrainingProgressMs ?? 0, 0);
  assert.equal(townCenter!.guardReserve ?? 0, 0);
  assert.equal(barracks!.guardReserve ?? 0, 1);
  assert.equal(resourceInventory.meat ?? 0, 0);
  assert.equal(resourceInventory.weapons ?? 0, 0);
});

test('guard training can spend any food source', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_barracks', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
  ]);

  const townCenter = ensureTownCenterMilitaryState(tileIndex['0,0']);
  const barracks = ensureBarracksMilitaryState(tileIndex['1,0']);

  assert.ok(townCenter);
  assert.ok(barracks);

  barracks!.barracksTrainingQueue = 1;
  barracks!.barracksTrainingProgressMs = 90_000;
  depositResourceToStorage('0,0', 'meat', 2);
  depositResourceToStorage('0,0', 'weapons', 1);

  tickAt(90_000, 1);

  assert.equal(barracks!.barracksTrainingQueue, 0);
  assert.equal(townCenter!.guardReserve ?? 0, 0);
  assert.equal(barracks!.guardReserve ?? 0, 1);
  assert.equal(resourceInventory.meat ?? 0, 0);
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
      raidGuardOriginTileIds: ['1,0'],
      guardReserve: 0,
    }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_barracks',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
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
      id: '8,0',
      q: 8,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      controlledBySettlementId: '12,0',
      ownerSettlementId: '12,0',
    }),
    createTile({
      id: '9,0',
      q: 9,
      r: 0,
      terrain: 'water',
      variant: 'water_beacon',
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
  assert.equal(tileIndex['8,0']?.ownerSettlementId, '12,0');
  assert.equal(tileIndex['8,0']?.controlledBySettlementId, '12,0');
  assert.equal(tileIndex['9,0']?.ownerSettlementId, '12,0');
  assert.equal(tileIndex['9,0']?.controlledBySettlementId, '12,0');
  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['0,0']?.guardReserve ?? 0, 0);
  assert.equal(tileIndex['1,0']?.guardReserve ?? 0, 1);
});

test('watchtower raids can progress inside the defender town center safe radius', () => {
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
      raidCommittedGuards: 1,
      guardReserve: 0,
    }),
    createTile({
      id: '2,0',
      q: 2,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      controlledBySettlementId: '4,0',
      ownerSettlementId: '4,0',
      towerAssignedGuards: 0,
      towerCaptureProgress: 0,
      towerDurability: 100,
      towerDurabilityMax: 100,
    }),
    createTile({
      id: '4,0',
      q: 4,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '4,0',
      ownerSettlementId: '4,0',
      borderMode: 'open',
    }),
  ]);
  loadPopulationForSettlements(['0,0', '4,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 1,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      guardTowerTileId: '2,0',
    }),
  ]);

  tickAt(1_000, 1_000);

  assert.equal(tileIndex['0,0']?.raidTargetTileId, '2,0');
  assert.equal(tileIndex['2,0']?.towerAttackerSettlementId, '0,0');
  assert.ok((tileIndex['2,0']?.towerCaptureProgress ?? 0) > 0);
});

test('raids can capture town centers and transfer the defeated settlement territory', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const unsubscribe = onGameplayEvent((event) => events.push(event));
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
      raidGuardOriginTileIds: ['1,0'],
      guardReserve: 0,
    }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_barracks',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      guardReserve: 0,
    }),
    createTile({
      id: '5,0',
      q: 5,
      r: 0,
      terrain: 'plains',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
    }),
    createTile({
      id: '6,0',
      q: 6,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
      towerCaptureProgress: 99.95,
      towerDurability: 120,
      towerDurabilityMax: 300,
    }),
    createTile({
      id: '7,0',
      q: 7,
      r: 0,
      terrain: 'plains',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
    }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 5,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '5,0',
      guardTowerTileId: '6,0',
      workTileId: '6,0',
    }),
  ]);

  try {
    tickAt(1_000, 1_000);
  } finally {
    unsubscribe();
  }

  assert.equal(tileIndex['6,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['6,0']?.controlledBySettlementId, '0,0');
  assert.equal(tileIndex['7,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['7,0']?.controlledBySettlementId, '0,0');
  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['0,0']?.guardReserve ?? 0, 0);
  assert.equal(tileIndex['1,0']?.guardReserve ?? 0, 1);
  assert.deepEqual(events.find((event) => event.type === 'military:settlement_defeated'), {
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0', '5,0', '7,0'],
    defeatedAt: 1_000,
  });
});

test('capturing one of multiple town centers does not defeat the defender', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const unsubscribe = onGameplayEvent((event) => events.push(event));
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      raidTargetTileId: '8,0',
      raidCommittedGuards: 1,
      raidGuardOriginTileIds: ['1,0'],
      guardReserve: 0,
    }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_barracks',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      guardReserve: 0,
    }),
    createTile({
      id: '6,0',
      q: 6,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
      towerCaptureProgress: 99.95,
      towerDurability: 120,
      towerDurabilityMax: 300,
    }),
    createTile({
      id: '8,0',
      q: 8,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
      towerCaptureProgress: 99.95,
      towerDurability: 120,
      towerDurabilityMax: 300,
    }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 7,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '7,0',
      guardTowerTileId: '8,0',
      workTileId: '8,0',
    }),
  ]);

  try {
    tickAt(1_000, 1_000);
  } finally {
    unsubscribe();
  }

  assert.equal(tileIndex['6,0']?.ownerSettlementId, '6,0');
  assert.equal(tileIndex['8,0']?.ownerSettlementId, '0,0');
  assert.equal(events.some((event) => event.type === 'military:settlement_defeated'), false);
});

test('capturing the home town center defeats a defender with secondary captured town centers', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const unsubscribe = onGameplayEvent((event) => events.push(event));
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
      raidGuardOriginTileIds: ['1,0'],
      guardReserve: 0,
    }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_barracks',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      guardReserve: 0,
    }),
    createTile({
      id: '6,0',
      q: 6,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
      towerCaptureProgress: 99.95,
      towerDurability: 120,
      towerDurabilityMax: 300,
    }),
    createTile({
      id: '8,0',
      q: 8,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
    }),
    createTile({
      id: '9,0',
      q: 9,
      r: 0,
      terrain: 'plains',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
    }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 5,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '5,0',
      guardTowerTileId: '6,0',
      workTileId: '6,0',
    }),
  ]);

  try {
    tickAt(1_000, 1_000);
  } finally {
    unsubscribe();
  }

  assert.equal(tileIndex['6,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['8,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['9,0']?.ownerSettlementId, '0,0');
  assert.deepEqual(events.find((event) => event.type === 'military:settlement_defeated'), {
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0', '8,0', '9,0'],
    defeatedAt: 1_000,
  });
});

test('already captured home town centers are reconciled into settlement defeats', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const unsubscribe = onGameplayEvent((event) => events.push(event));
  playerSettlementState.registerPlayer('socket-attacker', 'attacker-player', 'Attacker');
  playerSettlementState.registerPlayer('socket-defender', 'defender-player', 'Defender');
  assert.equal(playerSettlementState.assignPlayerSettlement('attacker-player', '0,0'), true);
  assert.equal(playerSettlementState.assignPlayerSettlement('defender-player', '6,0'), true);
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
    }),
    createTile({
      id: '6,0',
      q: 6,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      borderMode: 'open',
      towerCaptureProgress: 0,
      towerDurability: 90,
      towerDurabilityMax: 300,
    }),
    createTile({
      id: '8,0',
      q: 8,
      r: 0,
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
    }),
    createTile({
      id: '9,0',
      q: 9,
      r: 0,
      terrain: 'plains',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
    }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  loadSettlers([]);

  try {
    tickAt(1_000, 1_000);
  } finally {
    unsubscribe();
  }

  assert.equal(tileIndex['8,0']?.ownerSettlementId, '0,0');
  assert.equal(tileIndex['9,0']?.ownerSettlementId, '0,0');
  assert.deepEqual(events.find((event) => event.type === 'military:settlement_defeated'), {
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0', '8,0', '9,0'],
    defeatedAt: 1_000,
  });
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
  assert.equal(tileIndex['0,0']?.raidCommittedGuards ?? 0, 2);
  assert.equal(settlers.find((settler) => settler.id === 'raider-1')?.combatHealth, 70);
  assert.equal(settlers.find((settler) => settler.id === 'raider-2')?.combatHealth, 70);

  tickAt(250_000, 245_000);
  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['2,0']?.ownerSettlementId, '0,0');
});

test('town center reserve guards automatically defend against capture raids', () => {
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
      terrain: 'towncenter',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      borderMode: 'open',
      guardReserve: 0,
      towerCaptureProgress: 0,
      towerDurability: 300,
      towerDurabilityMax: 300,
    }),
    createTile({
      id: '6,1',
      q: 6,
      r: 1,
      terrain: 'plains',
      variant: 'plains_barracks',
      controlledBySettlementId: '6,0',
      ownerSettlementId: '6,0',
      guardReserve: 5,
    }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  loadSettlers([
    createGuardSettler({
      id: 'raider-1',
      q: 5,
      r: 0,
      settlementId: '0,0',
      assignedWorkTileId: '5,0',
      guardTowerTileId: '6,0',
      workTileId: '6,0',
    }),
  ]);

  tickAt(1_200, 1_200);

  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['0,0']?.raidCommittedGuards ?? 0, 0);
  assert.equal(tileIndex['6,0']?.ownerSettlementId, '6,0');
  assert.equal(tileIndex['6,0']?.towerCaptureProgress ?? 0, 0);
  assert.equal(tileIndex['6,0']?.guardReserve ?? 0, 0);
  assert.equal(tileIndex['6,1']?.guardReserve ?? 0, 5);
  assert.equal(settlers.some((settler) => settler.id === 'raider-1'), false);
});
