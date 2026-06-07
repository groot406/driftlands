import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../core/types/Hero.ts';
import type { TaskInstance } from '../../core/types/Task.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { terrainPositions } from '../../core/terrainRegistry.ts';
import { configureGameRuntime, resetGameRuntime } from '../game/runtime.ts';
import { heroes, loadHeroes } from '../../store/heroStore.ts';
import { depositResourceToStorage, resetResourceState, getStorageResourceAmount } from '../../store/resourceStore.ts';
import { addResourcesToTask, canStartTaskWhileCarrying, detachHeroFromCurrentTask, joinTask, leaveTask, loadTasks, startTask, taskStore, updateActiveTasks } from '../../store/taskStore.ts';
import { loadPopulationSnapshot, resetPopulationState } from '../../store/populationStore.ts';
import { loadTestModeSettings, resetTestModeSettings } from '../game/testMode.ts';
import { loadStoryProgression, setStoryProgressionForMission } from '../story/progressionState.ts';
import { createInitialProgressionSnapshot, evaluateProgression } from '../story/progression.ts';
import { getTaskDefinition, registerTask } from './taskRegistry.ts';
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
  resetPopulationState();
  resetGameRuntime();
  resetTestModeSettings();
  loadStoryProgression(null);
  loadHeroes(originalHeroes.map(cloneHero));
});

test('shared food requirements accept fish, meat, and bread sources', () => {
  const task: TaskInstance = {
    id: 'task-food',
    type: 'buildTownCenter',
    tileId: '0,0',
    progressXp: 0,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: false,
    requiredResources: [{ type: 'food', amount: 3 }],
    collectedResources: [],
  };

  assert.equal(addResourcesToTask(task, { type: 'meat', amount: 2 }), 2);
  assert.deepEqual(task.collectedResources, [{ type: 'food', amount: 2 }]);
  assert.equal(task.active, false);

  assert.equal(addResourcesToTask(task, { type: 'fish', amount: 2 }), 1);
  assert.deepEqual(task.collectedResources, [{ type: 'food', amount: 3 }]);
  assert.equal(task.active, true);
});

test('building tasks can be placed while the hero is carrying unrelated cargo', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string; active?: boolean }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
    moveHero() {
      assert.fail('hero should not fetch resources while already carrying unrelated cargo');
    },
  });

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
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 1,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
    carryingPayload: { type: 'stone', amount: 3 },
  } satisfies Hero]);

  const buildRoad = getTaskDefinition('buildRoad');
  assert.ok(buildRoad);
  assert.equal(canStartTaskWhileCarrying(heroes[0]!, buildRoad, tileIndex['1,0']!), true);

  const task = startTask(tileIndex['1,0']!, 'buildRoad', heroes[0]!);

  assert.ok(task);
  assert.equal(task.active, false);
  assert.deepEqual(task.requiredResources, [{ type: 'wood', amount: 2 }]);
  assert.deepEqual(task.collectedResources, []);
  assert.deepEqual(heroes[0]?.carryingPayload, { type: 'stone', amount: 3 });
  assert.equal(heroes[0]?.currentTaskId, task.id);
  assert.equal(heroes[0]?.pendingTask, undefined);
  assert.equal(heroes[0]?.returnPos, undefined);
  assert.equal(taskStore.tasksByTile['1,0']?.buildRoad, task.id);
  assert.equal(messages.some((message) => message.type === 'task:created' && message.taskId === task.id), true);
});

test('leaving the final participant pauses an unfinished build task so it can be continued', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    currentTaskId: 'task-build',
  } satisfies Hero]);

  const task: TaskInstance = {
    id: 'task-build',
    type: 'buildDock',
    tileId: '0,1',
    progressXp: 25,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: { h1: 25 },
    active: false,
    requiredResources: [{ type: 'wood', amount: 5 }],
    collectedResources: [{ type: 'wood', amount: 3 }],
  };
  loadTasks([task]);

  leaveTask('task-build', heroes[0]!);

  assert.equal(taskStore.tasks.includes(task), true);
  assert.equal(taskStore.taskIndex['task-build'], task);
  assert.equal(taskStore.tasksByTile['0,1']?.buildDock, 'task-build');
  assert.equal(taskStore.tasksByRequiredResource.get('wood')?.has('task-build'), true);
  assert.equal(task.active, false);
  assert.deepEqual(task.participants, {});
  assert.equal(heroes[0]?.currentTaskId, undefined);
  assert.equal(messages.some((message) => message.type === 'task:removed'), false);
  assert.equal(messages.some((message) => message.type === 'task:progress' && message.taskId === 'task-build'), true);
});

