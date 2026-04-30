import assert from 'node:assert/strict';
import test from 'node:test';

import { axialToPixel } from './camera';
import { currentPlayer } from './socket';
import { addTextIndicator, clearTextIndicators, getTextIndicators } from './textIndicators';
import { currentPlayerSettlementId } from '../store/settlementStartStore';

function resetIndicators() {
    clearTextIndicators();
}

test.afterEach(() => {
    resetIndicators();
    currentPlayer.value = null;
    currentPlayerSettlementId.value = null;
});

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
});

test('getTextIndicators hides indicators from other players and settlements', () => {
    currentPlayer.value = { id: 'player-a', name: 'Player A' };
    currentPlayerSettlementId.value = '10,0';

    addTextIndicator({ q: 0, r: 0, playerId: 'player-a', settlementId: '10,0' }, '+1 XP', '#ffd700', 1800);
    addTextIndicator({ q: 1, r: 0, playerId: 'player-b', settlementId: '20,0' }, '+1 XP', '#ffd700', 1800);
    addTextIndicator({ q: 2, r: 0, ownerSettlementId: '10,0', controlledBySettlementId: '10,0' }, '+2', '#fff1a8', 1800);
    addTextIndicator({ q: 3, r: 0, ownerSettlementId: '20,0', controlledBySettlementId: '20,0' }, '+2', '#fff1a8', 1800);

    const indicators = getTextIndicators();
    assert.equal(indicators.length, 2);
    assert.deepEqual(indicators.map((indicator) => indicator.position.q), [0, 2]);
});
