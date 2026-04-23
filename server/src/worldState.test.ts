import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../src/core/types/Hero.ts';
import type { TaskInstance } from '../../src/core/types/Task.ts';
import { hexDistance, tiles } from '../../src/shared/game/world.ts';
import { getWorldGenerationSeed } from '../../src/core/worldVariation.ts';
import { heroes, loadHeroes } from '../../src/shared/game/state/heroStore.ts';
import { settlers, loadSettlers } from '../../src/shared/game/state/settlerStore.ts';
import { loadTasks, taskStore } from '../../src/shared/game/state/taskStore.ts';
import { setIo } from './messages/messageRouter.ts';
import { runState } from './state/runState.ts';
import { worldState } from './worldState.ts';

const RESTORE_SEED = 123456789;

function createDirtyHero(): Hero {
  return {
    id: 'debug-hero',
    name: 'Debug Hero',
    avatar: 'santa',
    q: 6,
    r: -4,
    stats: { xp: 33, hp: 77, atk: 8, spd: 2 },
    facing: 'left',
    currentTaskId: 'task-debug',
    pendingTask: { tileId: '2,-1', taskType: 'explore' },
    carryingPayload: { type: 'wood', amount: 2 },
  };
}

function createDirtyTask(): TaskInstance {
  return {
    id: 'task-debug',
    type: 'explore',
    tileId: '2,-1',
    progressXp: 3,
    requiredXp: 10,
    createdMs: 1,
    lastUpdateMs: 1,
    participants: { 'debug-hero': 3 },
    active: true,
  };
}

test.afterEach(async () => {
  await worldState.init(RESTORE_SEED);
});

test('worldState.init uses the provided seed and resets hero/task state', async () => {
  const originalEnvSeed = process.env.SERVER_SEED;

  try {
    setIo({ emit() {} });
    delete process.env.SERVER_SEED;
    loadHeroes([createDirtyHero()]);
    loadSettlers([{
      id: 'settler-debug',
      q: 4,
      r: 4,
      facing: 'left',
      appearanceSeed: 99,
      homeTileId: '0,0',
      homeAccessTileId: '0,0',
      settlementId: '0,0',
      assignedWorkTileId: null,
      activity: 'idle',
      stateSinceMs: 1,
      hungerMs: 0,
      fatigueMs: 0,
      workProgressMs: 0,
      carryingKind: null,
    }]);
    loadTasks([createDirtyTask()]);

    await worldState.init(42);

    assert.equal(runState.getSnapshot()?.seed, 42);
    assert.equal(getWorldGenerationSeed(), 42);
    assert.equal(taskStore.tasks.length, 0);
    assert.ok(heroes.length > 0);
    assert.equal(settlers.length, 0);
    assert.ok(heroes.every((hero) => hero.q === 0 && hero.r === 0));
    assert.ok(heroes.every((hero) => !hero.currentTaskId && !hero.pendingTask && !hero.carryingPayload));
  } finally {
    if (originalEnvSeed === undefined) {
      delete process.env.SERVER_SEED;
    } else {
      process.env.SERVER_SEED = originalEnvSeed;
    }
  }
});

test('worldState.init rolls a random seed when no seed is provided', async () => {
  const originalEnvSeed = process.env.SERVER_SEED;
  const originalRandom = Math.random;

  try {
    setIo({ emit() {} });
    delete process.env.SERVER_SEED;
    Math.random = () => 0.5;

    await worldState.init();

    assert.equal(runState.getSnapshot()?.seed, 0x80000000);
    assert.equal(getWorldGenerationSeed(), 0x80000000);
  } finally {
    Math.random = originalRandom;
    if (originalEnvSeed === undefined) {
      delete process.env.SERVER_SEED;
    } else {
      process.env.SERVER_SEED = originalEnvSeed;
    }
  }
});

test('worldState.init respects the requested world radius', async () => {
  setIo({ emit() {} });

  await worldState.init(42, 3);

  const discoveredTiles = tiles.filter((tile) => tile.discovered);
  const discoveredRings = discoveredTiles.map((tile) => hexDistance(tile.q, tile.r));

  assert.equal(Math.max(...discoveredRings), 3);
  assert.equal(discoveredTiles.length, 37);
});
