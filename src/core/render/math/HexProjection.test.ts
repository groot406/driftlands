import assert from 'node:assert/strict';
import test from 'node:test';

import { HexProjection } from './HexProjection';

test('axial coordinates roundtrip through world space', () => {
    const samples = [
        { q: 0, r: 0 },
        { q: 3, r: -2 },
        { q: -7, r: 4 },
        { q: 12, r: 6 },
    ];

    for (const sample of samples) {
        const world = HexProjection.axialToWorld(sample.q, sample.r);
        const axial = HexProjection.worldToAxial(world.x, world.y);
        assert.deepEqual(axial, sample);
    }
});

test('screen and world conversions roundtrip through a viewport snapshot', () => {
    const viewport = {
        width: 800,
        height: 600,
        dpr: 1,
        cameraX: 120,
        cameraY: -48,
        cameraQ: 2,
        cameraR: -1,
        radius: 16,
        innerRadius: 5,
        zoom: 1.15,
        roll: 0.1,
        offsetX: 12,
        offsetY: -8,
    };

    const screen = HexProjection.worldToScreen(240, -90, viewport);
    const world = HexProjection.screenToWorld(screen.x, screen.y, viewport);

    assert.ok(Math.abs(world.worldX - 240) < 0.0001);
    assert.ok(Math.abs(world.worldY + 90) < 0.0001);
});
