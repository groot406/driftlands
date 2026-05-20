import test from 'node:test';
import assert from 'node:assert/strict';

import { getSettlerDisplayName, getSettlerIdentity, normalizeSettlerGender } from './settlerNames';

test('settler name seeds override sequential ids', () => {
    assert.equal(getSettlerDisplayName('settler-1'), 'Bella Campbell');
    assert.equal(getSettlerDisplayName('settler-1', 1), 'Anouk Walker');
    assert.equal(getSettlerDisplayName('settler-1', 2), 'Landon Roberts');
});

test('settler gender chooses the first-name pool', () => {
    assert.equal(normalizeSettlerGender({ id: 'settler-1', nameSeed: 2 }), 'male');
    assert.equal(getSettlerIdentity('settler-1', 2, 'female').firstName, 'Eva');
    assert.equal(getSettlerIdentity('settler-1', 1, 'male').firstName, 'Tobias');
});
