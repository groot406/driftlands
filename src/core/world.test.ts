import assert from 'node:assert/strict';
import { test } from 'node:test';

import { axialKey, getTilesInRadius, loadWorld } from './world.ts';
import type { Tile } from './types/Tile.ts';

function createTile(q: number, r: number): Tile {
    return {
        id: axialKey(q, r),
        q,
        r,
        terrain: 'plains',
        biome: 'temperate',
        discovered: true,
        isBaseTile: true,
    };
}

function createDisc(radius: number): Tile[] {
    const tiles: Tile[] = [];
    for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
            tiles.push(createTile(q, r));
        }
    }
    return tiles;
}

test('getTilesInRadius normalizes fractional cinematic camera values', () => {
    loadWorld(createDisc(3));

    const integerTiles = getTilesInRadius(0, 0, 2).map((tile) => tile.id).sort();
    const fractionalTiles = getTilesInRadius(0.25, -0.3, 1.35).map((tile) => tile.id).sort();

    assert.deepEqual(fractionalTiles, integerTiles);
    assert.ok(fractionalTiles.includes('0,0'));
});