test('active tasks with no working participants are paused instead of removed', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string; active?: boolean }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

  loadWorld([{
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
  } satisfies Tile]);

  const task: TaskInstance = {
    id: 'task-build',
    type: 'buildDock',
    tileId: '0,1',
    progressXp: 25,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: { h1: 25 },
    active: true,
    requiredResources: [{ type: 'wood', amount: 5 }],
    collectedResources: [{ type: 'wood', amount: 5 }],
  };
  loadTasks([task]);

  updateActiveTasks([]);

  assert.equal(taskStore.tasks.includes(task), true);
  assert.equal(taskStore.taskIndex['task-build'], task);
  assert.equal(taskStore.tasksByTile['0,1']?.buildDock, 'task-build');
  assert.equal(task.active, false);
  assert.equal(taskStore.activeTaskIds.has('task-build'), false);
  assert.equal(messages.some((message) => message.type === 'task:removed'), false);
  assert.equal(messages.some((message) => message.type === 'task:progress' && message.taskId === 'task-build' && message.active === false), true);
});

test('task updates can skip paused-task cleanup on latency-sensitive command paths', () => {
  let canStartCalls = 0;
  registerTask({
    key: 'latencyProbe',
    label: 'Latency Probe',
    canStart() {
      canStartCalls += 1;
      return true;
    },
    requiredXp() {
      return 1_000;
    },
    heroRate() {
      return 0;
    },
    canAutoChainTo() {
      return false;
    },
  });

  const worldTiles: Tile[] = [];
  const tasks: TaskInstance[] = [];
  for (let q = 0; q <= 80; q++) {
    worldTiles.push({
      id: `${q},0`,
      q,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile);

    tasks.push({
      id: `paused-${q}`,
      type: 'latencyProbe',
      tileId: `${q},0`,
      progressXp: 0,
      requiredXp: 1_000,
      createdMs: 0,
      lastUpdateMs: 0,
      participants: {},
      active: false,
      requiredResources: [{ type: 'wood', amount: 1 }],
      collectedResources: [],
    });
  }

  loadWorld(worldTiles);
  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
    currentTaskId: 'active-task',
  } satisfies Hero]);
  loadTasks([
    ...tasks,
    {
      id: 'active-task',
      type: 'latencyProbe',
      tileId: '0,0',
      progressXp: 0,
      requiredXp: 1_000,
      createdMs: Date.now(),
      lastUpdateMs: Date.now(),
      participants: { h1: 0 },
      active: true,
    },
  ]);

  canStartCalls = 0;
  updateActiveTasks(heroes, { cleanupOpenTasks: false });

  assert.equal(canStartCalls, 0);
  assert.equal(taskStore.tasks.length, 82);
  assert.equal(taskStore.activeTaskIds.has('active-task'), true);
});

test('leaving a task with no dropped resources removes it instead of making it continuable', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

  loadWorld([{
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
  } satisfies Tile]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);

  const task = startTask(tileIndex['0,0']!, 'plantTrees', heroes[0]!);
  assert.ok(task);

  leaveTask(task.id, heroes[0]!);

  assert.equal(taskStore.taskIndex[task.id], undefined);
  assert.equal(taskStore.tasksByTile['0,0']?.plantTrees, undefined);
  assert.equal(taskStore.activeTaskIds.has(task.id), false);
  assert.equal(heroes[0]?.currentTaskId, undefined);
  assert.equal(messages.some((message) => message.type === 'task:removed' && message.taskId === task.id), true);
});

test('joining a paused resource-cost task without dropped resources keeps it continuable', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

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
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);

  const task: TaskInstance = {
    id: 'task-build',
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
  };
  loadTasks([task]);

  joinTask(task.id, heroes[0]!);

  assert.equal(taskStore.taskIndex[task.id], task);
  assert.equal(taskStore.tasksByTile['0,1']?.buildDock, task.id);
  assert.equal(taskStore.activeTaskIds.has(task.id), false);
  assert.equal(heroes[0]?.currentTaskId, task.id);
  assert.equal(messages.some((message) => message.type === 'task:removed' && message.taskId === task.id), false);
});

