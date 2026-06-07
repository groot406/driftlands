import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../core/types/Tile';
import { loadWorld, tileIndex } from '../game/world';
import { hasAdjacentWaterSource, canDrawWaterFromTile } from './water';

function tile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    biome: overrides.biome ?? 'plains',
    terrain: overrides.terrain,
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    variant: overrides.variant ?? null,
    activationState: overrides.activationState ?? 'active',
    controlledBySettlementId: overrides.controlledBySettlementId ?? '0,0',
    ownerSettlementId: overrides.ownerSettlementId ?? '0,0',
  };
}

test.afterEach(() => {
  loadWorld([]);
});

test('wells provide water to tiles within three hexes', () => {
  loadWorld([
    tile({ id: '0,0', q: 0, r: 0, terrain: 'dirt' }),
    tile({ id: '3,0', q: 3, r: 0, terrain: 'plains', variant: 'plains_well', isBaseTile: false }),
    tile({ id: '7,0', q: 7, r: 0, terrain: 'dirt' }),
  ]);

  assert.equal(hasAdjacentWaterSource(tileIndex['0,0']), true);
  assert.equal(canDrawWaterFromTile(tileIndex['0,0']), true);
  assert.equal(hasAdjacentWaterSource(tileIndex['7,0']), false);
});
