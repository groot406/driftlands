import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorldTile } from '../../core/worldGeneration.ts';
import { setWorldGenerationSeed } from '../../core/worldVariation.ts';
import { discoverTile, ensureTileExists, startWorldGeneration } from './world.ts';
import {
    findNearestUndiscoveredForestTile,
    findNearestUndiscoveredWaterTile,
    getForestDiscoveryHintTile,
    getWaterDiscoveryHintTile,
    hasDiscoveredForestTile,
    hasDiscoveredWaterTile,
} from './waterDiscoveryHint.ts';

test('forest discovery hint finds nearby hidden starter timber', () => {
    setWorldGenerationSeed(42);
    startWorldGeneration(1, 42);

    assert.equal(hasDiscoveredForestTile(), false);

    const tile = findNearestUndiscoveredForestTile();

    assert.ok(tile);
    assert.equal(tile.discovered, false);
    assert.equal(resolveWorldTile(tile.q, tile.r).terrain, 'forest');
});

test('forest discovery hint turns off after forest is discovered', () => {
    setWorldGenerationSeed(42);
    startWorldGeneration(1, 42);

    const tile = findNearestUndiscoveredForestTile();
    assert.ok(tile);

    discoverTile(ensureTileExists(tile.q, tile.r));

    assert.equal(hasDiscoveredForestTile(), true);
    assert.equal(getForestDiscoveryHintTile(), null);
});

test('water discovery hint finds the nearest hidden starter water', () => {
    setWorldGenerationSeed(42);
    startWorldGeneration(1, 42);

    assert.equal(hasDiscoveredWaterTile(), false);

    const tile = findNearestUndiscoveredWaterTile();

    assert.ok(tile);
    assert.equal(tile.discovered, false);
    assert.equal(resolveWorldTile(tile.q, tile.r).terrain, 'water');
});

test('water discovery hint turns off after water is discovered', () => {
    setWorldGenerationSeed(42);
    startWorldGeneration(1, 42);

    const tile = findNearestUndiscoveredWaterTile();
    assert.ok(tile);

    discoverTile(ensureTileExists(tile.q, tile.r));

    assert.equal(hasDiscoveredWaterTile(), true);
    assert.equal(getWaterDiscoveryHintTile(), null);
});