test('tasks waiting for a hero to fetch resources are not cancelled before resources are dropped', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  let fetchMovementStarted = false;
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
    moveHero(hero) {
      fetchMovementStarted = true;
      detachHeroFromCurrentTask(hero);
    },
  });

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
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'mountain',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 1,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);

  loadStoryProgression(evaluateProgression({
    population: 5,
    beds: 5,
    frontierDistance: 0,
    resourceStock: { bread: 8, wood: 12 },
    buildingCounts: { house: 2, supplyDepot: 1, watchtower: 1 },
    operationalBuildingCounts: {},
    discoveredTerrains: ['mountain', 'water', 'forest'],
    landingTerrains: [],
    unlockedHeroIds: [],
    completedStudyKeys: [],
    heroAbilityChargesEarned: 0,
  }), '0,0');
  depositResourceToStorage('0,0', 'wood', 10);

  const task = startTask(tileIndex['2,0']!, 'buildMine', heroes[0]!);
  assert.ok(task);
  assert.equal(fetchMovementStarted, true);
  assert.equal(task.active, false);
  assert.deepEqual(task.collectedResources, []);
  assert.deepEqual(task.participants, {});
  assert.equal(heroes[0]?.currentTaskId, undefined);
  assert.deepEqual(heroes[0]?.pendingTask, { tileId: '2,0', taskType: 'buildMine' });
  assert.deepEqual(heroes[0]?.carryingPayload, { type: 'wood', amount: -10 });

  updateActiveTasks(heroes);

  assert.equal(taskStore.taskIndex[task.id], task);
  assert.equal(taskStore.tasksByTile['2,0']?.buildMine, task.id);
  assert.equal(task.active, false);
  assert.equal(messages.some((message) => message.type === 'task:removed' && message.taskId === task.id), false);

  heroes[0]!.carryingPayload = { type: 'wood', amount: 10 };
  updateActiveTasks(heroes);

  assert.equal(taskStore.taskIndex[task.id], task);
  assert.equal(taskStore.tasksByTile['2,0']?.buildMine, task.id);
  assert.equal(messages.some((message) => message.type === 'task:removed' && message.taskId === task.id), false);
});

test('heroes joining the same build task fetch material from unreserved warehouse stock', () => {
  const fetchTargets = new Map<string, { q: number; r: number }>();
  configureGameRuntime({
    moveHero(hero, target) {
      fetchTargets.set(hero.id, { q: target.q, r: target.r });
      hero.movement = {
        origin: { q: hero.q, r: hero.r },
        target: { q: target.q, r: target.r },
        path: [{ q: target.q, r: target.r }],
        startMs: 0,
        stepDurations: [1],
        cumulative: [1],
      };
    },
  });

  registerTask({
    key: 'buildMaterialReservationProbe',
    label: 'Build Material Reservation Probe',
    canStart() {
      return true;
    },
    requiredXp() {
      return 1_000;
    },
    heroRate() {
      return 1;
    },
    requiredResources() {
      return [{ type: 'wood', amount: 20 }];
    },
  });

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
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'plains_warehouse',
    } satisfies Tile,
    {
      id: '3,0',
      q: 3,
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
  ]);

  loadHeroes([
    {
      id: 'h1',
      name: 'Santa',
      avatar: 'santa',
      q: 1,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      settlementId: '0,0',
    } satisfies Hero,
    {
      id: 'h2',
      name: 'Rudolph',
      avatar: 'rudolph',
      q: 1,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      settlementId: '0,0',
    } satisfies Hero,
  ]);
  depositResourceToStorage('0,0', 'wood', 10);
  depositResourceToStorage('2,0', 'wood', 10);

  const task: TaskInstance = {
    id: 'task-build',
    type: 'buildMaterialReservationProbe',
    tileId: '3,0',
    progressXp: 0,
    requiredXp: 1_000,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: false,
    requiredResources: [{ type: 'wood', amount: 20 }],
    collectedResources: [],
  };
  loadTasks([task]);

  joinTask(task.id, heroes[0]!);
  joinTask(task.id, heroes[1]!);

  assert.deepEqual(fetchTargets.get('h1'), { q: 0, r: 0 });
  assert.deepEqual(fetchTargets.get('h2'), { q: 2, r: 0 });
  assert.deepEqual(heroes[0]?.carryingPayload, { type: 'wood', amount: -10 });
  assert.deepEqual(heroes[1]?.carryingPayload, { type: 'wood', amount: -10 });
});

