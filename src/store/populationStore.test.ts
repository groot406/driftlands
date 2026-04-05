import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../core/types/Tile.ts';
import { loadWorld } from '../core/world.ts';
import { recalculateSettlementSupport, resetSettlementSupportState } from './settlementSupportStore.ts';
import {
  computeReachTileIds,
  computeReachTileIdsForTC,
  computeReachTileIdsForWatchtower,
  isTileWithinReach,
} from './populationStore.ts';

function tile(q: number, r: number, terrain: Tile['terrain'], variant: Tile['variant'] = null): Tile {
  return {
    id: `${q},${r}`,
    q,
    r,
    biome: null,
    terrain,
    variant,
    discovered: true,
  };
}

test('watchtowers chain their reach when each next tower is inside current reach', () => {
  loadWorld([
    tile(0, 0, 'towncenter'),
    tile(7, 0, 'plains', 'plains_watchtower'),
    tile(12, 0, 'plains', 'plains_watchtower'),
  ]);

  try {
    recalculateSettlementSupport(0, 0);
    const globalReach = computeReachTileIds();
    const townCenterReach = computeReachTileIdsForTC(0, 0);
    const watchtowerReach = computeReachTileIdsForWatchtower(12, 0);

    assert.equal(globalReach.has('18,0'), true);
    assert.equal(townCenterReach.has('18,0'), true);
    assert.equal(watchtowerReach.has('18,0'), true);
    assert.equal(isTileWithinReach(18, 0), true);
  } finally {
    loadWorld([]);
    resetSettlementSupportState();
  }
});
