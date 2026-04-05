import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { loadWorld, tileIndex } from './world.ts';
import {
  bridgeVariantSupportsSide,
  getBridgeConnectionSides,
  isBridgeTile,
  isProceduralBridgeVariant,
  resolveBridgeVariantFromAccessTile,
} from './bridges.ts';

test.afterEach(() => {
  loadWorld([]);
});

test('bridge helpers resolve straight bridge variants from shore and bridgeheads', () => {
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
      variant: null,
    } satisfies Tile,
    {
      id: '1,1',
      q: 1,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: 'water_bridge_be',
    } satisfies Tile,
  ]);

  const bridgeHead = tileIndex['0,1']!;
  const extension = tileIndex['0,2']!;
  const sidewaysTarget = tileIndex['1,1']!;
  const shore = tileIndex['0,0']!;

  assert.equal(isProceduralBridgeVariant('water_bridge_ad'), true);
  assert.equal(isBridgeTile(bridgeHead), true);
  assert.deepEqual(getBridgeConnectionSides(bridgeHead), ['a', 'd']);
  assert.equal(bridgeVariantSupportsSide(bridgeHead, 'a'), true);
  assert.equal(bridgeVariantSupportsSide(bridgeHead, 'c'), false);
  assert.equal(resolveBridgeVariantFromAccessTile(bridgeHead, shore), 'water_bridge_ad');
  assert.equal(resolveBridgeVariantFromAccessTile(extension, bridgeHead), 'water_bridge_ad');
  assert.equal(resolveBridgeVariantFromAccessTile(sidewaysTarget, bridgeHead), null);
});
