import assert from 'node:assert/strict';
import test from 'node:test';

import { MapPicker } from './MapPicker';

const viewport = {
    width: 800,
    height: 600,
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

test('MapPicker converts client points to axial coordinates', () => {
    const picked = MapPicker.pickAxialFromClientPoint(400, 300, { left: 0, top: 0 }, viewport);
    assert.deepEqual(picked, { q: 0, r: 0 });
});

test('MapPicker uses top-most matching bounds when hit testing', () => {
    const picked = MapPicker.pickBoundsFromClientPoint(12, 12, { left: 0, top: 0 }, [
        { entityId: 'first', left: 0, top: 0, width: 20, height: 20 },
        { entityId: 'second', left: 8, top: 8, width: 20, height: 20 },
    ]);

    assert.equal(picked?.entityId, 'second');
});
