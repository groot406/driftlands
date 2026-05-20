import test from 'node:test';
import assert from 'node:assert/strict';

import { getSettlerSpriteKey } from './settlerSprite';

test('settler sprite selection stays within gendered sprite pools', () => {
    const maleSprites = new Set(['default', 'copper_jacket', 'headband_worker']);
    const femaleSprites = new Set(['female_braid', 'female_bright']);

    for (let appearanceSeed = 0; appearanceSeed < 12; appearanceSeed += 1) {
        assert.equal(maleSprites.has(getSettlerSpriteKey({
            id: `male-${appearanceSeed}`,
            gender: 'male',
            appearanceSeed,
        })), true);
        assert.equal(femaleSprites.has(getSettlerSpriteKey({
            id: `female-${appearanceSeed}`,
            gender: 'female',
            appearanceSeed,
        })), true);
    }
});
