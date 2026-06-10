import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import {
    buildWorldAtmosphere,
    mixAtmosphereColor,
    type AtmosphereTileSample,
} from './WorldAtmosphere';

function tile(q: number, r: number, terrain: string): AtmosphereTileSample {
    return { q, r, discovered: true, terrain };
}

test('mixAtmosphereColor blends and clamps channels', () => {
    assert.deepEqual(mixAtmosphereColor([20, 30, 40], [120, 130, 140], 0.25), [45, 55, 65]);
    assert.deepEqual(mixAtmosphereColor([0, 0, 0], [400, -20, 300], 1), [255, 0, 255]);
});

test('buildWorldAtmosphere detects water mist and cold snow moods', () => {
    const waterMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'water'), tile(1, 0, 'forest'), tile(2, 0, 'plains')],
        nowMs: 2000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });
    const snowMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'snow'), tile(1, 0, 'snow'), tile(2, 0, 'mountain')],
        nowMs: 2000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });

    assert.equal(waterMood.weatherFlavor, 'mist');
    assert.equal(snowMood.weatherFlavor, 'snow');
    assert.ok(waterMood.weights.water > snowMood.weights.water);
    assert.ok(snowMood.weights.cold > waterMood.weights.cold);
});

test('buildWorldAtmosphere detects desert and volcano weather flavors', () => {
    const desertMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'dessert'), tile(1, 0, 'dessert'), tile(2, 0, 'dirt')],
        nowMs: 3200,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });
    const volcanoMood = buildWorldAtmosphere({
        tiles: [tile(0, 0, 'vulcano'), tile(1, 0, 'mountain'), tile(2, 0, 'dirt')],
        nowMs: 3200,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });

    assert.equal(desertMood.weatherFlavor, 'sand');
    assert.equal(volcanoMood.weatherFlavor, 'ash');
    assert.ok(volcanoMood.weights.ember > desertMood.weights.ember);
});

test('buildWorldAtmosphere lowers expensive intensities for low quality', () => {
    const tiles = [tile(0, 0, 'forest'), tile(1, 0, 'water'), tile(2, 0, 'grain')];
    const high = buildWorldAtmosphere({
        tiles,
        nowMs: 4000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(0),
    });
    const low = buildWorldAtmosphere({
        tiles,
        nowMs: 4000,
        cameraQ: 0,
        cameraR: 0,
        quality: getBaseRenderQualityProfile(2),
    });

    assert.ok(high.globalParticleIntensity > low.globalParticleIntensity);
    assert.ok(high.cloudDepthIntensity > low.cloudDepthIntensity);
    assert.ok(high.foregroundIntensity > low.foregroundIntensity);
});
