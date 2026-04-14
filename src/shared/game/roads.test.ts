import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { getTileMoveCost } from './navigation.ts';
import { loadWorld, tileIndex } from './world.ts';
import { hasAdjacentRoadBuildAnchor, isProceduralRoadVariant, isRoadConnectionTarget, isRoadTile } from './roads';

test.afterEach(() => {
  loadWorld([]);
});

test('roads connect to adjacent roads and town centers', () => {
  assert.equal(isProceduralRoadVariant('road'), true);
  assert.equal(isProceduralRoadVariant('road_ad'), true);
  assert.equal(isProceduralRoadVariant('stone_road'), true);
  assert.equal(isProceduralRoadVariant('plains_watchtower'), false);

  assert.equal(isRoadTile({ terrain: 'plains', variant: 'road' } as any), true);
  assert.equal(isRoadTile({ terrain: 'plains', variant: 'stone_road' } as any), true);
  assert.equal(isRoadTile({ terrain: 'towncenter', variant: null } as any), false);

  assert.equal(isRoadConnectionTarget({ terrain: 'plains', variant: 'road' } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'towncenter', variant: null } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'plains', variant: null } as any), false);
});

test('stone roads preserve the old speed boost while base roads are slower', () => {
  assert.equal(getTileMoveCost({ terrain: 'plains', variant: 'road' } as any), 0.6);
  assert.equal(getTileMoveCost({ terrain: 'plains', variant: 'stone_road' } as any), 0.35);
});

test('roads should not connect to fenced edges', () => {
  const targetWithFence: any = {
    terrain: 'towncenter',
    fencedEdges: { a: true }
  };

  // Connection from side 'a' should be blocked
  assert.equal(isRoadConnectionTarget(targetWithFence, 'a'), false);

  // Connection from side 'b' should be allowed
  assert.equal(isRoadConnectionTarget(targetWithFence, 'b'), true);
});

test('roads should connect to docks', () => {
  assert.equal(isRoadConnectionTarget({ terrain: 'water', variant: 'water_dock_a' } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'water', variant: 'water_bridge_ad' } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'mountain', variant: 'mountain_tunnel_ad' } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'water', variant: 'water_lily' } as any), false);
});

test('road-facing buildings only accept one incoming road', () => {
  const roadTile = { terrain: 'plains', variant: 'road' } as any;
  const buildingTile = {
    terrain: 'plains',
    variant: 'plains_house',
    neighbors: {
      a: roadTile,
      c: roadTile,
    },
  } as any;

  assert.equal(isRoadConnectionTarget(buildingTile, 'a'), true);
  assert.equal(isRoadConnectionTarget(buildingTile, 'c'), false);
});

test('roads can only start from an adjacent town center, road, bridge, or tunnel anchor', () => {
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
      variant: 'road',
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
      variant: null,
    } satisfies Tile,
    {
      id: '4,1',
      q: 4,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'water_bridge_ad',
    } satisfies Tile,
    {
      id: '4,0',
      q: 4,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
    {
      id: '6,1',
      q: 6,
      r: 1,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'mountain_tunnel_ad',
    } satisfies Tile,
    {
      id: '6,0',
      q: 6,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
  ]);

  assert.equal(hasAdjacentRoadBuildAnchor(tileIndex['1,0']!), true);
  assert.equal(hasAdjacentRoadBuildAnchor(tileIndex['3,0']!), true);
  assert.equal(hasAdjacentRoadBuildAnchor(tileIndex['4,0']!), true);
  assert.equal(hasAdjacentRoadBuildAnchor(tileIndex['6,0']!), true);
  assert.equal(hasAdjacentRoadBuildAnchor(tileIndex['5,0']!), false);
});
