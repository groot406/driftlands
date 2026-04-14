import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { getUpgradeDefinitionByKey, getUpgradeDefinitionByTaskKey } from './upgrades.ts';

test('stone road upgrade maps timber road variants onto stone road variants', () => {
  const upgrade = getUpgradeDefinitionByKey('stone_road_upgrade');

  assert.ok(upgrade);
  assert.equal(getUpgradeDefinitionByTaskKey('upgradeRoadToStone')?.key, 'stone_road_upgrade');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'road' } as Tile), 'stone_road');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'road_ad' } as Tile), 'stone_road_ad');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'road_be' } as Tile), 'stone_road_be');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'road_ce' } as Tile), 'stone_road_ce');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'road_cf' } as Tile), 'stone_road_cf');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'stone_road' } as Tile), null);
});
