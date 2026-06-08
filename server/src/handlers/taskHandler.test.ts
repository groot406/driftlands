import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../src/core/types/Hero.ts';
import type { TaskInstance } from '../../../src/core/types/Task.ts';
import type { Tile } from '../../../src/core/types/Tile.ts';
import { discoverTile, ensureTileExists, loadWorld } from '../../../src/shared/game/world.ts';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime.ts';
import { configureGameplayEventRuntime } from '../../../src/shared/gameplay/events.ts';
import { heroes, loadHeroes } from '../../../src/shared/game/state/heroStore.ts';
import { addResourcesToTask, boostTaskProgress, getTaskByTile, loadTasks } from '../../../src/shared/game/state/taskStore.ts';
import { RESCUE_HERO_TASK_KEY } from '../../../src/shared/sideQuests/definitions.ts';
import { setIo } from '../messages/messageRouter.ts';
import { coopState } from '../state/coopState.ts';
import { playerSettlementState } from '../state/playerSettlementState.ts';
import { seasonState } from '../state/seasonState.ts';
import { serverSideQuestState } from '../state/sideQuestState.ts';
import { ServerTaskHandler } from './taskHandler.ts';

let nowMs = 1_000_000;
const realDateNow = Date.now;

function createTownCenter(): Tile {
  return {
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
  };
}

function createWorkshop(): Tile {
  return {
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
    variant: 'plains_workshop',
  };
}

function createHero(): Hero {
  return {
    id: 'h1',
    name: 'Santa',
    avatar: 'santa',
    playerId: 'player-1',
    playerName: 'Player',
    settlementId: '0,0',
    q: 0,
    r: 0,
    stats: { xp: 100, hp: 100, atk: 10, spd: 1 },
    facing: 'down',
  };
}

function scoreCandidate(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function axialDistance(q1: number, r1: number, q2: number, r2: number) {
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs((q1 + r1) - (q2 + r2)));
}

function getDistantSmokeSignalLocation(settlementId: string) {
  const candidates: Array<{ q: number; r: number; distance: number }> = [];
  for (let dq = -10; dq <= 10; dq++) {
    for (let dr = Math.max(-10, -dq - 10); dr <= Math.min(10, -dq + 10); dr++) {
      const q = dq;
      const r = dr;
      const distance = axialDistance(0, 0, q, r);
      if (distance >= 7 && distance <= 10) {
        candidates.push({ q, r, distance });
      }
    }
  }

  candidates.sort((left, right) => {
    const leftScore = scoreCandidate(`lost_hero_distress:${settlementId}:${left.q},${left.r}`);
    const rightScore = scoreCandidate(`lost_hero_distress:${settlementId}:${right.q},${right.r}`);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.distance - right.distance || `${left.q},${left.r}`.localeCompare(`${right.q},${right.r}`);
  });

  return candidates[0]!;
}

test.beforeEach(() => {
  nowMs = 1_000_000;
  Date.now = () => nowMs;
});

test.afterEach(() => {
  Date.now = realDateNow;
  loadWorld([]);
  loadHeroes([]);
  loadTasks([]);
  resetGameRuntime();
  configureGameplayEventRuntime();
  serverSideQuestState.reset();
  coopState.resetHeroClaims();
  coopState.removePlayer('socket-1');
  playerSettlementState.reset();
  seasonState.loadPersistenceSnapshot(null);
});

function setupDiscoveredDistantSmokeSignal(messages: unknown[] = []) {
  setIo({
    emit(_event: string, message: unknown) {
      messages.push(message);
    },
  });
  configureGameRuntime({
    broadcast(message) {
      messages.push(message);
    },
  });
  loadWorld([createTownCenter(), createWorkshop()]);
  loadHeroes([createHero()]);

  const signalLocation = getDistantSmokeSignalLocation('0,0');
  const signalTile = ensureTileExists(signalLocation.q, signalLocation.r);
  discoverTile(signalTile, { q: 0, r: 0, settlementId: '0,0' });
  heroes[0]!.q = signalTile.q;
  heroes[0]!.r = signalTile.r;

  playerSettlementState.registerPlayer('socket-1', 'player-1', 'Player');
  assert.equal(playerSettlementState.assignPlayerSettlement('player-1', '0,0'), true);
  coopState.upsertPlayer({ id: 'socket-1' } as any, 'Player', 'player-1', undefined, '0,0');
  seasonState.initialize(42, 1_000);

  return signalTile;
}

test('server rescue task starts on an active Distant Smoke signal with quest resources', () => {
  const signalTile = setupDiscoveredDistantSmokeSignal();
  const handler = new ServerTaskHandler({} as any);
  (handler as any).handleStartRequest({ id: 'socket-1' }, {
    type: 'task:request_start',
    heroId: 'h1',
    task: RESCUE_HERO_TASK_KEY,
    location: { q: signalTile.q, r: signalTile.r },
  });

  const task = getTaskByTile(signalTile.id, RESCUE_HERO_TASK_KEY);
  assert.ok(task);
  assert.deepEqual(task.requiredResources, [
    { type: 'food', amount: 8 },
    { type: 'wood', amount: 10 },
    { type: 'tools', amount: 2 },
  ]);
});

