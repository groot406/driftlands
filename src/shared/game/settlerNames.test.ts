import test from 'node:test';
import assert from 'node:assert/strict';

import { getSettlerDisplayName } from './settlerNames';

test('settler name seeds override sequential ids', () => {
    assert.equal(getSettlerDisplayName('settler-1'), 'Bella Campbell');
    assert.equal(getSettlerDisplayName('settler-1', 1), 'Anouk Walker');
    assert.equal(getSettlerDisplayName('settler-1', 2), 'Landon Roberts');
});
