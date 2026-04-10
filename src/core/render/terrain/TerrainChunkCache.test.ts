import assert from 'node:assert/strict';
import test from 'node:test';

import { TerrainChunkCache } from './TerrainChunkCache';

test('TerrainChunkCache only rebuilds dirty chunks', () => {
    let rebuilds = 0;
    const cache = new TerrainChunkCache(() => {
        return {
            width: 0,
            height: 0,
            getContext: () => ({}) as CanvasRenderingContext2D,
        } as unknown as HTMLCanvasElement;
    });
    const builder = {
        rebuild: () => {
            rebuilds++;
        },
    };

    cache.ensureChunk('0,0', builder);
    cache.ensureChunk('0,0', builder);
    assert.equal(rebuilds, 1);

    cache.markDirty('0,0');
    cache.ensureChunk('0,0', builder);
    assert.equal(rebuilds, 2);
});
