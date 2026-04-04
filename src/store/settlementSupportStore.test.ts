import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../core/types/Tile.ts';
import { loadWorld } from '../core/world.ts';
import { recalculateSettlementSupport, resetSettlementSupportState } from './settlementSupportStore.ts';

function createTowncenterTile(): Tile {
  return {
    id: '0,0',
    q: 0,
    r: 0,
    biome: 'plains',
    terrain: 'towncenter',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    variant: null,
  };
}

test.afterEach(() => {
  loadWorld([]);
  resetSettlementSupportState();
});

test('a fully housed starter town can sustain a 100-tile frontier push', () => {
  loadWorld([createTowncenterTile()]);

  const result = recalculateSettlementSupport(10, 0);

  assert.ok(result.snapshot.supportCapacity >= 100);
});
