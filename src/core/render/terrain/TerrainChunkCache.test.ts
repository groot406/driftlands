import assert from 'node:assert/strict';
import test from 'node:test';

import { TerrainChunkCache } from './TerrainChunkCache';
import { TerrainChunkBuilder } from './TerrainChunkBuilder';

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

test('TerrainChunkBuilder skips tiles reserved for per-frame animation', async () => {
    const drawCalls: string[] = [];
    const tileId = '9876,9876';
    const builder = new TerrainChunkBuilder({
        get2dContext: () => ({
            clearRect() {},
            save() {},
            restore() {},
            translate() {},
            imageSmoothingEnabled: false,
        }) as unknown as CanvasRenderingContext2D,
        drawTile: (tile) => {
            drawCalls.push(tile.id);
        },
        getSupportAwareTileOpacity: (_tile, opacity) => opacity,
        shouldBuildTileInChunk: (tile) => tile.id !== tileId,
    });

    const { tileIndex } = await import('../../world.ts');
    const previousTile = tileIndex[tileId];
    tileIndex[tileId] = {
        id: tileId,
        q: 9876,
        r: 9876,
        biome: null,
        terrain: 'water',
        discovered: true,
        isBaseTile: true,
    } as (typeof tileIndex)[string];

    try {
        builder.rebuild({
            chunk: {
                key: '0,0',
                chunkQ: 0,
                chunkR: 0,
                minQ: 9876,
                maxQ: 9876,
                minR: 9876,
                maxR: 9876,
                worldX: 0,
                worldY: 0,
                width: 66,
                height: 66,
            },
            canvas: { width: 0, height: 0 } as HTMLCanvasElement,
            context: {
                scene: {
                    frameInfo: {
                        effectNowMs: 0,
                    },
                },
            } as any,
        });

        assert.deepEqual(drawCalls, []);
    } finally {
        if (previousTile) {
            tileIndex[tileId] = previousTile;
        } else {
            delete tileIndex[tileId];
        }
    }
});
