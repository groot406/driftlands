import assert from 'node:assert/strict';
import test from 'node:test';

import { MapViewport } from './MapViewport';

test('MapViewport snapshots camera data and container size', () => {
    const viewport = new MapViewport();
    viewport.resize(1280, 720, 2);

    const snapshot = viewport.snapshot({
        q: 4,
        r: -3,
        radius: 18,
        innerRadius: 6,
    }, {
        offsetX: 5,
        offsetY: -7,
        zoom: 1.25,
        roll: 0.05,
    });

    assert.equal(snapshot.width, 1280);
    assert.equal(snapshot.height, 720);
    assert.equal(snapshot.dpr, 2);
    assert.equal(snapshot.cameraQ, 4);
    assert.equal(snapshot.cameraR, -3);
    assert.equal(snapshot.radius, 18);
    assert.equal(snapshot.innerRadius, 6);
    assert.equal(snapshot.offsetX, 5);
    assert.equal(snapshot.offsetY, -7);
    assert.equal(snapshot.zoom, 1.25);
    assert.equal(snapshot.roll, 0.05);
});
