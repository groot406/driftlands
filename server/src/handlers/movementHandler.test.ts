import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../src/core/types/Hero.ts';
import type { Tile } from '../../../src/core/types/Tile.ts';
import { loadWorld, tileIndex } from '../../../src/shared/game/world.ts';
import { loadHeroes, heroes } from '../../../src/shared/game/state/heroStore.ts';
import { getTaskByTile, loadTasks } from '../../../src/shared/game/state/taskStore.ts';
import { setIo } from '../messages/messageRouter.ts';
import { ServerMovementHandler } from './movementHandler.ts';

function createHero(): Hero {
  return {
    id: 'shore-scout',
    name: 'Scout',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 2, spd: 2 },
    facing: 'down',
  };
}

test.afterEach(() => {
  loadWorld([]);
  loadHeroes([]);
  loadTasks([]);
  ServerMovementHandler.getInstance().activeMovements.clear();
});

test('moveHero starts explore immediately when already at shoreline access for water', () => {
  setIo({ emit() {} });

  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'towncenter',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: false,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([createHero()]);

  const hero = heroes[0]!;
  const shoreTile = tileIndex['0,0']!;
  const waterTile = tileIndex['0,1']!;

  ServerMovementHandler.getInstance().moveHero(
    hero,
    { q: shoreTile.q, r: shoreTile.r },
    'explore',
    { q: waterTile.q, r: waterTile.r },
  );

  const task = getTaskByTile(waterTile.id, 'explore');

  assert.ok(task);
  assert.equal(hero.currentTaskId, task?.id);
  assert.equal(hero.pendingTask, undefined);
  assert.equal(ServerMovementHandler.getInstance().activeMovements.size, 0);
});