test('starting a new task removes other open tasks on the same tile', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

  loadWorld([{
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
  } satisfies Tile]);

  loadHeroes([
    {
      id: 'starter',
      name: 'Santa',
      avatar: 'santa',
      q: 0,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      settlementId: '0,0',
    } satisfies Hero,
    {
      id: 'worker',
      name: 'Rudolph',
      avatar: 'rudolph',
      q: 0,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      settlementId: '0,0',
      currentTaskId: 'task-road',
    } satisfies Hero,
    {
      id: 'fetcher',
      name: 'Hermey',
      avatar: 'boy',
      q: 1,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'left',
      settlementId: '0,0',
      pendingTask: { tileId: '0,0', taskType: 'buildRoad' },
      carryingPayload: { type: 'wood', amount: -5 },
      returnPos: { q: 0, r: 0 },
    } satisfies Hero,
  ]);

  const roadTask: TaskInstance = {
    id: 'task-road',
    type: 'buildRoad',
    tileId: '0,0',
    progressXp: 25,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: { worker: 25 },
    active: false,
    requiredResources: [],
    collectedResources: [],
  };
  loadTasks([roadTask]);

  const treeTask = startTask(tileIndex['0,0']!, 'plantTrees', heroes[0]!);

  assert.ok(treeTask);
  assert.equal(treeTask.type, 'plantTrees');
  assert.equal(taskStore.taskIndex['task-road'], undefined);
  assert.equal(taskStore.tasksByTile['0,0']?.buildRoad, undefined);
  assert.equal(taskStore.tasksByTile['0,0']?.plantTrees, treeTask.id);
  assert.equal(heroes[1]?.currentTaskId, undefined);
  assert.equal(heroes[2]?.pendingTask, undefined);
  assert.equal(heroes[2]?.carryingPayload, undefined);
  assert.equal(heroes[2]?.returnPos, undefined);
  assert.equal(messages.some((message) => message.type === 'task:removed' && message.taskId === 'task-road'), true);
});

test('tasks are cancelled when their tile changes into an invalid state', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

  loadWorld([{
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
  } satisfies Tile]);

  const task: TaskInstance = {
    id: 'task-plant',
    type: 'plantTrees',
    tileId: '0,0',
    progressXp: 25,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: false,
    requiredResources: [],
    collectedResources: [],
  };
  loadTasks([task]);

  const tile = tileIndex['0,0']!;
  tile.terrain = 'forest';
  tile.variant = 'young_forest';
  tile.isBaseTile = false;

  updateActiveTasks([]);

  assert.equal(taskStore.taskIndex['task-plant'], undefined);
  assert.equal(taskStore.tasksByTile['0,0']?.plantTrees, undefined);
  assert.equal(messages.some((message) => message.type === 'task:removed' && message.taskId === 'task-plant'), true);
});

test('leaving one participant keeps an inactive build task assigned to another fetcher', () => {
  const messages: Array<{ type: string; taskId?: string; tileId?: string }> = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });

  loadHeroes([
    {
      id: 'h1',
      name: 'Santa',
      avatar: 'santa',
      q: 0,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      currentTaskId: 'task-build',
    } satisfies Hero,
    {
      id: 'h2',
      name: 'Rudolph',
      avatar: 'rudolph',
      q: 1,
      r: 0,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      currentTaskId: 'task-build',
      pendingTask: { tileId: '0,1', taskType: 'buildDock' },
      carryingPayload: { type: 'wood', amount: -5 },
      returnPos: { q: 0, r: 1 },
    } satisfies Hero,
  ]);

  const task: TaskInstance = {
    id: 'task-build',
    type: 'buildDock',
    tileId: '0,1',
    progressXp: 25,
    requiredXp: 100,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: { h1: 25, h2: 0 },
    active: false,
    requiredResources: [{ type: 'wood', amount: 5 }],
    collectedResources: [{ type: 'wood', amount: 3 }],
  };
  loadTasks([task]);

  leaveTask('task-build', heroes[0]!);

  assert.equal(taskStore.taskIndex['task-build'], task);
  assert.equal(taskStore.tasksByTile['0,1']?.buildDock, 'task-build');
  assert.deepEqual(task.participants, { h2: 0 });
  assert.equal(heroes[0]?.currentTaskId, undefined);
  assert.equal(heroes[1]?.currentTaskId, 'task-build');
  assert.equal(messages.some((message) => message.type === 'task:removed'), false);
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

  assert.equal(availableTasks.some((task) => task.key === 'hunt'), false);
  assert.equal(startTask(tileIndex['1,0']!, 'hunt', hero), null);
});

