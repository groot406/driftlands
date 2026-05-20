import test from 'node:test';
import assert from 'node:assert/strict';

import { getFoodSourceStock, getHungerFoodMealValue, getResourceRequirementStock } from './resourceDefinitions.ts';

test('hunger food meal value includes edible resource nutrition', () => {
  assert.equal(getHungerFoodMealValue({
    fish: 4,
    bread: 1,
    meat: 2,
    beer: 10,
    grain: 10,
  }), 10);
});

test('shared food requirements count fish, meat, and bread', () => {
  const inventory = {
    fish: 2,
    bread: 3,
    meat: 4,
    beer: 99,
    grain: 99,
  };

  assert.equal(getFoodSourceStock(inventory), 9);
  assert.equal(getResourceRequirementStock(inventory, 'food'), 9);
  assert.equal(getResourceRequirementStock(inventory, 'grain'), 99);
});
