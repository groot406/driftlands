import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStorageAmount } from './storage.ts';

test('storage amount display keeps useful fractions without floating point tails', () => {
    assert.equal(formatStorageAmount(26.599999999999987), '26.6');
    assert.equal(formatStorageAmount(1.0500000000000003), '1.05');
    assert.equal(formatStorageAmount(10), '10');
    assert.equal(formatStorageAmount(119.99999999999999), '120');
});
