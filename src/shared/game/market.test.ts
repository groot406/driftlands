import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMarketBuyPrice,
  calculateMarketPrice,
  calculateMarketSellPrice,
  MARKET_SELL_PRICE_MULTIPLIER,
} from './market.ts';

test('market price rises and falls around target stock', () => {
  const config = {
    basePrice: 10,
    targetStock: 4_000,
    minPrice: 4,
    maxPrice: 30,
  };

  assert.equal(calculateMarketPrice({ ...config, currentStock: 4_000 }), 10);
  assert.equal(calculateMarketPrice({ ...config, currentStock: 2_000 }), 20);
  assert.equal(calculateMarketPrice({ ...config, currentStock: 8_000 }), 5);
});

test('market price clamps at configured limits', () => {
  const config = {
    basePrice: 100,
    targetStock: 500,
    minPrice: 40,
    maxPrice: 300,
  };

  assert.equal(calculateMarketPrice({ ...config, currentStock: 0 }), 300);
  assert.equal(calculateMarketPrice({ ...config, currentStock: 10 }), 300);
  assert.equal(calculateMarketPrice({ ...config, currentStock: 5_000 }), 40);
});

test('sell price applies a spread while respecting the configured floor', () => {
  const config = {
    basePrice: 10,
    targetStock: 4_000,
    minPrice: 4,
    maxPrice: 30,
  };

  const healthyMarket = { ...config, currentStock: 4_000 };
  assert.equal(calculateMarketBuyPrice(healthyMarket), 10);
  assert.equal(calculateMarketSellPrice(healthyMarket), Math.floor(10 * MARKET_SELL_PRICE_MULTIPLIER));

  assert.equal(calculateMarketSellPrice({ ...config, currentStock: 40_000 }), 4);
});
