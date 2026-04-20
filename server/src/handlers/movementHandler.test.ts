import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../src/core/types/Hero.ts';
import type { Tile } from '../../../src/core/types/Tile.ts';
import { loadWorld, tileIndex } from '../../../src/shared/game/world.ts';
import { loadHeroes, heroes } from '../../../src/shared/game/state/heroStore.ts';
import { getTaskByTile, loadTasks } from '../../../src/shared/game/state/taskStore.ts';
import { setIo } from '../messages/messageRouter.ts';
import { coopState } from '../state/coopState.ts';
import { ServerMovementHandler } from './movementHandler.ts';
import { SCOUT_RESOURCE_TASK_TYPE } from '../../../src/shared/game/scoutResources.ts';

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
  coopState.resetHeroClaims();
  coopState.removePlayer('socket-1');
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

test('move request can materialize an undiscovered explore tile before validation', () => {
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
  ]);

  loadHeroes([createHero()]);
  coopState.upsertPlayer({ id: 'socket-1' } as any, 'Player');

  const handler = ServerMovementHandler.getInstance();
  (handler as any).handleMoveRequest({ id: 'socket-1' }, {
    type: 'hero:move_request',
    id: 'req-1',
    heroId: 'shore-scout',
    origin: { q: 0, r: 0 },
    target: { q: 1, r: 0 },
    startAt: Date.now(),
    path: [{ q: 1, r: 0 }],
    task: 'explore',
    taskLocation: { q: 1, r: 0 },
    exploreTarget: { q: 8, r: 0 },
  });

  const hero = heroes[0]!;

  assert.ok(tileIndex['1,0']);
  assert.equal(handler.activeMovements.size, 1);
  assert.deepEqual(hero.pendingTask, { tileId: '1,0', taskType: 'explore' });
  assert.deepEqual(hero.pendingExploreTarget, { q: 8, r: 0 });
});

test('scouted fog can only be crossed by scout movement requests', () => {
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
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([createHero()]);
  coopState.upsertPlayer({ id: 'socket-1' } as any, 'Player');

  const handler = ServerMovementHandler.getInstance();
  const socket = { id: 'socket-1' };
  const baseRequest = {
    type: 'hero:move_request',
    heroId: 'shore-scout',
    origin: { q: 0, r: 0 },
    target: { q: 2, r: 0 },
    startAt: Date.now(),
    path: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
    taskLocation: { q: 2, r: 0 },
  };

  (handler as any).handleMoveRequest(socket, {
    ...baseRequest,
    id: 'explore-through-scouted-fog',
    task: 'explore',
  });

  assert.equal(handler.activeMovements.size, 0);

  (handler as any).handleMoveRequest(socket, {
    ...baseRequest,
    id: 'scout-through-scouted-fog',
    task: SCOUT_RESOURCE_TASK_TYPE,
  });

  assert.equal(handler.activeMovements.size, 1);
  assert.deepEqual(heroes[0]?.pendingTask, { tileId: '2,0', taskType: SCOUT_RESOURCE_TASK_TYPE });
});

test('internal return movement can cross scouted fog without assigning a task', () => {
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
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const hero = createHero();
  hero.q = 2;
  hero.r = 0;
  loadHeroes([hero]);
  const loadedHero = heroes[0]!;

  const handler = ServerMovementHandler.getInstance();
  handler.moveHero(loadedHero, { q: 0, r: 0 }, undefined, undefined, { allowScouted: true });

  assert.equal(handler.activeMovements.size, 1);
  assert.equal(loadedHero.pendingTask, undefined);
  assert.deepEqual(loadedHero.movement?.target, { q: 0, r: 0 });
});
