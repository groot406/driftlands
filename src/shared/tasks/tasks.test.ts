import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../core/types/Hero.ts';
import type { TaskInstance } from '../../core/types/Task.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { configureGameRuntime, resetGameRuntime } from '../game/runtime.ts';
import { heroes, loadHeroes } from '../../store/heroStore.ts';
import { depositResourceToStorage, resetResourceState, getStorageResourceAmount } from '../../store/resourceStore.ts';
import { loadTasks, startTask } from '../../store/taskStore.ts';
import { getTaskDefinition } from './taskRegistry.ts';
import { getAvailableTasks, handleHeroArrival } from './tasks.ts';
import { loadWorld, tileIndex } from '../game/world.ts';

function cloneHero(hero: Hero): Hero {
  return {
    ...hero,
    stats: { ...hero.stats },
    movement: hero.movement
      ? {
          ...hero.movement,
          origin: { ...hero.movement.origin },
          target: { ...hero.movement.target },
          path: hero.movement.path.map((step) => ({ ...step })),
          stepDurations: hero.movement.stepDurations.slice(),
          cumulative: hero.movement.cumulative.slice(),
        }
      : undefined,
    pendingTask: hero.pendingTask ? { ...hero.pendingTask } : undefined,
    carryingPayload: hero.carryingPayload ? { ...hero.carryingPayload } : undefined,
    pendingChain: hero.pendingChain ? { ...hero.pendingChain } : undefined,
    returnPos: hero.returnPos ? { ...hero.returnPos } : undefined,
    currentOffset: hero.currentOffset ? { ...hero.currentOffset } : undefined,
    lastSoundPosition: hero.lastSoundPosition ? { ...hero.lastSoundPosition } : undefined,
  };
}

const originalHeroes = heroes.map(cloneHero);

test.afterEach(() => {
  loadWorld([]);
  loadTasks([]);
  resetResourceState();
  resetGameRuntime();
  loadHeroes(originalHeroes.map(cloneHero));
});

test('inactive controlled tiles no longer offer a manual restore action', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
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
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  const availableTasks = getAvailableTasks(tileIndex['1,0']!, hero);
  assert.equal(availableTasks.some((task) => task.key === 'restoreTile'), false);
});

test('inactive discovered tiles do not offer or start normal work tasks', () => {
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
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  const availableTasks = getAvailableTasks(tileIndex['1,0']!, hero);

  assert.equal(availableTasks.some((task) => task.key === 'forage'), false);
  assert.equal(startTask(tileIndex['1,0']!, 'forage', hero), null);
});

test('adjacent dock deliveries are applied to the task before the town center warehouse', () => {
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
      variant: null,
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([
    {
      id: 'h1',
      name: 'Santa',
      avatar: 'santa',
      q: 0,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      pendingTask: { tileId: '0,1', taskType: 'buildDock' },
      carryingPayload: { type: 'wood', amount: 5 },
    } satisfies Hero,
  ]);

  const dockTask: TaskInstance = {
    id: 'task-dock',
    type: 'buildDock',
    tileId: '0,1',
    progressXp: 0,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: false,
    requiredResources: [{ type: 'wood', amount: 5 }],
    collectedResources: [],
    context: { adjacentActiveAccess: true },
  };
  loadTasks([dockTask]);

  const hero = heroes[0]!;
  const townCenter = tileIndex['0,0']!;
  handleHeroArrival(hero, townCenter);

  assert.equal(hero.currentTaskId, 'task-dock');
  assert.equal(hero.pendingTask, undefined);
  assert.equal(hero.carryingPayload, undefined);
  assert.deepEqual(dockTask.collectedResources, [{ type: 'wood', amount: 5 }]);
  assert.equal(dockTask.active, true);
  assert.equal(getStorageResourceAmount('0,0', 'wood'), 0);
});

