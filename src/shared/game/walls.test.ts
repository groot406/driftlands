import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { getTileMoveCost } from './navigation.ts';
import { loadWorld, tileIndex } from './world.ts';
import { hasAdjacentWallBuildAnchor, isProceduralWallVariant, isStoneWallTile, isWallConnectionTarget, isWallTile } from './walls.ts';

test.afterEach(() => {
  loadWorld([]);
});

test('walls connect to town centers, watchtowers, and wall chains', () => {
  assert.equal(isProceduralWallVariant('plains_wall'), true);
  assert.equal(isProceduralWallVariant('plains_stone_wall_ad'), true);
  assert.equal(isProceduralWallVariant('dirt_wall'), true);
  assert.equal(isProceduralWallVariant('road'), false);

  assert.equal(isWallTile({ terrain: 'plains', variant: 'plains_wall' } as Tile), true);
  assert.equal(isWallTile({ terrain: 'dirt', variant: 'dirt_wall' } as Tile), true);
  assert.equal(isStoneWallTile({ terrain: 'plains', variant: 'plains_stone_wall' } as Tile), true);
  assert.equal(isStoneWallTile({ terrain: 'dirt', variant: 'dirt_stone_wall' } as Tile), true);
  assert.equal(isWallConnectionTarget({ terrain: 'towncenter', variant: null } as Tile), true);
  assert.equal(isWallConnectionTarget({ terrain: 'plains', variant: 'plains_watchtower' } as Tile), true);
  assert.equal(isWallConnectionTarget({ terrain: 'plains', variant: null } as Tile), false);
});

test('walls block movement like solid defensive tiles', () => {
  assert.equal(getTileMoveCost({ terrain: 'plains', variant: 'plains_wall' } as Tile), 50);
  assert.equal(getTileMoveCost({ terrain: 'plains', variant: 'plains_stone_wall' } as Tile), 50);
  assert.equal(getTileMoveCost({ terrain: 'dirt', variant: 'dirt_wall' } as Tile), 50);
});

test('walls can only start from an adjacent tower, town center, or existing wall', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'towncenter',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'plains_wall',
    } satisfies Tile,
    {
      id: '3,0',
      q: 3,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '5,1',
      q: 5,
      r: 1,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'plains_watchtower',
    } satisfies Tile,
    {
      id: '5,0',
      q: 5,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  assert.equal(hasAdjacentWallBuildAnchor(tileIndex['1,0']!), true);
  assert.equal(hasAdjacentWallBuildAnchor(tileIndex['3,0']!), true);
  assert.equal(hasAdjacentWallBuildAnchor(tileIndex['5,0']!), true);
  assert.equal(hasAdjacentWallBuildAnchor(tileIndex['4,0']!), false);
});
