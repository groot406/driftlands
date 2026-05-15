import assert from 'node:assert/strict';
import test from 'node:test';

import type { Settler } from '../../types/Settler';
import { getSettlerRenderFacing } from './settlerFacing';
import { isSettlerActiveWorkAnimation } from './settlerRender';

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
