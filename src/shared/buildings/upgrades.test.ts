import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { loadWorld } from '../../core/world.ts';
import { createUpgradeTaskDefinition, getUpgradeDefinitionByKey, getUpgradeDefinitionByTaskKey } from './upgrades.ts';

test.afterEach(() => {
  loadWorld([]);
});

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

test('stone wall upgrade maps timber wall variants onto stone wall variants', () => {
  const upgrade = getUpgradeDefinitionByKey('stone_wall_upgrade');

  assert.ok(upgrade);
  assert.equal(getUpgradeDefinitionByTaskKey('upgradeWallToStone')?.key, 'stone_wall_upgrade');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'plains_wall' } as Tile), 'plains_stone_wall');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'plains_wall_ad' } as Tile), 'plains_stone_wall_ad');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'plains_wall_be' } as Tile), 'plains_stone_wall_be');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'plains_wall_ce' } as Tile), 'plains_stone_wall_ce');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'plains_wall_cf' } as Tile), 'plains_stone_wall_cf');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'dirt', variant: 'dirt_wall' } as Tile), 'dirt_stone_wall');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'dirt', variant: 'dirt_wall_ad' } as Tile), 'dirt_stone_wall_ad');
  assert.equal(upgrade?.resolveToVariant({ terrain: 'plains', variant: 'plains_stone_wall' } as Tile), null);
});
