import assert from 'node:assert/strict';
import test from 'node:test';

import type { Settler } from '../../types/Settler';
import { getSettlerRenderFacing } from './settlerFacing';
import { getSettlerCombatHealthBar, getWatchtowerArrowStreak, isSettlerActiveWorkAnimation } from './settlerRender';

function createMovingSettler(): Settler {
    return {
        id: 'settler-test',
        q: 0,
        r: 0,
        facing: 'down',
        appearanceSeed: 1,
        homeTileId: '0,0',
        homeAccessTileId: '0,0',
        settlementId: '0,0',
        assignedWorkTileId: null,
        assignedRole: null,
        workTileId: null,
        hiddenWhileWorking: null,
        activity: 'commuting_work',
        stateSinceMs: 0,
        hungerMs: 0,
        fatigueMs: 0,
        workProgressMs: 0,
        carryingKind: null,
        movement: {
            origin: { q: 0, r: 0 },
            path: [
                { q: 1, r: 0 },
                { q: 1, r: -1 },
                { q: 0, r: -1 },
            ],
            target: { q: 0, r: -1 },
            startMs: 1_000,
            stepDurations: [200, 300, 400],
            cumulative: [200, 500, 900],
            authoritative: true,
        },
    };
}

test('getSettlerRenderFacing follows the active movement segment', () => {
    const settler = createMovingSettler();

    assert.equal(getSettlerRenderFacing(settler, 1_050), 'right');
    assert.equal(getSettlerRenderFacing(settler, 1_250), 'up');
    assert.equal(getSettlerRenderFacing(settler, 1_650), 'left');
});

test('getSettlerRenderFacing falls back to stored facing when idle', () => {
    const settler = createMovingSettler();
    settler.movement = undefined;
    settler.facing = 'left';

    assert.equal(getSettlerRenderFacing(settler, 1_500), 'left');
});

test('isSettlerActiveWorkAnimation treats defending and raiding as combat animations', () => {
    const settler = createMovingSettler();
    settler.movement = undefined;

    settler.activity = 'defending';
    assert.equal(isSettlerActiveWorkAnimation(settler), true);

    settler.activity = 'raiding';
    assert.equal(isSettlerActiveWorkAnimation(settler), true);

    settler.activity = 'idle';
    assert.equal(isSettlerActiveWorkAnimation(settler), false);
});

test('getSettlerCombatHealthBar returns percent only for damaged combat settlers', () => {
    const settler = createMovingSettler();

    settler.combatHealth = 40;
    settler.combatHealthMax = 100;
    assert.deepEqual(getSettlerCombatHealthBar(settler), { percent: 40 });

    settler.combatHealth = 100;
    assert.equal(getSettlerCombatHealthBar(settler), null);

    settler.combatHealth = null;
    settler.combatHealthMax = null;
    assert.equal(getSettlerCombatHealthBar(settler), null);
});

test('getWatchtowerArrowStreak returns a compact curved projectile segment', () => {
    const streak = getWatchtowerArrowStreak({
        source: { x: 0, y: 0 },
        target: { x: 120, y: 0 },
        now: 0,
        seed: 1,
    });

    assert.ok(streak);
    const fullDistance = Math.hypot(120, 0);
    const segmentLength = Math.hypot(streak.head.x - streak.tail.x, streak.head.y - streak.tail.y);

    assert.ok(segmentLength < fullDistance * 0.2);
    assert.ok(segmentLength >= 10);
    assert.ok(streak.head.x > streak.tail.x);
    assert.notEqual(Math.round(streak.head.y), 0);
    assert.ok(streak.alpha > 0);
    assert.ok(streak.alpha <= 1);
});