test('damaged maintained buildings offer a hero repair task with maintenance materials', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'forest_sawmill',
      condition: 45,
      conditionState: 'worn',
    } satisfies Tile,
  ]);

  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 2, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  };

  const repairTask = getAvailableTasks(tileIndex['0,0']!, hero).find((task) => task.key === 'repairBuilding');

  assert.ok(repairTask);
  assert.equal(repairTask.label, 'Repair Building');
  assert.deepEqual(repairTask.requiredResources?.(0, tileIndex['0,0']!), [
    { type: 'wood', amount: 1 },
    { type: 'stone', amount: 1 },
  ]);
  assert.ok(startTask(tileIndex['0,0']!, 'repairBuilding', hero));
});

test('healthy and non-maintained tiles do not offer hero repair', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'forest_lumber_camp',
      condition: 100,
      conditionState: 'healthy',
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
    stats: { xp: 10, hp: 10, atk: 2, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  };

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'repairBuilding'), false);
  assert.equal(getAvailableTasks(tileIndex['1,0']!, hero).some((task) => task.key === 'repairBuilding'), false);
});

test('hero repair completion restores building condition', () => {
  const tile: Tile = {
    id: '0,0',
    q: 0,
    r: 0,
    biome: 'forest',
    terrain: 'forest',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: 'forest_lumber_camp',
    condition: 30,
    conditionState: 'damaged',
  };
  const repairTask = getTaskDefinition('repairBuilding');

  repairTask?.onComplete?.(tile, {
    id: 'task-repair',
    type: 'repairBuilding',
    tileId: tile.id,
    progressXp: 0,
    requiredXp: 1,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: true,
  }, []);

  assert.equal(tile.condition, 100);
  assert.equal(tile.conditionState, 'healthy');
});

test('irrigation is available without a story unlock', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'dirt',
      terrain: 'dirt',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'dirt_tilled_draught',
    } satisfies Tile,
  ]);

  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'irregateDirtTask'), true);
});

test('mission 1 offers hunt on forest but not on plains', () => {
  setStoryProgressionForMission(1);
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
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
      activationState: 'active',
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

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'hunt'), true);
  assert.equal(getAvailableTasks(tileIndex['1,0']!, hero).some((task) => task.key === 'hunt'), false);
});

test('mission 1 offers remove trunks on chopped forest so forest landings can open road space', () => {
  setStoryProgressionForMission(1);
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'chopped_forest',
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

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'removeTrunks'), true);
});

test('manual dock fishing follows the roadmap when settlers are available', () => {
  setStoryProgressionForMission(2);
  loadPopulationSnapshot({
    current: 1,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'water_dock_a',
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

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'fishAtDock'), false);
});

test('manual dock fishing emergency-unlocks when settlers drop to zero', () => {
  setStoryProgressionForMission(2);
  loadPopulationSnapshot({
    current: 0,
    max: 15,
    beds: 2,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'water_dock_a',
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

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'fishAtDock'), true);
});

test('deferred chop wood chaining skips young forest targets', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'chopped_forest',
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'young_forest',
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  let chainedTarget: { q: number; r: number } | null = null;
  let chainedTask: string | undefined;
  configureGameRuntime({
    moveHero(_hero, target, task) {
      chainedTarget = target;
      chainedTask = task;
    },
  });

  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    pendingChain: {
      sourceTileId: '0,0',
      taskType: 'chopWood',
    },
  };

  handleHeroArrival(hero, tileIndex['0,0']!);

  assert.equal(chainedTask, 'chopWood');
  const target = chainedTarget as { q: number; r: number } | null;
  if (!target) {
    assert.fail('Expected chained movement target to be set.');
  }
  assert.equal(target.q, 1);
  assert.equal(target.r, 0);
});

test('deferred task chaining chooses the closest tile to the task origin', () => {
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
    ...[5, 6, 7, 8, 9, 10, 11].map((q) => ({
      id: `${q},0`,
      q,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: q !== 10,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: q === 10 ? 'chopped_forest' : q === 9 ? 'young_forest' : null,
    }) satisfies Tile),
  ]);

  let chainedTarget: { q: number; r: number } | null = null;
  let chainedTask: string | undefined;
  configureGameRuntime({
    moveHero(_hero, target, task) {
      chainedTarget = target;
      chainedTask = task;
    },
  });

  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 10,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    pendingChain: {
      sourceTileId: '10,0',
      taskType: 'chopWood',
    },
  };

  handleHeroArrival(hero, tileIndex['10,0']!);

  assert.equal(chainedTask, 'chopWood');
  const target = chainedTarget as { q: number; r: number } | null;
  if (!target) {
    assert.fail('Expected chained movement target to be set.');
  }
  assert.equal(target.q, 11);
  assert.equal(target.r, 0);
});

