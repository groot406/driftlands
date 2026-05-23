import test from 'node:test';
import assert from 'node:assert/strict';
import type { Tile } from '../../core/types/Tile.ts';
import {
  getTileConditionState,
  getTileMaintenanceDecayPerMinute,
  getTileRepairResources,
  initializeBuildingCondition,
  MAINTENANCE_DECAY_RATE_MULTIPLIER,
  updateTileCondition,
} from './maintenance.ts';
import { listBuildingDefinitions } from './registry.ts';

function createMaintainedTile(overrides: Partial<Tile> = {}): Tile {
  return {
    id: overrides.id ?? '0,0',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    terrain: overrides.terrain ?? 'forest',
    variant: overrides.variant ?? 'forest_lumber_camp',
    biome: overrides.biome ?? 'forest',
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    ...overrides,
  };
}

test('initializeBuildingCondition seeds new maintained buildings without resetting decay', () => {
  const tile = createMaintainedTile();

  initializeBuildingCondition(tile, 1_000);
  assert.equal(tile.condition, 100);
  assert.equal(tile.conditionState, 'healthy');
  assert.equal(tile.lastConditionUpdateMs, 1_000);

  updateTileCondition(tile, 87.5, 2_000);
  initializeBuildingCondition(tile, 3_000);

  assert.equal(tile.condition, 87.5);
  assert.equal(tile.conditionState, 'healthy');
  assert.equal(tile.lastConditionUpdateMs, 2_000);
});

test('condition state reflects degraded maintained buildings', () => {
  assert.equal(getTileConditionState(100), 'healthy');
  assert.equal(getTileConditionState(65), 'worn');
  assert.equal(getTileConditionState(35), 'damaged');
  assert.equal(getTileConditionState(15), 'offline');
});

test('maintenance decay is tuned through the global pacing multiplier', () => {
  const tile = createMaintainedTile();
  assert.equal(getTileMaintenanceDecayPerMinute(tile), 2.1 * MAINTENANCE_DECAY_RATE_MULTIPLIER);
});

test('stone-built maintained buildings require stone for repairs', () => {
  const mismatches = listBuildingDefinitions()
    .filter((building) => building.repairResources?.length)
    .filter((building) => building.requiredResources(0).some((resource) => resource.type === 'stone'))
    .filter((building) => !building.repairResources?.some((resource) => resource.type === 'stone'))
    .map((building) => building.key);

  assert.deepEqual(mismatches, []);
});

test('upgraded masonry variants add stone to repair costs', () => {
  assert.deepEqual(
    getTileRepairResources(createMaintainedTile({ terrain: 'plains', variant: 'plains_house' })),
    [{ type: 'wood', amount: 1 }],
  );
  assert.deepEqual(
    getTileRepairResources(createMaintainedTile({ terrain: 'plains', variant: 'plains_stone_house' })),
    [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
  );
  assert.deepEqual(
    getTileRepairResources(createMaintainedTile({ terrain: 'plains', variant: 'plains_glass_house' })),
    [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
  );
  assert.deepEqual(
    getTileRepairResources(createMaintainedTile({ terrain: 'plains', variant: 'plains_warehouse' })),
    [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
  );
  assert.deepEqual(
    getTileRepairResources(createMaintainedTile({ terrain: 'forest', variant: 'forest_sawmill' })),
    [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
  );
  assert.deepEqual(
    getTileRepairResources(createMaintainedTile({ terrain: 'mountain', variant: 'mountains_reinforced_mine' })),
    [{ type: 'wood', amount: 1 }, { type: 'stone', amount: 1 }],
  );
});
