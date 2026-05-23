import test from 'node:test';
import assert from 'node:assert/strict';

import type { MarketOverviewSnapshot } from '../shared/game/market.ts';
import {
  marketOverview,
  marketWallet,
  replaceMarketOverview,
} from './marketStore.ts';

function marketSnapshot(wallet: MarketOverviewSnapshot['wallet']): MarketOverviewSnapshot {
  return {
    resources: marketOverview.value.resources,
    wallet,
    transactions: [],
  };
}

test.afterEach(() => {
  marketWallet.value = null;
  replaceMarketOverview(marketSnapshot(null));
});

test('generic market updates preserve the current player wallet', () => {
  replaceMarketOverview(marketSnapshot({
    actorId: 'player-1',
    actorType: 'PLAYER',
    gold: 25,
    updatedAt: 1_000,
  }));

  replaceMarketOverview(marketSnapshot(null));

  assert.equal(marketWallet.value?.actorId, 'player-1');
  assert.equal(marketWallet.value?.gold, 25);
  assert.equal(marketOverview.value.wallet?.gold, 25);
});