test('seed grain chains across prepared irrigated dirt and skips dry plots', async () => {
  const progression = createInitialProgressionSnapshot();
  loadStoryProgression({
    ...progression,
    unlocked: {
      ...progression.unlocked,
      tasks: [...progression.unlocked.tasks, 'seedGrain'],
    },
  }, '0,0');
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'dirt',
      terrain: 'dirt',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'dirt_tilled_hydrated',
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'dirt',
      terrain: 'dirt',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'dirt_tilled',
    } satisfies Tile,
    {
      id: '0,1',
      q: 0,
      r: 1,
      biome: 'dirt',
      terrain: 'dirt',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'dirt_tilled_draught',
    } satisfies Tile,
  ]);
  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: true,
    unlimitedResources: true,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  const moveCalls: Array<{ target: { q: number; r: number }; task?: string }> = [];
  configureGameRuntime({
    moveHero: (_hero, target, task) => {
      moveCalls.push({ target, task });
    },
  });

  const task = startTask(tileIndex['0,0']!, 'seedGrain', heroes[0]!);

  assert.ok(task?.completedMs);
  assert.equal(tileIndex['0,0']?.terrain, 'grain');

  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.equal(moveCalls.length, 1);
  assert.equal(moveCalls[0]?.task, 'seedGrain');
  assert.equal(moveCalls[0]?.target.q, 1);
  assert.equal(moveCalls[0]?.target.r, 0);
});

test('plant trees turns base plains into a growing young forest', () => {
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
  ]);

  const tile = tileIndex['0,0']!;
  const plantTrees = getTaskDefinition('plantTrees');

  assert.equal(plantTrees?.canStart(tile, {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  }), true);

  plantTrees?.onComplete?.(tile, {
    id: 'task-plant',
    type: 'plantTrees',
    tileId: tile.id,
    progressXp: 0,
    requiredXp: 1,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: true,
  }, []);

  assert.equal(tile.terrain, 'forest');
  assert.equal(tile.variant, 'young_forest');
  assert.equal(tile.isBaseTile, false);
  assert.equal(typeof tile.variantSetMs, 'number');
  assert.equal(typeof tile.variantAgeMs, 'number');
  assert.ok(tile.variantAgeMs! >= 90000);
  assert.ok(tile.variantAgeMs! <= 240000);
  assert.ok(terrainPositions.forest.has(tile.id));
  assert.equal(terrainPositions.plains.has(tile.id), false);
});

test('dismantle is available on inactive constructed tiles so blocked buildings can be cleared', () => {
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
      isBaseTile: false,
      activationState: 'inactive',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'plains_house',
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
  assert.equal(availableTasks.some((task) => task.key === 'dismantle'), true);
  assert.ok(startTask(tileIndex['1,0']!, 'dismantle', hero));
});

test('dismantle restores constructed tiles back to their base terrain', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'road',
    } satisfies Tile,
  ]);

  const dismantle = getTaskDefinition('dismantle');
  const tile = tileIndex['0,0']!;

  dismantle?.onComplete?.(tile, {
    id: 'task-dismantle',
    type: 'dismantle',
    tileId: tile.id,
    progressXp: 0,
    requiredXp: 1,
    createdMs: 0,
    lastUpdateMs: 0,
    participants: {},
    active: true,
  }, []);

  assert.equal(tile.variant, null);
  assert.equal(tile.isBaseTile, true);
});

