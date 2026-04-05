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

function createFrontierTiles(count: number): Tile[] {
  const tiles: Tile[] = [];

  for (let q = -8; q <= 8; q++) {
    for (let r = Math.max(-8, -q - 8); r <= Math.min(8, -q + 8); r++) {
      if (q === 0 && r === 0) {
        continue;
      }

      tiles.push({
        id: `${q},${r}`,
        q,
        r,
        biome: 'plains',
        terrain: 'plains',
        discovered: true,
        isBaseTile: true,
        activationState: 'active',
        variant: null,
      });

      if (tiles.length >= count) {
        return tiles;
      }
    }
  }

  return tiles;
}

test.afterEach(() => {
  loadWorld([]);
  resetSettlementSupportState();
});

test('a fully housed starter town can sustain a 100-tile frontier push', () => {
  loadWorld([createTowncenterTile()]);

  const result = recalculateSettlementSupport(10, 0);

  assert.ok(result.snapshot.supportCapacity >= 150);
});

test('inactive tiles automatically restore once support rises again', () => {
  loadWorld([
    createTowncenterTile(),
    ...createFrontierTiles(85),
  ]);

  const strained = recalculateSettlementSupport(0, 0);

  assert.equal(strained.snapshot.inactiveTileCount, 1);
  assert.equal(strained.newlyInactiveTileIds.length, 1);

  const restoredTileId = strained.newlyInactiveTileIds[0]!;
  const recovered = recalculateSettlementSupport(1, 0);

  assert.equal(recovered.snapshot.inactiveTileCount, 0);
  assert.deepEqual(recovered.newlyActiveTileIds, [restoredTileId]);
  assert.deepEqual(recovered.restoredTileIds, [restoredTileId]);
});
