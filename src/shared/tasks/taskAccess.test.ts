import assert from 'node:assert/strict';
import test from 'node:test';

import type { Hero } from '../../core/types/Hero.ts';
import { PathService } from '../game/PathService.ts';
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

test('dock construction uses adjacent active land access instead of the water tile itself', () => {
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

test('dock construction does not use bridges as water-only access', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'water_bridge_ad',
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
  ]);

  const shoreline = tileIndex['0,1']!;
  const accessTile = findNearestTaskAccessTile('buildDock', shoreline, 0, 0);

  assert.equal(accessTile, null);
});

test('task access stays within the acting settlement when multiple adjacent approaches exist', () => {
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
      controlledBySettlementId: 'ally',
      ownerSettlementId: 'ally',
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
      controlledBySettlementId: 'home',
      ownerSettlementId: 'home',
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
      controlledBySettlementId: 'home',
      ownerSettlementId: 'home',
      variant: null,
    } satisfies Tile,
  ]);

  const shoreline = tileIndex['0,1']!;

  assert.equal(findNearestTaskAccessTile('buildDock', shoreline, 0, 0)?.id, '0,0');
  assert.equal(findNearestTaskAccessTile('buildDock', shoreline, 0, 0, 'home')?.id, '1,0');
  assert.equal(findNearestTaskAccessTile('buildDock', shoreline, 0, 0, 'ally')?.id, '0,0');
});

test('bridges extend from active shore or an existing straight bridgehead', () => {
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
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: 'water_bridge_ad',
    } satisfies Tile,
    {
      id: '0,2',
      q: 0,
      r: 2,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const targetTile = tileIndex['0,2']!;
  const accessTile = findNearestTaskAccessTile('buildBridge', targetTile, 0, 0);

  assert.equal(taskUsesAdjacentActiveAccess('buildBridge'), true);
  assert.equal(taskUsesAdjacentAccess('buildBridge'), true);
  assert.equal(accessTile?.id, '0,1');

  const hero = {
    q: 0,
    r: 1,
    movement: undefined,
  } as Hero;

  assert.equal(
    isHeroAtTaskLocation(hero, {
      tileId: targetTile.id,
      type: 'buildBridge',
      context: { adjacentActiveAccess: true },
    }),
    true,
  );
});

test('tunnels extend from active approaches or an existing straight tunnel mouth', () => {
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
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: 'mountain_tunnel_ad',
    } satisfies Tile,
    {
      id: '0,2',
      q: 0,
      r: 2,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const targetTile = tileIndex['0,2']!;
  const accessTile = findNearestTaskAccessTile('buildTunnel', targetTile, 0, 0);

  assert.equal(taskUsesAdjacentActiveAccess('buildTunnel'), true);
  assert.equal(taskUsesAdjacentAccess('buildTunnel'), true);
  assert.equal(accessTile?.id, '0,1');

  const hero = {
    q: 0,
    r: 1,
    movement: undefined,
  } as Hero;

  assert.equal(
    isHeroAtTaskLocation(hero, {
      tileId: targetTile.id,
      type: 'buildTunnel',
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

test('water exploration uses adjacent walkable shore access instead of walking onto the water tile', () => {
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
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: false,
      isBaseTile: true,
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const waterTile = tileIndex['0,1']!;
  const untouchedNeighborKey = '1,1';
  assert.equal(tileIndex[untouchedNeighborKey], undefined);

  const accessTile = findNearestTaskAccessTile('explore', waterTile, 0, 0);

  assert.equal(accessTile?.id, '0,0');
  assert.equal(tileIndex[untouchedNeighborKey], undefined);

  const hero = {
    q: 0,
    r: 0,
    movement: undefined,
  } as Hero;

  assert.equal(
    isHeroAtTaskLocation(hero, {
      tileId: waterTile.id,
      type: 'explore',
      context: {},
    }),
    true,
  );
});

test('offline land tiles remain walkable and can be used to explore farther tiles', () => {
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
      controlledBySettlementId: '0,0',
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
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      isBaseTile: true,
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const offlineTile = tileIndex['1,0']!;
  const frontierTile = tileIndex['2,0']!;
  const accessTile = findNearestTaskAccessTile('explore', frontierTile, 0, 0);
  const pathService = new PathService();

  assert.equal(isTileWalkable(offlineTile), true);
  assert.equal(accessTile?.id, frontierTile.id);
  assert.deepEqual(pathService.findWalkablePath(0, 0, frontierTile.q, frontierTile.r), [{ q: 1, r: 0 }, { q: 2, r: 0 }]);
});
