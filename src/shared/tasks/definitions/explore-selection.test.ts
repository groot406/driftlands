import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../core/types/Hero';
import type { Tile } from '../../../core/types/Tile';
import { getTaskDefinition } from '../taskRegistry';
import { configureGameRuntime, resetGameRuntime } from '../../game/runtime';
import { loadWorld, tileIndex } from '../../game/world';
import { recalculateSettlementSupport, resetSettlementSupportState } from '../../../store/settlementSupportStore.ts';
import './explore';

function createDiscoveredTile(tile: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    biome: 'plains',
    discovered: true,
    isBaseTile: true,
    variant: null,
    activationState: 'active',
    ...tile,
  };
}

test.afterEach(() => {
  loadWorld([]);
  resetGameRuntime();
  resetSettlementSupportState();
});

test('explore chaining chooses a random eligible neighbor instead of the closest one', async () => {
  const townCenter = createDiscoveredTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
  });
  const frontierTile = createDiscoveredTile({
    id: '1,0',
    q: 1,
    r: 0,
    terrain: 'plains',
  });

  loadWorld([
    townCenter,
    frontierTile,
    createDiscoveredTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains' }),
    createDiscoveredTile({ id: '1,1', q: 1, r: 1, terrain: 'plains' }),
    createDiscoveredTile({ id: '0,1', q: 0, r: 1, terrain: 'plains' }),
  ]);

  const moveCalls: Array<{ q: number; r: number; task?: string }> = [];
  configureGameRuntime({
    moveHero: (_hero, target, task) => {
      moveCalls.push({ q: target.q, r: target.r, task });
    },
  });

  const hero: Hero = {
    id: 'hero-1',
    name: 'Scout',
    avatar: 'santa',
    q: frontierTile.q,
    r: frontierTile.r,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  const exploreTask = getTaskDefinition('explore');
  assert.ok(exploreTask?.onComplete);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    exploreTask.onComplete!(frontierTile, {
      id: 'task-explore',
      type: 'explore',
      tileId: frontierTile.id,
      progressXp: 0,
      requiredXp: 1,
      createdMs: 0,
      lastUpdateMs: 0,
      participants: {},
      active: true,
    }, [hero]);

    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(moveCalls, [{ q: 2, r: 0, task: 'explore' }]);
});

test('explore chaining steers toward a pending far target when one is set', async () => {
  const townCenter = createDiscoveredTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
  });
  const frontierTile = createDiscoveredTile({
    id: '1,0',
    q: 1,
    r: 0,
    terrain: 'plains',
  });

  loadWorld([
    townCenter,
    frontierTile,
    createDiscoveredTile({ id: '1,-1', q: 1, r: -1, terrain: 'plains' }),
    createDiscoveredTile({ id: '2,-1', q: 2, r: -1, terrain: 'plains' }),
    createDiscoveredTile({ id: '1,1', q: 1, r: 1, terrain: 'plains' }),
  ]);

  const moveCalls: Array<{ q: number; r: number; task?: string; taskLocation?: { q: number; r: number } }> = [];
  configureGameRuntime({
    moveHero: (_hero, target, task, taskLocation) => {
      moveCalls.push({ q: target.q, r: target.r, task, taskLocation });
    },
  });

  const hero: Hero = {
    id: 'hero-1',
    name: 'Scout',
    avatar: 'santa',
    q: frontierTile.q,
    r: frontierTile.r,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    pendingExploreTarget: { q: -2, r: 3 },
  };

  const exploreTask = getTaskDefinition('explore');
  assert.ok(exploreTask?.onComplete);

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    exploreTask.onComplete!(frontierTile, {
      id: 'task-explore-directed',
      type: 'explore',
      tileId: frontierTile.id,
      progressXp: 0,
      requiredXp: 1,
      createdMs: 0,
      lastUpdateMs: 0,
      participants: {},
      active: true,
    }, [hero]);

    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(moveCalls, [{
    q: 0,
    r: 1,
    task: 'explore',
    taskLocation: undefined,
  }]);
});

test('shore exploration reveals a small connected patch of water without sending heroes onto the water', async () => {
  const shore = createDiscoveredTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'plains',
  });
  const exploredWater = createDiscoveredTile({
    id: '0,1',
    q: 0,
    r: 1,
    terrain: 'water',
  });

  loadWorld([
    shore,
    exploredWater,
    {
      id: '0,2',
      q: 0,
      r: 2,
      biome: 'lake',
      terrain: 'water',
      discovered: false,
      isBaseTile: true,
      activationState: 'inactive',
      variant: null,
      controlledBySettlementId: '0,0',
    } satisfies Tile,
  ]);

  const moveCalls: Array<{ q: number; r: number; task?: string }> = [];
  configureGameRuntime({
    moveHero: (_hero, target, task) => {
      moveCalls.push({ q: target.q, r: target.r, task });
    },
  });

  const hero: Hero = {
    id: 'hero-1',
    name: 'Scout',
    avatar: 'santa',
    q: shore.q,
    r: shore.r,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  const exploreTask = getTaskDefinition('explore');
  assert.ok(exploreTask?.onComplete);

  exploreTask.onComplete!(exploredWater, {
    id: 'task-explore-water',
    type: 'explore',
    tileId: exploredWater.id,
    progressXp: 0,
    requiredXp: 1,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: true,
  }, [hero]);

  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(tileIndex['0,2']?.discovered, true);
  assert.equal(moveCalls.length, 0);
});

test('road reach unlocks explore tasks on the frontier just beyond the base town-center ring', () => {
  loadWorld([
    createDiscoveredTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
    }),
    createDiscoveredTile({
      id: '9,0',
      q: 9,
      r: 0,
      terrain: 'plains',
      isBaseTile: false,
      variant: 'road',
    }),
    {
      id: '10,-1',
      q: 10,
      r: -1,
      biome: 'plains',
      terrain: 'plains',
      discovered: false,
      isBaseTile: true,
      activationState: 'inactive',
      variant: null,
    } satisfies Tile,
  ]);

  recalculateSettlementSupport(0, 0);

  const exploreTask = getTaskDefinition('explore');
  const frontierTile = tileIndex['10,-1']!;
  const hero: Hero = {
    id: 'hero-1',
    name: 'Scout',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  assert.equal(frontierTile.discovered, false);
  assert.equal(exploreTask?.canStart(frontierTile, hero), true);
});
