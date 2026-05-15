import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { loadSettlers, resetSettlerState, settlers } from '../../../src/shared/game/state/settlerStore';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { resetStudyState } from '../../../src/store/studyStore';
import { resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { settlerSystem } from './settlerSystem';

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
