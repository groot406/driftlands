import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../src/core/types/Hero.ts';
import type { TaskInstance } from '../../src/core/types/Task.ts';
import { hexDistance, tileIndex, tiles } from '../../src/shared/game/world.ts';
import { getWorldGenerationSeed } from '../../src/core/worldVariation.ts';
import {
  isWorldGenerationSpawnSafetyEnabled,
  resolveWorldTile,
  setWorldGenerationSpawnSafetyEnabled,
} from '../../src/core/worldGeneration.ts';
import { heroes, loadHeroes } from '../../src/shared/game/state/heroStore.ts';
import { settlers, loadSettlers } from '../../src/shared/game/state/settlerStore.ts';
import { loadTasks, taskStore } from '../../src/shared/game/state/taskStore.ts';
import { getPopulationSnapshot } from '../../src/shared/game/state/populationStore.ts';
import { getStorageResourceAmount } from '../../src/shared/game/state/resourceStore.ts';
import { axialDistanceCoords } from '../../src/shared/game/hex.ts';
import { setIo } from './messages/messageRouter.ts';
import { runState } from './state/runState.ts';
import { playerSettlementState } from './state/playerSettlementState.ts';
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
  playerSettlementState.reset();
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
      happiness: 100,
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

test('worldState.init clamps oversized debug world radius', async () => {
  setIo({ emit() {} });

  await worldState.init(42, 999);

  const discoveredTiles = tiles.filter((tile) => tile.discovered);
  const discoveredRings = discoveredTiles.map((tile) => hexDistance(tile.q, tile.r));

  assert.equal(Math.max(...discoveredRings), 64);
  assert.equal(discoveredTiles.length, 12481);
});

test('worldState.foundSettlementAt reveals a landing, creates a town center, and stocks it', async () => {
  setIo({ emit() {} });

  await worldState.init(42);

  const founded = worldState.foundSettlementAt(18, -4);

  assert.deepEqual(founded, { settlementId: '18,-4', q: 18, r: -4 });
  assert.equal(tileIndex['18,-4']?.terrain, 'towncenter');
  assert.equal(tileIndex['18,-4']?.discovered, true);
  assert.equal(getStorageResourceAmount('18,-4', 'food'), 12);
  assert.equal(getPopulationSnapshot().max, 30);

  const revealedLandingTiles = tiles.filter((tile) => (
    tile.discovered && axialDistanceCoords(tile.q, tile.r, 18, -4) <= 3
  ));
  assert.equal(revealedLandingTiles.length, 37);
});

test('worldState.foundSettlementAt does not create an extra town center at the world origin', async () => {
  setIo({ emit() {} });

  await worldState.init(42);

  const founded = worldState.foundSettlementAt(2, 0);

  assert.deepEqual(founded, { settlementId: '2,0', q: 2, r: 0 });
  assert.equal(tileIndex['2,0']?.terrain, 'towncenter');
  assert.equal(tileIndex['0,0']?.terrain, resolveWorldTile(0, 0, { q: 2, r: 0 }).terrain);
  assert.notEqual(tileIndex['0,0']?.terrain, 'towncenter');
});

test('worldState.foundSettlementAt reveals starter water when spawn safety is enabled', async () => {
  const previousSpawnSafety = isWorldGenerationSpawnSafetyEnabled();
  setWorldGenerationSpawnSafetyEnabled(true);
  setIo({ emit() {} });

  try {
    await worldState.init(42);

    worldState.foundSettlementAt(18, -4);

    const revealedWaterTiles = tiles.filter((tile) => (
      tile.discovered
      && tile.terrain === 'water'
      && axialDistanceCoords(tile.q, tile.r, 18, -4) <= 3
    ));
    assert.ok(revealedWaterTiles.length > 0);
  } finally {
    setWorldGenerationSpawnSafetyEnabled(previousSpawnSafety);
  }
});

test('worldState.foundSettlementAt uses the global terrain map when spawn safety is disabled', async () => {
  const previousSpawnSafety = isWorldGenerationSpawnSafetyEnabled();
  const center = { q: 18, r: -4 };
  setWorldGenerationSpawnSafetyEnabled(false);
  setIo({ emit() {} });

  try {
    await worldState.init(42);

    const expectedTerrain = new Map<string, string>();
    for (let dq = -3; dq <= 3; dq++) {
      for (let dr = Math.max(-3, -dq - 3); dr <= Math.min(3, -dq + 3); dr++) {
        const q = center.q + dq;
        const r = center.r + dr;
        expectedTerrain.set(`${q},${r}`, resolveWorldTile(q, r).terrain);
      }
    }

    worldState.foundSettlementAt(center.q, center.r);

    for (const [tileId, expected] of expectedTerrain) {
      if (tileId === `${center.q},${center.r}`) {
        assert.equal(tileIndex[tileId]?.terrain, 'towncenter');
        continue;
      }

      assert.equal(tileIndex[tileId]?.terrain, expected, `expected founded terrain to match picker terrain at ${tileId}`);
    }
  } finally {
    setWorldGenerationSpawnSafetyEnabled(previousSpawnSafety);
  }
});

test('worldState.foundSettlementAt can spawn a founder hero for the owning player', async () => {
  setIo({ emit() {} });

  await worldState.init(42);

  const founded = worldState.foundSettlementAt(22, -5, { playerId: 'player-ada', playerName: 'Ada' });

  assert.equal(founded?.founderHeroId, 'founder:player-ada');
  const founder = heroes.find((hero) => hero.id === founded?.founderHeroId);
  assert.ok(founder);
  assert.equal(founder.q, 22);
  assert.equal(founder.r, -5);
  assert.equal(founder.playerId, 'player-ada');
  assert.equal(founder.playerName, 'Ada');
});

test('worldState.foundSettlementAt uses selected starter heroes as story dialogue speakers', async () => {
  setIo({ emit() {} });

  await worldState.init(42);
  playerSettlementState.setStarterStoryHeroIds('player-ada', ['h2', 'h3']);

  const founded = worldState.foundSettlementAt(22, -5, { playerId: 'player-ada', playerName: 'Ada' });
  assert.ok(founded);

  const run = runState.getSnapshotForSettlement(founded.settlementId);
  assert.ok(run);

  const speakerNames = new Set(run.dialogue.entries.map((entry) => entry.speaker.name));
  assert.ok(speakerNames.size > 0);
  assert.ok(Array.from(speakerNames).every((name) => ['Harm', 'Jess'].includes(name)));
});
