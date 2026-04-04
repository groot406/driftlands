import assert from 'node:assert/strict';
import test from 'node:test';

import type { Hero } from '../../core/types/Hero.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { isTileWalkable } from '../game/navigation.ts';
import { isHeroAtTaskLocation } from '../game/heroTaskState.ts';
import { loadWorld, tileIndex } from '../game/world.ts';
import {
  findNearestTaskAccessTile,
  taskUsesAdjacentAccess,
  taskUsesAdjacentActiveAccess,
  taskUsesAdjacentWalkableAccess,
} from './taskAccess.ts';

test.afterEach(() => {
  loadWorld([]);
});

test('shoreline construction tasks use adjacent active shore access instead of the water tile itself', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      variant: null,
    } satisfies Tile,
  ]);

  const shoreline = tileIndex['0,1']!;
  const accessTile = findNearestTaskAccessTile('buildDock', shoreline, 0, 0);

  assert.equal(taskUsesAdjacentActiveAccess('buildDock'), true);
  assert.equal(taskUsesAdjacentAccess('buildDock'), true);
  assert.equal(taskUsesAdjacentActiveAccess('harvestWaterLilies'), false);
  assert.equal(taskUsesAdjacentActiveAccess('buildHouse'), false);
  assert.equal(accessTile?.id, '0,0');

  const hero = {
    q: 0,
    r: 0,
    movement: undefined,
  } as Hero;

  assert.equal(
    isHeroAtTaskLocation(hero, {
      tileId: shoreline.id,
      type: 'buildDock',
      context: { adjacentActiveAccess: true },
    }),
    true,
  );
});

test('water lily tasks can use adjacent walkable lily paths even when the water tiles are inactive', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: 'water_lily',
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const lilyTile = tileIndex['0,0']!;
  const waterTile = tileIndex['0,1']!;
  const accessTile = findNearestTaskAccessTile('placeWaterLilies', waterTile, 0, 0);

  assert.equal(taskUsesAdjacentActiveAccess('placeWaterLilies'), false);
  assert.equal(taskUsesAdjacentWalkableAccess('placeWaterLilies'), true);
  assert.equal(taskUsesAdjacentWalkableAccess('harvestWaterLilies'), true);
  assert.equal(isTileWalkable(lilyTile), true);
  assert.equal(accessTile?.id, '0,0');

  const hero = {
    q: 0,
    r: 0,
    movement: undefined,
  } as Hero;

  assert.equal(
    isHeroAtTaskLocation(hero, {
      tileId: waterTile.id,
      type: 'placeWaterLilies',
      context: { adjacentWalkableAccess: true },
    }),
    true,
  );
});

test('fish at dock uses the dock tile itself once the dock is walkable', () => {
  loadWorld([
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: 'water_dock_a',
    } satisfies Tile,
  ]);

  const dockTile = tileIndex['0,1']!;
  const accessTile = findNearestTaskAccessTile('fishAtDock', dockTile, 0, 0);

  assert.equal(taskUsesAdjacentActiveAccess('fishAtDock'), false);
  assert.equal(accessTile?.id, '0,1');

  const hero = {
    q: 0,
    r: 1,
    movement: undefined,
  } as Hero;

  assert.equal(
    isHeroAtTaskLocation(hero, {
      tileId: dockTile.id,
      type: 'fishAtDock',
    }),
    true,
  );
});