test('fetch return for dock tasks preserves the water tile as logical task location', () => {
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
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
    {
      id: '1,1',
      q: 1,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  depositResourceToStorage('0,0', 'wood', 5);

  loadHeroes([
    {
      id: 'h1',
      name: 'Santa',
      avatar: 'santa',
      q: 0,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      pendingTask: { tileId: '1,1', taskType: 'buildDock' },
      carryingPayload: { type: 'wood', amount: -5 },
      returnPos: { q: 1, r: 0 },
    } satisfies Hero,
  ]);

  let moveCall: { target: { q: number; r: number }; task?: string; taskLocation?: { q: number; r: number } } | null = null;
  configureGameRuntime({
    moveHero: (_hero, target, task, taskLocation) => {
      moveCall = { target, task, taskLocation };
    },
  });

  const hero = heroes[0]!;
  const warehouseTile = tileIndex['0,0']!;
  handleHeroArrival(hero, warehouseTile);

  assert.deepEqual(moveCall, {
    target: { q: 1, r: 0 },
    task: 'buildDock',
    taskLocation: { q: 1, r: 1 },
  });
});

test('heroes can fetch irrigation water from active shore next to discovered inactive water', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'dirt',
      terrain: 'dirt',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: 'dirt_tilled_draught',
    } satisfies Tile,
  ]);

  loadHeroes([
    {
      id: 'h1',
      name: 'Santa',
      avatar: 'santa',
      q: 0,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      pendingTask: { tileId: '1,0', taskType: 'irregateDirtTask' },
      carryingPayload: { type: 'water', amount: -1 },
      returnPos: { q: 1, r: 0 },
    } satisfies Hero,
  ]);

  let moveCall: { target: { q: number; r: number }; task?: string; taskLocation?: { q: number; r: number } } | null = null;
  configureGameRuntime({
    moveHero: (_hero, target, task, taskLocation) => {
      moveCall = { target, task, taskLocation };
    },
  });

  const hero = heroes[0]!;
  const shoreTile = tileIndex['0,0']!;
  handleHeroArrival(hero, shoreTile);

  assert.deepEqual(hero.carryingPayload, { type: 'water', amount: 1 });
  assert.deepEqual(moveCall, {
    target: { q: 1, r: 0 },
    task: 'irregateDirtTask',
    taskLocation: { q: 1, r: 0 },
  });
});

test('harvesting water lilies always yields exactly one lily resource', () => {
  const def = getTaskDefinition('harvestWaterLilies');
  assert.deepEqual(def?.totalRewardedResources?.(999), { type: 'water_lily', amount: 1 });
});

test('adjacent lily-path deliveries are applied to placement tasks before warehouse storage', () => {
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
      variant: null,
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'water_lily',
    } satisfies Tile,
    {
      id: '0,2',
      q: 0,
      r: 2,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([
    {
      id: 'h1',
      name: 'Santa',
      avatar: 'santa',
      q: 0,
      r: 1,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      pendingTask: { tileId: '0,2', taskType: 'placeWaterLilies' },
      carryingPayload: { type: 'water_lily', amount: 1 },
    } satisfies Hero,
  ]);

  const placeTask: TaskInstance = {
    id: 'task-place-lilies',
    type: 'placeWaterLilies',
    tileId: '0,2',
    progressXp: 0,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: false,
    requiredResources: [{ type: 'water_lily', amount: 1 }],
    collectedResources: [],
    context: { adjacentWalkableAccess: true },
  };
  loadTasks([placeTask]);

  const hero = heroes[0]!;
  const lilyAccessTile = tileIndex['0,1']!;
  handleHeroArrival(hero, lilyAccessTile);

  assert.equal(hero.currentTaskId, 'task-place-lilies');
  assert.equal(hero.pendingTask, undefined);
  assert.equal(hero.carryingPayload, undefined);
  assert.deepEqual(placeTask.collectedResources, [{ type: 'water_lily', amount: 1 }]);
  assert.equal(placeTask.active, true);
  assert.equal(getStorageResourceAmount('0,0', 'water_lily'), 0);
});