test('road, bridge, and tunnel tasks require town center, road, bridge, or tunnel anchors before they can start', () => {
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
      id: '3,0',
      q: 3,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'road',
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
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
      id: '4,1',
      q: 4,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'water_bridge_ad',
    } satisfies Tile,
    {
      id: '4,0',
      q: 4,
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
      id: '5,0',
      q: 5,
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
      id: '5,1',
      q: 5,
      r: 1,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'plains_watchtower',
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
    {
      id: '2,1',
      q: 2,
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
    {
      id: '6,1',
      q: 6,
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
    {
      id: '0,3',
      q: 0,
      r: 3,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'mountain_tunnel_ad',
    } satisfies Tile,
    {
      id: '1,1',
      q: 1,
      r: 1,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'road',
    } satisfies Tile,
    {
      id: '0,2',
      q: 0,
      r: 2,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '1,2',
      q: 1,
      r: 2,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '6,2',
      q: 6,
      r: 2,
      biome: 'mountains',
      terrain: 'mountain',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
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

  const buildRoad = getTaskDefinition('buildRoad');
  const buildWall = getTaskDefinition('buildWall');
  const buildBridge = getTaskDefinition('buildBridge');
  const buildTunnel = getTaskDefinition('buildTunnel');

  assert.equal(buildRoad?.canStart(tileIndex['1,0']!, hero), true);
  assert.equal(buildRoad?.canStart(tileIndex['2,0']!, hero), true);
  assert.equal(buildRoad?.canStart(tileIndex['4,0']!, hero), true);
  assert.equal(buildRoad?.canStart(tileIndex['5,0']!, hero), false);
  assert.equal(buildWall?.canStart(tileIndex['1,0']!, hero), true);
  assert.equal(buildWall?.canStart(tileIndex['4,0']!, hero), false);
  assert.equal(buildWall?.canStart(tileIndex['5,0']!, hero), true);
  assert.equal(buildWall?.canStart(tileIndex['2,0']!, hero), false);
  assert.equal(buildBridge?.canStart(tileIndex['0,1']!, hero), true);
  assert.equal(buildBridge?.canStart(tileIndex['2,1']!, hero), true);
  assert.equal(buildBridge?.canStart(tileIndex['6,1']!, hero), false);
  assert.equal(buildTunnel?.canStart(tileIndex['0,2']!, hero), true);
  assert.equal(buildTunnel?.canStart(tileIndex['1,2']!, hero), true);
  assert.equal(buildTunnel?.canStart(tileIndex['6,2']!, hero), false);
});

test('watchtowers can be placed on snow and desert frontier tiles', () => {
  const buildWatchtower = getTaskDefinition('buildWatchtower');
  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  assert.equal(buildWatchtower?.canStart({
    id: '1,0',
    q: 1,
    r: 0,
    biome: 'snow',
    terrain: 'snow',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: null,
  } satisfies Tile, hero), true);

  assert.equal(buildWatchtower?.canStart({
    id: '2,0',
    q: 2,
    r: 0,
    biome: 'dessert',
    terrain: 'dessert',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: null,
  } satisfies Tile, hero), true);

  const snowTile = {
    id: '3,0',
    q: 3,
    r: 0,
    biome: 'snow',
    terrain: 'snow',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: null,
  } satisfies Tile;
  const desertTile = {
    id: '4,0',
    q: 4,
    r: 0,
    biome: 'dessert',
    terrain: 'dessert',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: null,
  } satisfies Tile;

  buildWatchtower?.onComplete?.(snowTile, {} as never, [hero]);
  buildWatchtower?.onComplete?.(desertTile, {} as never, [hero]);

  assert.equal(snowTile.variant, 'snow_watchtower');
  assert.equal(desertTile.variant, 'dessert_watchtower');
});

test('beacons can be placed on water frontier tiles only', () => {
  const buildBeacon = getTaskDefinition('buildBeacon');
  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  const waterTile: Tile = {
    id: '1,0',
    q: 1,
    r: 0,
    biome: 'lake',
    terrain: 'water',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    controlledBySettlementId: '0,0',
    ownerSettlementId: '0,0',
    variant: null,
  };

  assert.equal(buildBeacon?.canStart(waterTile, hero), true);
  assert.equal(buildBeacon?.canStart({
    ...waterTile,
    id: '2,0',
    q: 2,
    terrain: 'plains',
    biome: 'plains',
  } satisfies Tile, hero), false);
  assert.equal(buildBeacon?.canStart({
    ...waterTile,
    id: '3,0',
    q: 3,
    isBaseTile: false,
  } satisfies Tile, hero), false);

  buildBeacon?.onComplete?.(waterTile, {} as never, [hero]);

  assert.equal(waterTile.variant, 'water_beacon');
  assert.equal(waterTile.towerDurabilityMax, 100);
});

test('dock tasks only start on water tiles that touch active land', () => {
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
    {
      id: '1,1',
      q: 1,
      r: 1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: 'water_bridge_be',
    } satisfies Tile,
    {
      id: '2,1',
      q: 2,
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

  const buildDock = getTaskDefinition('buildDock');
  const hero: Hero = {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };

  assert.equal(buildDock?.canStart(tileIndex['0,1']!, hero), true);
  assert.equal(buildDock?.canStart(tileIndex['2,1']!, hero), false);
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

test('dock builds face the access tile where the hero starts construction', () => {
  setStoryProgressionForMission(2);

  loadWorld([
    {
      id: '-1,0',
      q: -1,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
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
      movement: {
        path: [{ q: 0, r: 0 }],
        origin: { q: -1, r: 0 },
        target: { q: 0, r: 0 },
        startMs: 0,
        stepDurations: [100],
        cumulative: [100],
      },
      carryingPayload: { type: 'wood', amount: 5 },
    } satisfies Hero,
  ]);

  loadStoryProgression(evaluateProgression({
    population: 2,
    beds: 2,
    frontierDistance: 0,
    resourceStock: {},
    buildingCounts: { house: 1 },
    operationalBuildingCounts: {},
    discoveredTerrains: ['water'],
    landingTerrains: ['water'],
    unlockedHeroIds: [],
    completedStudyKeys: [],
    heroAbilityChargesEarned: 0,
  }), '0,0');

  const hero = heroes[0]!;
  const dockTile = tileIndex['0,1']!;
  const task = startTask(dockTile, 'buildDock', hero);

  assert.ok(task);
  assert.equal(task?.context?.approachSide, 'a');

  getTaskDefinition('buildDock')?.onComplete?.(dockTile, task!, [hero]);
  assert.equal(dockTile.variant, 'water_dock_a');
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

test('instant build completes zero-cost work immediately when test mode is enabled', () => {
  setStoryProgressionForMission(1);
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);

  loadTestModeSettings({
    enabled: true,
    instantBuild: true,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  const task = startTask(tileIndex['0,0']!, 'hunt', heroes[0]!);

  assert.ok(task);
  assert.ok(task?.completedMs);
  assert.equal(task?.progressXp, task?.requiredXp);
});

test('instant build reward tasks still deliver goods and resume deferred chains', async () => {
  setStoryProgressionForMission(1);
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
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
    {
      id: '0,2',
      q: 0,
      r: 2,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 1,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);

  loadTestModeSettings({
    enabled: true,
    instantBuild: true,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  const moveCalls: Array<{ target: { q: number; r: number }; task?: string }> = [];
  configureGameRuntime({
    moveHero: (_hero, target, task) => {
      moveCalls.push({ target, task });
    },
  });

  const task = startTask(tileIndex['0,1']!, 'chopWood', heroes[0]!);

  assert.ok(task?.completedMs);
  assert.deepEqual(heroes[0]?.carryingPayload, { type: 'wood', amount: 4 });
  assert.deepEqual(moveCalls[0], { target: { q: 0, r: 0 }, task: undefined });

  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.deepEqual(heroes[0]?.pendingChain, { sourceTileId: '0,1', taskType: 'chopWood' });

  handleHeroArrival(heroes[0]!, tileIndex['0,0']!);

  assert.equal(heroes[0]?.carryingPayload, undefined);
  assert.equal(getStorageResourceAmount('0,0', 'wood'), 4);
  assert.equal(moveCalls[1]?.task, 'chopWood');
  assert.equal(moveCalls[1]?.target.q, 0);
  assert.equal(moveCalls[1]?.target.r, 2);
});

test('unlimited resources removes build input requirements in test mode', () => {
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
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      controlledBySettlementId: '0,0',
      ownerSettlementId: '0,0',
      variant: null,
    } satisfies Tile,
  ]);

  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
  } satisfies Hero]);

  loadStoryProgression(evaluateProgression({
    population: 2,
    beds: 2,
    frontierDistance: 0,
    resourceStock: {},
    buildingCounts: { house: 1 },
    operationalBuildingCounts: {},
    discoveredTerrains: ['water'],
    landingTerrains: ['water'],
    unlockedHeroIds: [],
    completedStudyKeys: [],
    heroAbilityChargesEarned: 0,
  }), '0,0');

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: true,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  const task = startTask(tileIndex['0,1']!, 'buildDock', heroes[0]!);

  assert.ok(task);
  assert.deepEqual(task?.requiredResources ?? [], []);
  assert.equal(getStorageResourceAmount('0,0', 'wood'), 0);
});

test('heroes clear carried rewards at full warehouses when unlimited resources test mode is enabled', () => {
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

  depositResourceToStorage('0,0', 'wood', 240);
  loadHeroes([{
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    q: 0,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    settlementId: '0,0',
    carryingPayload: { type: 'meat', amount: 3 },
  } satisfies Hero]);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: true,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  handleHeroArrival(heroes[0]!, tileIndex['0,0']!);

  assert.equal(heroes[0]?.carryingPayload, undefined);
  assert.equal(getStorageResourceAmount('0,0', 'meat'), 0);
});
