import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { loadWorld, tileIndex } from './world.ts';
import {
  bridgeVariantSupportsSide,
  getBridgeConnectionSides,
  getTunnelConnectionSides,
  isBridgeTile,
  isProceduralBridgeVariant,
  isProceduralTunnelVariant,
  isTunnelTile,
  resolveBridgeVariantFromAccessTile,
  resolveTunnelVariantFromAccessTile,
  tunnelVariantSupportsSide,
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
      isBaseTile: false,
      activationState: 'active',
      variant: 'road',
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
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
      variant: null,
    } satisfies Tile,
  ]);

  const bridgeHead = tileIndex['0,1']!;
  const extension = tileIndex['0,2']!;
  const sidewaysTarget = tileIndex['1,1']!;
  const towncenterShore = tileIndex['0,0']!;
  const roadShore = tileIndex['1,0']!;
  const plainShore = tileIndex['2,0']!;

  assert.equal(isProceduralBridgeVariant('water_bridge_ad'), true);
  assert.equal(isBridgeTile(bridgeHead), true);
  assert.deepEqual(getBridgeConnectionSides(bridgeHead), ['a', 'd']);
  assert.equal(bridgeVariantSupportsSide(bridgeHead, 'a'), true);
  assert.equal(bridgeVariantSupportsSide(bridgeHead, 'c'), false);
  assert.equal(resolveBridgeVariantFromAccessTile(bridgeHead, towncenterShore), 'water_bridge_ad');
  assert.equal(resolveBridgeVariantFromAccessTile(sidewaysTarget, roadShore), 'water_bridge_ad');
  assert.equal(resolveBridgeVariantFromAccessTile(sidewaysTarget, plainShore), null);
  assert.equal(resolveBridgeVariantFromAccessTile(extension, bridgeHead), 'water_bridge_ad');
  assert.equal(resolveBridgeVariantFromAccessTile(sidewaysTarget, bridgeHead), null);
});

test('tunnel helpers resolve straight tunnel variants from roads and tunnel mouths', () => {
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
      isBaseTile: false,
      activationState: 'active',
      variant: 'road',
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
      variant: null,
    } satisfies Tile,
    {
      id: '1,1',
      q: 1,
      r: 1,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
  ]);

  const tunnelMouth = tileIndex['0,1']!;
  const extension = tileIndex['0,2']!;
  const sidewaysTarget = tileIndex['1,1']!;
  const towncenterApproach = tileIndex['0,0']!;
  const roadApproach = tileIndex['1,0']!;

  assert.equal(isProceduralTunnelVariant('mountain_tunnel_ad'), true);
  assert.equal(isTunnelTile(tunnelMouth), true);
  assert.deepEqual(getTunnelConnectionSides(tunnelMouth), ['a', 'd']);
  assert.equal(tunnelVariantSupportsSide(tunnelMouth, 'a'), true);
  assert.equal(tunnelVariantSupportsSide(tunnelMouth, 'c'), false);
  assert.equal(resolveTunnelVariantFromAccessTile(tunnelMouth, towncenterApproach), 'mountain_tunnel_ad');
  assert.equal(resolveTunnelVariantFromAccessTile(sidewaysTarget, roadApproach), 'mountain_tunnel_ad');
  assert.equal(resolveTunnelVariantFromAccessTile(extension, tunnelMouth), 'mountain_tunnel_ad');
  assert.equal(resolveTunnelVariantFromAccessTile(sidewaysTarget, tunnelMouth), null);
});
