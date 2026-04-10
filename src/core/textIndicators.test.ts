import assert from 'node:assert/strict';
import test from 'node:test';

import { axialToPixel } from './camera';
import { addTextIndicator, getTextIndicators } from './textIndicators';

function resetIndicators() {
    const indicators = getTextIndicators();
    indicators.splice(0, indicators.length);
}

test('addTextIndicator captures a static world anchor from the spawn position', () => {
    resetIndicators();

    const source = {
        id: 'hero-1',
        q: 4,
        r: -2,
        facing: 'down' as const,
        currentOffset: { x: 6, y: -3 },
    };
    const base = axialToPixel(source.q, source.r);

    addTextIndicator(source, '+1 xp', '#ffd700', 1800);

    const indicators = getTextIndicators();
    assert.equal(indicators.length, 1);
    assert.deepEqual(indicators[0]?.worldAnchor, {
        x: base.x + source.currentOffset.x - 8,
        y: base.y + source.currentOffset.y - 32,
    });
    assert.deepEqual(indicators[0]?.position.currentOffset, { x: 6, y: -3 });

    source.q = 12;
    source.currentOffset.x = 40;
    assert.deepEqual(indicators[0]?.worldAnchor, {
        x: base.x + 6 - 8,
        y: base.y - 3 - 32,
    });

    resetIndicators();
});
