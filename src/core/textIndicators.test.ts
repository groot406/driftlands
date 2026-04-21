import assert from 'node:assert/strict';
import test from 'node:test';

import { axialToPixel } from './camera';
import { addTextIndicator, getTextIndicators } from './textIndicators';

function resetIndicators() {
    const indicators = getTextIndicators();
    indicators.splice(0, indicators.length);
}

test('addTextIndicator captures a stable tile anchor from the spawn position', () => {
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

test('getTextIndicators stacks messages that share the same snapped anchor', () => {
    resetIndicators();

    addTextIndicator({ q: 2, r: 1, currentOffset: { x: 6, y: -3 } }, 'Discovered', '#bfdbfe', 1800);
    addTextIndicator({ q: 2, r: 1, currentOffset: { x: 6, y: -3 } }, '+3 XP', '#ffd700', 1800);
    addTextIndicator({ q: 2, r: 1, currentOffset: { x: 32, y: 0 } }, '+1 XP', '#ffd700', 1800);

    const indicators = getTextIndicators();
    assert.equal(indicators.length, 3);
    assert.equal(indicators[0]?.stackIndex, 0);
    assert.equal(indicators[1]?.stackIndex, 1);
    assert.equal(indicators[2]?.stackIndex, 0);

    resetIndicators();
});
