import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../core/types/Tile.ts';
import { loadWorld } from '../core/world.ts';
import {
  depositResourceToStorage,
  getSettlementResourceInventory,
  getStorageResourceAmount,
  resetResourceState,
  withdrawResourceAcrossStoragesForSettlement,
  withdrawResourceAcrossStorages,
} from './resourceStore.ts';

function createTowncenterTile(id: string, q: number, r: number): Tile {
  return {
    id,
    q,
    r,
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
  resetResourceState();
});

test('withdrawResourceAcrossStorages drains multiple storages in a stable priority order', () => {
  loadWorld([
    createTowncenterTile('0,0', 0, 0),
    createTowncenterTile('2,0', 2, 0),
  ]);

  depositResourceToStorage('0,0', 'food', 4);
  depositResourceToStorage('2,0', 'food', 6);

  const transfers = withdrawResourceAcrossStorages('food', 7);

  assert.deepEqual(transfers, [
    { storageTileId: '0,0', amount: 4 },
    { storageTileId: '2,0', amount: 3 },
  ]);
  assert.equal(getStorageResourceAmount('0,0', 'food'), 0);
  assert.equal(getStorageResourceAmount('2,0', 'food'), 3);
});

test('settlement resource withdrawals stay inside the requested settlement', () => {
  loadWorld([
    createTowncenterTile('0,0', 0, 0),
    createTowncenterTile('20,0', 20, 0),
  ]);

  depositResourceToStorage('0,0', 'food', 4);
  depositResourceToStorage('20,0', 'food', 6);

  const transfers = withdrawResourceAcrossStoragesForSettlement('20,0', 'food', 3);

  assert.deepEqual(transfers, [{ storageTileId: '20,0', amount: 3 }]);
  assert.equal(getStorageResourceAmount('0,0', 'food'), 4);
  assert.equal(getStorageResourceAmount('20,0', 'food'), 3);
  assert.equal(getSettlementResourceInventory('0,0').food, 4);
  assert.equal(getSettlementResourceInventory('20,0').food, 3);
});
