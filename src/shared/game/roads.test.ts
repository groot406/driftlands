import assert from 'node:assert/strict';
import test from 'node:test';

import { isProceduralRoadVariant, isRoadConnectionTarget, isRoadTile } from './roads';

test('roads connect to adjacent roads and town centers', () => {
  assert.equal(isProceduralRoadVariant('road'), true);
  assert.equal(isProceduralRoadVariant('road_ad'), true);
  assert.equal(isProceduralRoadVariant('plains_watchtower'), false);

  assert.equal(isRoadTile({ terrain: 'plains', variant: 'road' } as any), true);
  assert.equal(isRoadTile({ terrain: 'towncenter', variant: null } as any), false);

  assert.equal(isRoadConnectionTarget({ terrain: 'plains', variant: 'road' } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'towncenter', variant: null } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'plains', variant: null } as any), false);
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
