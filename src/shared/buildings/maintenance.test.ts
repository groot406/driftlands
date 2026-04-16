import test from 'node:test';
import assert from 'node:assert/strict';
import type { Tile } from '../../core/types/Tile.ts';
import {
  getTileConditionState,
  initializeBuildingCondition,
  updateTileCondition,
} from './maintenance.ts';

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
