import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
    getAnimationFrameCacheKey,
    getAnimationSourceRect,
    normalizeTileAnimation,
    resolveAnimationFrameIndex,
    resolveBuildingOverlayVisual,
    resolveTerrainAnimation,
    resolveTerrainBaseVisual,
    resolveTerrainOverlayVisual,
} from './tileAnimation.ts';

const hasAsset = (key: string) => !key.startsWith('missing');

test('animation frame resolution wraps and ignores invalid metadata', () => {
    const animation = normalizeTileAnimation({ frames: 4, frameMs: 100 });

    assert.deepEqual(animation, { frames: 4, frameMs: 100 });
    assert.equal(resolveAnimationFrameIndex(animation, 0), 0);
    assert.equal(resolveAnimationFrameIndex(animation, 99), 0);
    assert.equal(resolveAnimationFrameIndex(animation, 100), 1);
    assert.equal(resolveAnimationFrameIndex(animation, 450), 0);
    assert.equal(getAnimationFrameCacheKey('water', animation, 250), 'water__f2');
    assert.deepEqual(getAnimationSourceRect(256, 64, animation, 250), {
        sx: 128,
        sy: 0,
        sw: 64,
        sh: 64,
    });

    assert.equal(normalizeTileAnimation({ frames: 1, frameMs: 100 }), null);
    assert.equal(normalizeTileAnimation({ frames: 4, frameMs: 0 }), null);
    assert.equal(getAnimationFrameCacheKey('plain', null, 250), 'plain');
});

test('legacy terrain frames resolve as terrain-only animation aliases', () => {
    assert.deepEqual(resolveTerrainAnimation({ frames: 3, frameTime: 80 }), {
        frames: 3,
        frameMs: 80,
    });
});

test('terrain base visual resolves terrain and variant animation metadata', () => {
    const terrain = {
        assetKey: 'water-v2',
        animation: { frames: 3, frameMs: 120 },
        variations: [
            { key: 'water_lily', assetKey: 'water_lily_sheet', animation: { frames: 2, frameMs: 200 } },
            { key: 'water_rocks', assetKey: 'water-v2' },
        ],
    };

    assert.deepEqual(resolveTerrainBaseVisual({ terrain: 'water' }, terrain, hasAsset), {
        assetKey: 'water-v2',
        animation: { frames: 3, frameMs: 120 },
    });
    assert.deepEqual(resolveTerrainBaseVisual({ terrain: 'water', variant: 'water_lily' }, terrain, hasAsset), {
        assetKey: 'water_lily_sheet',
        animation: { frames: 2, frameMs: 200 },
    });
    assert.deepEqual(resolveTerrainBaseVisual({ terrain: 'water', variant: 'water_rocks' }, terrain, hasAsset), {
        assetKey: 'water-v2',
        animation: { frames: 3, frameMs: 120 },
    });
});

test('terrain and building overlay visuals resolve overlay animation metadata', () => {
    assert.deepEqual(
        resolveTerrainOverlayVisual({
            overlayAssetKey: 'forest_overlay',
            overlayAnimation: { frames: 5, frameMs: 90 },
        }, hasAsset),
        {
            assetKey: 'forest_overlay',
            animation: { frames: 5, frameMs: 90 },
        },
    );

    assert.equal(
        resolveTerrainOverlayVisual(
            { overlayAssetKey: 'forest_overlay', overlayAnimation: { frames: 5, frameMs: 90 } },
            hasAsset,
            { key: 'chopped_forest', overlayAssetKey: false },
        ),
        null,
    );

    assert.deepEqual(
        resolveBuildingOverlayVisual({
            overlayAssetKey: 'building_harbor',
            overlayAnimation: { frames: 4, frameMs: 140 },
        }, hasAsset),
        {
            assetKey: 'building_harbor',
            animation: { frames: 4, frameMs: 140 },
        },
    );

    assert.deepEqual(
        resolveBuildingOverlayVisual({
            overlayAssetKey: 'building_lumber_camp_overlay',
            overlayAnimation: { frames: 6, frameMs: 120 },
            overlayAssetAnimations: {
                building_sawmill_overlay: { frames: 8, frameMs: 90 },
            },
        }, hasAsset, 'building_sawmill_overlay'),
        {
            assetKey: 'building_sawmill_overlay',
            animation: { frames: 8, frameMs: 90 },
        },
    );

    assert.deepEqual(
        resolveBuildingOverlayVisual({
            overlayAssetKey: 'building_lumber_camp_overlay',
            overlayAnimation: { frames: 6, frameMs: 120 },
        }, hasAsset, 'building_sawmill_overlay'),
        {
            assetKey: 'building_sawmill_overlay',
            animation: null,
        },
    );
});
