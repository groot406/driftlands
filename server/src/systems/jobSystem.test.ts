import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { getWorkforceSnapshot, resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { loadSettlers, resetSettlerState, settlers } from '../../../src/shared/game/state/settlerStore';
import { depositResourceToStorage, resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { getStudySnapshot, resetStudyState } from '../../../src/store/studyStore';
import { loadTestModeSettings, resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { jobSystem } from './jobSystem';
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

function createTowncenterTile(): Tile {
  return createTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
  });
}

function createSettlementPopulation(settlementId: string, current: number, beds: number, max: number = 15) {
  return {
    settlementId,
    current,
    max,
    beds,
    hungerMs: 0,
    supportCapacity: 0,
    ownedTileCount: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    fragileTileCount: 0,
    uncontrolledTileCount: 0,
    pressureState: 'stable' as const,
  };
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

function loadSettlementPopulation(settlements: ReturnType<typeof createSettlementPopulation>[]) {
  loadPopulationSnapshot({
    current: settlements.reduce((sum, settlement) => sum + settlement.current, 0),
    max: settlements.reduce((sum, settlement) => sum + settlement.max, 0),
    beds: settlements.reduce((sum, settlement) => sum + settlement.beds, 0),
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements,
  });
}

function createSettler(overrides: {
  id: string;
  q: number;
  r: number;
  settlementId: string;
  assignedWorkTileId?: string | null;
}) {
  return {
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    facing: 'down' as const,
    appearanceSeed: 1,
    homeTileId: overrides.settlementId,
    homeAccessTileId: overrides.settlementId,
    settlementId: overrides.settlementId,
    assignedWorkTileId: overrides.assignedWorkTileId ?? null,
    activity: 'idle' as const,
    stateSinceMs: 0,
    hungerMs: 0,
    fatigueMs: 0,
    happiness: 100,
    workProgressMs: 0,
    carryingKind: null,
  };
}

function tickAll(now: number, dt: number = 1_000) {
  settlerSystem.tick({
    now,
    dt,
    tick: Math.floor(now / Math.max(1, dt)),
    rng: {} as never,
  });
  jobSystem.tick({
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
  resetStudyState();
  resetTestModeSettings();
});

test('workforce snapshots reflect assigned settlers per site', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'forest', variant: 'forest_lumber_camp' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'grain', variant: 'grain_granary' }),
    createTile({ id: '3,0', q: 3, r: 0, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(2, 2);
  loadSettlers([
    {
      id: 'settler-1',
      q: 0,
      r: 0,
      facing: 'down',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      workProgressMs: 0,
      carryingKind: null,
    },
    {
      id: 'settler-2',
      q: 0,
      r: 0,
      facing: 'down',
      appearanceSeed: 2,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  jobSystem.init();

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.availableWorkers, 2);
  assert.equal(snapshot.assignedWorkers, 2);
  assert.equal(snapshot.idleWorkers, 0);
  assert.deepEqual(
    snapshot.sites.map((site) => ({ tileId: site.tileId, assignedWorkers: site.assignedWorkers })),
    [
      { tileId: '1,0', assignedWorkers: 1 },
      { tileId: '2,0', assignedWorkers: 1 },
      { tileId: '3,0', assignedWorkers: 0 },
    ],
  );
});

test('no workers can staff docks before houses provide beds', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'water', variant: 'water_dock_a' }),
  ]);
  loadPopulation(0, 0);
  loadSettlers([]);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.availableWorkers, 0);
  assert.equal(snapshot.assignedWorkers, 0);
  assert.equal(snapshot.idleWorkers, 0);
  assert.equal(snapshot.sites.find((site) => site.tileId === '1,0')?.assignedWorkers, 0);
  assert.equal(snapshot.sites.find((site) => site.tileId === '1,0')?.status, 'unstaffed');
});

test('settlers do not staff job sites owned by another settlement', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '20,0', q: 20, r: 0, terrain: 'towncenter', controlledBySettlementId: '20,0', ownerSettlementId: '20,0' }),
    createTile({ id: '21,0', q: 21, r: 0, terrain: 'water', variant: 'water_dock_a', controlledBySettlementId: '20,0', ownerSettlementId: '20,0' }),
  ]);
  loadSettlementPopulation([
    createSettlementPopulation('0,0', 1, 1),
    createSettlementPopulation('20,0', 0, 0),
  ]);
  loadSettlers([
    createSettler({ id: 'settler-1', q: 0, r: 0, settlementId: '0,0' }),
  ]);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);

  assert.equal(settlers[0]?.assignedWorkTileId ?? null, null);
  const snapshot = getWorkforceSnapshot();
  const dockSite = snapshot.sites.find((site) => site.tileId === '21,0');
  assert.equal(dockSite?.assignedWorkers, 0);
  assert.equal(dockSite?.status, 'unstaffed');
});

test('settlers do not take repair work from another settlement', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '20,0', q: 20, r: 0, terrain: 'towncenter', controlledBySettlementId: '20,0', ownerSettlementId: '20,0' }),
    createTile({
      id: '21,0',
      q: 21,
      r: 0,
      terrain: 'plains',
      variant: 'plains_house',
      controlledBySettlementId: '20,0',
      ownerSettlementId: '20,0',
      condition: 50,
      conditionState: 'worn',
    }),
  ]);
  loadSettlementPopulation([
    createSettlementPopulation('0,0', 1, 1),
    createSettlementPopulation('20,0', 0, 0),
  ]);
  loadSettlers([
    createSettler({ id: 'settler-1', q: 0, r: 0, settlementId: '0,0' }),
  ]);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);

  assert.equal(settlers[0]?.assignedRole ?? null, null);
  assert.equal(settlers[0]?.assignedWorkTileId ?? null, null);
});

