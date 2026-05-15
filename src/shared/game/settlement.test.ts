import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from './types/Tile';
import { getSettlementTownCenterTile, getTileSettlementId } from './settlement.ts';

test('getTileSettlementId prefers owning settlement ids over town center tile ids', () => {
  const tile = {
    id: '10,4',
    terrain: 'towncenter',
    ownerSettlementId: '2,2',
    controlledBySettlementId: '2,2',
  } satisfies Pick<Tile, 'id' | 'terrain' | 'ownerSettlementId' | 'controlledBySettlementId'>;

  assert.equal(getTileSettlementId(tile), '2,2');
});

test('getSettlementTownCenterTile finds a town center by settlement ownership', () => {
  const tiles = [
    {
      id: '0,0',
      terrain: 'towncenter',
      ownerSettlementId: null,
      controlledBySettlementId: null,
    },
    {
      id: '10,4',
      terrain: 'towncenter',
      ownerSettlementId: '2,2',
      controlledBySettlementId: '2,2',
    },
    {
      id: '11,4',
      terrain: 'plains',
      ownerSettlementId: '2,2',
      controlledBySettlementId: '2,2',
    },
  ] satisfies Array<Pick<Tile, 'id' | 'terrain' | 'ownerSettlementId' | 'controlledBySettlementId'>>;

  assert.equal(getSettlementTownCenterTile(tiles, '2,2')?.id, '10,4');
  assert.equal(getSettlementTownCenterTile(tiles, 'missing'), null);
});
