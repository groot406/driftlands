import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Tile } from '../../core/types/Tile.ts';
import { resolveWorldTile, setWorldGenerationSpawnSafetyEnabled } from '../../core/worldGeneration.ts';
import { setWorldGenerationSeed } from '../../core/worldVariation.ts';
import { discoverTile, ensureTileExists, loadWorld, startWorldGeneration } from './world.ts';
import {
    findNearestUndiscoveredForestTile,
    findNearestUndiscoveredWaterTile,
    getForestDiscoveryHintTile,
    getWaterDiscoveryHintTile,
    hasDiscoveredForestTile,
    hasDiscoveredWaterTile,
} from './waterDiscoveryHint.ts';

function tile(q: number, r: number, terrain: Tile['terrain'], discovered = true, overrides: Partial<Tile> = {}): Tile {
    return {
        id: `${q},${r}`,
        q,
        r,
        biome: 'plains',
        terrain,
        discovered,
        isBaseTile: true,
        variant: null,
        ...overrides,
    };
}

function findOriginSensitiveWaterTile(origin: { q: number; r: number }) {
    for (let radius = 1; radius <= 18; radius++) {
        for (let q = origin.q - radius; q <= origin.q + radius; q++) {
            for (let r = origin.r - radius; r <= origin.r + radius; r++) {
                const localDistance = Math.max(Math.abs(q - origin.q), Math.abs(r - origin.r), Math.abs((q - origin.q) + (r - origin.r)));
                if (localDistance !== radius) {
                    continue;
                }

                const originTerrain = resolveWorldTile(q, r, origin).terrain;
                const defaultTerrain = resolveWorldTile(q, r).terrain;
                if (originTerrain === 'water' && defaultTerrain !== 'water') {
                    return { q, r };
                }
            }
        }
    }

    throw new Error('Unable to find origin-sensitive water tile.');
}

beforeEach(() => {
    setWorldGenerationSpawnSafetyEnabled(true);
});

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

test('water discovery hint is scoped to the settlement origin and discoveries', () => {
    loadWorld([
        tile(0, 0, 'towncenter', true, { ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
        tile(1, 0, 'water', true, { ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
        tile(20, 0, 'towncenter', true, { ownerSettlementId: '20,0', controlledBySettlementId: '20,0' }),
    ]);

    const hint = getWaterDiscoveryHintTile({ q: 20, r: 0 }, 12, '20,0');

    assert.ok(hint);
    assert.notEqual(hint.id, '1,0');
    assert.ok(Math.max(Math.abs(hint.q - 20), Math.abs(hint.r), Math.abs((hint.q - 20) + hint.r)) <= 12);
});

test('water discovery hint resolves hidden terrain using the settlement origin', () => {
    setWorldGenerationSeed(42);
    startWorldGeneration(1, 42);

    const origin = { q: 20, r: 0 };
    const target = findOriginSensitiveWaterTile(origin);
    const hint = findNearestUndiscoveredWaterTile(origin, 18);

    assert.ok(hint);
    assert.equal(hint.q, target.q);
    assert.equal(hint.r, target.r);
    assert.equal(resolveWorldTile(hint.q, hint.r, origin).terrain, 'water');
    assert.notEqual(resolveWorldTile(hint.q, hint.r).terrain, 'water');
});

test('water discovery hint follows raw generation when spawn safety is disabled', () => {
    setWorldGenerationSeed(42);
    setWorldGenerationSpawnSafetyEnabled(true);

    let starterOnlyWater: { q: number; r: number } | null = null;
    for (let q = -8; q <= 8 && !starterOnlyWater; q++) {
        for (let r = Math.max(-8, -q - 8); r <= Math.min(8, -q + 8); r++) {
            const safeTerrain = resolveWorldTile(q, r).terrain;
            setWorldGenerationSpawnSafetyEnabled(false);
            const rawTerrain = resolveWorldTile(q, r).terrain;
            setWorldGenerationSpawnSafetyEnabled(true);
            if (safeTerrain === 'water' && rawTerrain !== 'water') {
                starterOnlyWater = { q, r };
                break;
            }
        }
    }

    assert.ok(starterOnlyWater, 'expected at least one safety-only starter water tile');

    setWorldGenerationSpawnSafetyEnabled(false);
    startWorldGeneration(1, 42);

    const hint = findNearestUndiscoveredWaterTile({ q: 0, r: 0 }, 12);

    assert.ok(hint);
    assert.notDeepEqual({ q: hint.q, r: hint.r }, starterOnlyWater);
    assert.equal(resolveWorldTile(hint.q, hint.r).terrain, 'water');
});