test('job input status uses the owning settlement inventory', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '20,0', q: 20, r: 0, terrain: 'towncenter', controlledBySettlementId: '20,0', ownerSettlementId: '20,0' }),
    createTile({ id: '21,0', q: 21, r: 0, terrain: 'plains', variant: 'plains_bakery', controlledBySettlementId: '20,0', ownerSettlementId: '20,0' }),
  ]);
  loadSettlementPopulation([
    createSettlementPopulation('0,0', 0, 0),
    createSettlementPopulation('20,0', 1, 1),
  ]);
  loadSettlers([
    createSettler({ id: 'settler-1', q: 20, r: 0, settlementId: '20,0' }),
  ]);
  depositResourceToStorage('0,0', 'grain', 1);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);

  const bakerySite = getWorkforceSnapshot().sites.find((site) => site.tileId === '21,0');
  assert.equal(bakerySite?.assignedWorkers, 1);
  assert.equal(bakerySite?.status, 'missing_input');
  assert.deepEqual(bakerySite?.blockerReason, {
    code: 'missing_input',
    resourceType: 'grain',
    amount: 1,
    tileId: '21,0',
  });
});

test('settlers skip unreachable storage and fetch inputs from the next reachable storage', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({
      id: '2,0',
      q: 2,
      r: 0,
      terrain: 'plains',
      variant: 'plains_warehouse',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
    }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'water' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'plains' }),
    createTile({ id: '0,2', q: 0, r: 2, terrain: 'plains' }),
    createTile({ id: '0,3', q: 0, r: 3, terrain: 'plains', variant: 'plains_warehouse', controlledBySettlementId: '0,0', ownerSettlementId: '0,0' }),
    createTile({ id: '0,4', q: 0, r: 4, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(1, 1);
  loadSettlers([
    createSettler({ id: 'settler-1', q: 0, r: 0, settlementId: '0,0' }),
  ]);
  depositResourceToStorage('2,0', 'grain', 1);
  depositResourceToStorage('0,3', 'grain', 1);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);

  assert.equal(settlers[0]?.activity, 'fetching_input');
  assert.deepEqual(settlers[0]?.movement?.target, { q: 0, r: 3 });
  assert.equal(settlers[0]?.blockerReason ?? null, null);
});

test('settlers work docks from reachable shore access instead of entering a blocked dock side', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'water', variant: 'water_dock_d' }),
  ]);
  loadPopulation(1, 1);
  loadSettlers([
    createSettler({ id: 'settler-1', q: 0, r: 0, settlementId: '0,0' }),
  ]);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);

  assert.equal(settlers[0]?.assignedWorkTileId, '0,1');
  assert.equal(settlers[0]?.activity, 'working');
  assert.equal(settlers[0]?.blockerReason ?? null, null);
});

test('granary and bakery form a settler-driven production chain', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'grain', variant: 'grain_granary' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_bakery' }),
  ]);
  loadPopulation(2, 2);
  loadSettlers([
    {
      id: 'settler-1',
      q: 0,
      r: 0,
      facing: 'down',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      workProgressMs: 0,
      carryingKind: null,
    },
    {
      id: 'settler-2',
      q: 0,
      r: 0,
      facing: 'down',
      appearanceSeed: 2,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '2,0',
      activity: 'idle',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);
  tickAll(62_000, 61_000);
  tickAll(69_000, 7_000);
  tickAll(75_000, 6_000);
  tickAll(137_000, 62_000);
  tickAll(145_000, 8_000);

  assert.equal(resourceInventory.grain, 0);
  assert.equal(resourceInventory.food, 2);

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.assignedWorkers, 2);
  const bakerySite = snapshot.sites.find((site) => site.tileId === '2,0');
  assert.equal(bakerySite?.status, 'missing_input');
  assert.deepEqual(bakerySite?.blockerReason, {
    code: 'missing_input',
    resourceType: 'grain',
    amount: 1,
    tileId: '2,0',
  });
});

test('workshop turns ore into delivered tools', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_workshop' }),
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
  depositResourceToStorage('0,0', 'ore', 2);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);
  tickAll(7_000, 6_000);
  tickAll(68_000, 61_000);
  tickAll(75_000, 7_000);

  assert.equal(resourceInventory.ore, 0);
  assert.equal(resourceInventory.tools, 1);

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.sites.find((site) => site.tileId === '1,0')?.status, 'missing_input');
});

test('fast settler cycles test mode speeds production work up by 5x', () => {
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
      facing: 'right',
      appearanceSeed: 1,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: '1,0',
      workTileId: '1,0',
      activity: 'working',
      stateSinceMs: 0,
      hungerMs: 0,
      fatigueMs: 0,
      happiness: 100,
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: true,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });
  settlerSystem.init();
  jobSystem.init();

  tickAll(12_000, 12_000);

  assert.equal(settlers[0]?.carryingKind, 'output');
  assert.equal(settlers[0]?.carryingPayload?.type, 'wood');
});

test('library scholars advance the active study instead of producing resources', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_library' }),
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
  jobSystem.init();

  tickAll(1_000, 1_000);
  tickAll(62_000, 61_000);

  const study = getStudySnapshot().studies.find((entry) => entry.key === 'field_notebooks');
  assert.equal(study?.progressMs, 60_000);
  assert.equal(study?.completed, false);

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.sites.find((site) => site.tileId === '1,0')?.status, 'staffed');
});
