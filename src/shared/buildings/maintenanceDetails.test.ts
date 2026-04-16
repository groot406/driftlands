import test from 'node:test';
import assert from 'node:assert/strict';
import type { Settler } from '../../core/types/Settler.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { getConditionLabel, getConditionStatusText, getMaintenanceOverview } from './maintenanceDetails.ts';

function createTile(overrides: Partial<Tile>): Tile {
  return {
    id: overrides.id ?? '0,0',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    terrain: overrides.terrain ?? 'forest',
    variant: overrides.variant ?? 'forest_lumber_camp',
    biome: overrides.biome ?? 'forest',
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    condition: overrides.condition ?? 100,
    conditionState: overrides.conditionState ?? null,
    ...overrides,
  };
}

function createSettler(overrides: Partial<Settler>): Settler {
  return {
    id: overrides.id ?? 'settler-1',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    facing: overrides.facing ?? 'down',
    appearanceSeed: overrides.appearanceSeed ?? 1,
    homeTileId: overrides.homeTileId ?? '0,0',
    homeAccessTileId: overrides.homeAccessTileId ?? '0,1',
    settlementId: overrides.settlementId ?? 'settlement:0,0',
    activity: overrides.activity ?? 'idle',
    stateSinceMs: overrides.stateSinceMs ?? 0,
    hungerMs: overrides.hungerMs ?? 0,
    fatigueMs: overrides.fatigueMs ?? 0,
    workProgressMs: overrides.workProgressMs ?? 0,
    assignedWorkTileId: overrides.assignedWorkTileId ?? null,
    assignedRole: overrides.assignedRole ?? null,
    workTileId: overrides.workTileId ?? null,
    hiddenWhileWorking: overrides.hiddenWhileWorking ?? null,
    carryingKind: overrides.carryingKind ?? null,
    ...overrides,
  };
}

test('maintenance overview summarizes damage, backlog, and repair crews', () => {
  const tiles = [
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'forest', variant: 'forest_lumber_camp', condition: 60 }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_bakery', condition: 12 }),
  ];
  const settlers = [
    createSettler({ id: 'repairer', assignedRole: 'repair', activity: 'repairing', assignedWorkTileId: '1,0' }),
  ];

  const summary = getMaintenanceOverview(tiles, settlers, { wood: 1, stone: 0 });

  assert.equal(summary.maintainedCount, 2);
  assert.equal(summary.needsRepairCount, 2);
  assert.equal(summary.offlineCount, 1);
  assert.equal(summary.wornCount, 1);
  assert.equal(summary.assignedRepairers, 1);
  assert.equal(summary.repairingNow, 1);
  assert.equal(summary.crewDemand, 2);
  assert.equal(summary.uncoveredTargets, 1);
  assert.equal(summary.backlogCycles, 5);
  assert.deepEqual(summary.backlogResources, [
    { type: 'stone', amount: 3, available: 0, shortfall: 3 },
    { type: 'wood', amount: 2, available: 1, shortfall: 1 },
  ]);
  assert.equal(summary.urgentSites[0]?.tileId, '1,0');
  assert.equal(summary.tone, 'danger');
});

test('condition labels stay stable and player-facing', () => {
  assert.equal(getConditionLabel('healthy'), 'Healthy');
  assert.equal(getConditionLabel('worn'), 'Worn');
  assert.equal(getConditionLabel('damaged'), 'Damaged');
  assert.equal(getConditionLabel('offline'), 'Offline');
  assert.equal(getConditionStatusText('offline'), 'Offline until repaired');
});
