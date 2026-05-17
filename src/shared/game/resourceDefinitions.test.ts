import test from 'node:test';
import assert from 'node:assert/strict';

import { getHungerFoodMealValue } from './resourceDefinitions.ts';

test('hunger food meal value includes edible resource nutrition', () => {
  assert.equal(getHungerFoodMealValue({
    food: 2,
    fish: 4,
    bread: 1,
    meat: 2,
    beer: 10,
    grain: 10,
  }), 12);
});
