import assert from 'node:assert/strict';
import test from 'node:test';

import { tileIndex } from './world';
import { HexMapService } from './HexMapService';
import type { Tile } from './types/Tile';

function createTile(id: string, q: number, r: number): Tile {
    return {
        id,
        q,
        r,
        biome: null,
        terrain: 'grain',
        discovered: true,
        isBaseTile: true,
        activationState: 'active',
    } as Tile;
}

test('HexMapService bottom edge adjacency respects provided visible tile set', () => {
    const service = Object.create(HexMapService.prototype) as {
        hasVisibleTileOnSide(tile: Tile, side: 'd', visibleTileIds?: ReadonlySet<string>): boolean;
    };
    const tile = createTile('0,0', 0, 0);
    const lowerNeighbor = createTile('0,1', 0, 1);
    tileIndex[lowerNeighbor.id] = lowerNeighbor;

    try {
        assert.equal(service.hasVisibleTileOnSide(tile, 'd'), true);
        assert.equal(service.hasVisibleTileOnSide(tile, 'd', new Set([tile.id])), false);
        assert.equal(service.hasVisibleTileOnSide(tile, 'd', new Set([tile.id, lowerNeighbor.id])), true);
    } finally {
        delete tileIndex[lowerNeighbor.id];
    }
});

test('HexMapService creates bottom edge state for undiscovered frontier tiles', () => {
    const service = Object.create(HexMapService.prototype) as {
        createTileDepthEdgeRenderState(tile: Tile, now: number, opacity: number): { key: string } | null;
    };
    const tile = {
        ...createTile('0,1', 0, 1),
        terrain: null,
        discovered: false,
    };

    const state = service.createTileDepthEdgeRenderState(tile, 0, 1);

    assert.equal(state?.key, 'undiscovered');
});