test('server cancels a misplaced task for the controlling player', () => {
  const messages: unknown[] = [];
  setupDiscoveredDistantSmokeSignal(messages);

  const task: TaskInstance = {
    id: 'task-build',
    type: 'buildRoad',
    tileId: '1,0',
    progressXp: 25,
    requiredXp: 100,
    createdMs: Date.now(),
    lastUpdateMs: Date.now(),
    participants: { h1: 25 },
    active: false,
    requiredResources: [{ type: 'wood', amount: 2 }],
    collectedResources: [{ type: 'wood', amount: 1 }],
  };
  loadTasks([task]);
  heroes[0]!.currentTaskId = task.id;

  const handler = new ServerTaskHandler({} as any);
  (handler as any).handleCancelRequest({ id: 'socket-1' }, {
    type: 'task:request_cancel',
    heroId: 'h1',
    taskId: task.id,
  });

  assert.equal(getTaskByTile('1,0', 'buildRoad'), undefined);
  assert.equal(heroes[0]?.currentTaskId, undefined);
  assert.equal(messages.some((message) => (
    typeof message === 'object'
    && message !== null
    && (message as { type?: string; taskId?: string }).type === 'task:removed'
    && (message as { taskId?: string }).taskId === task.id
  )), true);
});

test('server completing the rescue objective grants Ren through the authoritative hero roster', () => {
  const messages: unknown[] = [];
  const signalTile = setupDiscoveredDistantSmokeSignal(messages);
  configureGameplayEventRuntime((event) => {
    serverSideQuestState.recordEvent(event);
  });

  const handler = new ServerTaskHandler({} as any);
  (handler as any).handleStartRequest({ id: 'socket-1' }, {
    type: 'task:request_start',
    heroId: 'h1',
    task: RESCUE_HERO_TASK_KEY,
    location: { q: signalTile.q, r: signalTile.r },
  });

  const task = getTaskByTile(signalTile.id, RESCUE_HERO_TASK_KEY);
  assert.ok(task);

  assert.equal(addResourcesToTask(task, { type: 'food', amount: 8 }), 8);
  assert.equal(addResourcesToTask(task, { type: 'wood', amount: 10 }), 10);
  assert.equal(addResourcesToTask(task, { type: 'tools', amount: 2 }), 2);
  assert.equal(boostTaskProgress(task.id, task.requiredXp), true);

  const rescuedHero = heroes.find((hero) => hero.id.includes('trailbreaker_ren'));
  assert.ok(rescuedHero);
  assert.equal(rescuedHero.name, 'Ren');
  assert.equal(rescuedHero.playerId, 'player-1');
  assert.equal(rescuedHero.settlementId, '0,0');
  assert.equal(messages.some((message) => (
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'hero:roster_update'
  )), true);
});

test('server refuses rescue after the active Distant Smoke timer expires', () => {
  const signalTile = setupDiscoveredDistantSmokeSignal();
  const activeQuest = serverSideQuestState.getActiveSideQuestForTask(signalTile.id, RESCUE_HERO_TASK_KEY);
  assert.ok(activeQuest);
  const quest = activeQuest;
  assert.equal(typeof quest.expiresAt, 'number');
  assert.equal(serverSideQuestState.listInstances().filter((instance) => instance.id === quest.id).length, 1);

  nowMs = quest.expiresAt! + 1;

  const handler = new ServerTaskHandler({} as any);
  (handler as any).handleStartRequest({ id: 'socket-1' }, {
    type: 'task:request_start',
    heroId: 'h1',
    task: RESCUE_HERO_TASK_KEY,
    location: { q: signalTile.q, r: signalTile.r },
  });

  assert.equal(quest.status, 'expired');
  assert.equal(getTaskByTile(signalTile.id, RESCUE_HERO_TASK_KEY), undefined);
});

test('server does not recreate Distant Smoke after Ren has already joined', () => {
  const signalTile = setupDiscoveredDistantSmokeSignal();
  configureGameplayEventRuntime((event) => {
    serverSideQuestState.recordEvent(event);
  });

  const handler = new ServerTaskHandler({} as any);
  (handler as any).handleStartRequest({ id: 'socket-1' }, {
    type: 'task:request_start',
    heroId: 'h1',
    task: RESCUE_HERO_TASK_KEY,
    location: { q: signalTile.q, r: signalTile.r },
  });

  const task = getTaskByTile(signalTile.id, RESCUE_HERO_TASK_KEY);
  assert.ok(task);
  assert.equal(addResourcesToTask(task, { type: 'food', amount: 8 }), 8);
  assert.equal(addResourcesToTask(task, { type: 'wood', amount: 10 }), 10);
  assert.equal(addResourcesToTask(task, { type: 'tools', amount: 2 }), 2);
  assert.equal(boostTaskProgress(task.id, task.requiredXp), true);
  assert.equal(heroes.filter((hero) => hero.id.includes('trailbreaker_ren')).length, 1);

  serverSideQuestState.reset();
  loadTasks([]);

  (handler as any).handleStartRequest({ id: 'socket-1' }, {
    type: 'task:request_start',
    heroId: 'h1',
    task: RESCUE_HERO_TASK_KEY,
    location: { q: signalTile.q, r: signalTile.r },
  });

  assert.equal(getTaskByTile(signalTile.id, RESCUE_HERO_TASK_KEY), undefined);
  assert.equal(heroes.filter((hero) => hero.id.includes('trailbreaker_ren')).length, 1);
});
