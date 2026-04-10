import assert from 'node:assert/strict';
import test from 'node:test';

import { filterAxialItemsToViewport, isAxialCoordVisible } from './VisibilityMath';

const viewport = {
    width: 640,
    height: 480,
    dpr: 1,
    cameraX: 0,
    cameraY: 0,
    cameraQ: 0,
    cameraR: 0,
    radius: 16,
    innerRadius: 5,
    zoom: 1,
    roll: 0,
    offsetX: 0,
    offsetY: 0,
};

test('visibility math keeps tiles near the camera center', () => {
    assert.equal(isAxialCoordVisible({ q: 0, r: 0 }, viewport), true);
});

test('visibility math filters tiles outside the viewport bounds', () => {
    const items = [
        { q: 0, r: 0, id: 'center' },
        { q: 40, r: 40, id: 'far' },
    ];

    const visible = filterAxialItemsToViewport(items, viewport, 0);
    assert.deepEqual(visible.map((item) => item.id), ['center']);
});
