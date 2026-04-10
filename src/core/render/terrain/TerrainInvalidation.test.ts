import assert from 'node:assert/strict';
import test from 'node:test';

import { getDirtyChunkKeysForTile, getDirtyChunkKeysForTiles } from './TerrainInvalidation';

test('terrain invalidation includes the tile chunk and adjacent neighbor chunks', () => {
    const dirty = getDirtyChunkKeysForTile({ q: 15, r: 15 }, 16);
    assert.deepEqual(dirty, ['0,0', '0,1', '1,0']);
});

test('terrain invalidation merges chunk keys across multiple dirty tiles', () => {
    const dirty = getDirtyChunkKeysForTiles([
        { q: 0, r: 0 },
        { q: 32, r: 0 },
    ], 16);

    assert.ok(dirty.includes('0,-1'));
    assert.ok(dirty.includes('0,0'));
    assert.ok(dirty.includes('2,0'));
});
