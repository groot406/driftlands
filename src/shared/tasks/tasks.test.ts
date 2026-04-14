import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../core/types/Hero.ts';
import type { TaskInstance } from '../../core/types/Task.ts';
import type { Tile } from '../../core/types/Tile.ts';
import { configureGameRuntime, resetGameRuntime } from '../game/runtime.ts';
import { heroes, loadHeroes } from '../../store/heroStore.ts';
import { depositResourceToStorage, resetResourceState, getStorageResourceAmount } from '../../store/resourceStore.ts';
import { loadTasks, startTask } from '../../store/taskStore.ts';
import { loadStoryProgression, setStoryProgressionForMission } from '../story/progressionState.ts';
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
  loadStoryProgression(null);
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

  assert.equal(availableTasks.some((task) => task.key === 'hunt'), false);
  assert.equal(startTask(tileIndex['1,0']!, 'hunt', hero), null);
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

test('mission 1 campfires offer ration cooking', () => {
  setStoryProgressionForMission(1);
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
      variant: 'plains_campfire',
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

  assert.equal(getAvailableTasks(tileIndex['0,0']!, hero).some((task) => task.key === 'campfireRations'), true);
});

test('mission 2 docks offer hero fishing', () => {
  setStoryProgressionForMission(2);
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
  const buildBridge = getTaskDefinition('buildBridge');
  const buildTunnel = getTaskDefinition('buildTunnel');

  assert.equal(buildRoad?.canStart(tileIndex['1,0']!, hero), true);
  assert.equal(buildRoad?.canStart(tileIndex['2,0']!, hero), true);
  assert.equal(buildRoad?.canStart(tileIndex['4,0']!, hero), true);
  assert.equal(buildRoad?.canStart(tileIndex['5,0']!, hero), false);
  assert.equal(buildBridge?.canStart(tileIndex['0,1']!, hero), true);
  assert.equal(buildBridge?.canStart(tileIndex['2,1']!, hero), true);
  assert.equal(buildBridge?.canStart(tileIndex['6,1']!, hero), false);
  assert.equal(buildTunnel?.canStart(tileIndex['0,2']!, hero), true);
  assert.equal(buildTunnel?.canStart(tileIndex['1,2']!, hero), true);
  assert.equal(buildTunnel?.canStart(tileIndex['6,2']!, hero), false);
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
