import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { getWorkforceSnapshot, resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { loadSettlers, resetSettlerState } from '../../../src/shared/game/state/settlerStore';
import { resetResourceState, resourceInventory } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
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

test('starter settlers can staff docks before any houses are built', () => {
  loadWorld([
    createTowncenterTile(),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'water', variant: 'water_dock_a' }),
  ]);
  loadPopulation(1, 0);
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
      assignedWorkTileId: null,
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

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.availableWorkers, 1);
  assert.equal(snapshot.assignedWorkers, 1);
  assert.equal(snapshot.idleWorkers, 0);
  assert.equal(snapshot.sites.find((site) => site.tileId === '1,0')?.assignedWorkers, 1);
  assert.equal(snapshot.sites.find((site) => site.tileId === '1,0')?.status, 'staffed');
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
      workProgressMs: 0,
      carryingKind: null,
    },
  ]);
  settlerSystem.init();
  jobSystem.init();

  tickAll(1_000, 1_000);
  tickAll(62_000, 61_000);
  tickAll(64_000, 2_000);
  tickAll(66_000, 2_000);
  tickAll(128_000, 62_000);
  tickAll(131_000, 3_000);

  assert.equal(resourceInventory.grain, 0);
  assert.equal(resourceInventory.food, 2);

  const snapshot = getWorkforceSnapshot();
  assert.equal(snapshot.assignedWorkers, 2);
  assert.equal(snapshot.sites.find((site) => site.tileId === '2,0')?.status, 'missing_input');
});
