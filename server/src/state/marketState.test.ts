import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import type { Tile } from '../../../src/core/types/Tile.ts';
import { loadWorld } from '../../../src/core/world.ts';
import { depositResourceToStorage, resetResourceState } from '../../../src/store/resourceStore.ts';
import { marketState, MarketTradeError } from './marketState.ts';

beforeEach(() => {
  loadWorld([]);
  resetResourceState();
  marketState.reset(1_000);
});

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

test('new market wallets start without gold', () => {
  const overview = marketState.getOverview('player-1', 'PLAYER');

  assert.equal(overview.wallet?.gold, 0);
});

test('new market wallets cannot buy before earning gold', () => {
  assert.throws(
    () => marketState.buyResource({
      actorId: 'player-1',
      actorType: 'PLAYER',
      settlementId: 'settlement-1',
      resourceType: 'wood',
      quantity: 1,
    }),
    (error) => error instanceof MarketTradeError && error.code === 'INSUFFICIENT_GOLD',
  );
});

test('selling records the discounted sell price and creates earned gold', () => {
  loadWorld([createTowncenterTile('0,0', 0, 0)]);
  depositResourceToStorage('0,0', 'wood', 5);

  const result = marketState.sellResource({
    actorId: 'player-1',
    actorType: 'PLAYER',
    settlementId: '0,0',
    resourceType: 'wood',
    quantity: 5,
  });

  assert.equal(result.transaction.pricePerUnit, 5);
  assert.equal(result.transaction.totalGold, 25);
  assert.equal(result.wallet.gold, 25);
});

test('market stock drifts over time from its low starting amounts', () => {
  const before = marketState.getOverview().resources.wood.stock;

  assert.equal(marketState.tick(61_000), true);

  const after = marketState.getOverview().resources.wood.stock;
  assert.notEqual(after, before);
});
