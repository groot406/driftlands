import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import type { Tile } from '../core/types/Tile.ts';
import { currentPlayer } from '../core/socket.ts';
import type { RunSnapshot } from '../shared/goals/types.ts';
import { emitGameplayEvent } from '../shared/gameplay/events.ts';
import { createInitialProgressionSnapshot } from '../shared/story/progression.ts';
import { RESCUE_HERO_TASK_KEY } from '../shared/sideQuests/definitions.ts';
import '../shared/tasks/taskDefinitions.ts';
import { getTaskDefinition } from '../shared/tasks/taskRegistry.ts';
import { discoverTile, loadWorld, tileIndex } from '../shared/game/world.ts';
import { configureGameRuntime, resetGameRuntime } from '../shared/game/runtime.ts';
import { heroes, loadHeroes } from './heroStore.ts';
import { resetPopulationState } from './populationStore.ts';
import { depositResourceToStorage, resetResourceState } from './resourceStore.ts';
import { runSnapshot, runVersion } from './runStore.ts';
import { addResourcesToTask, boostTaskProgress, loadTasks, startTask } from './taskStore.ts';
import {
  getActiveSideQuestForTask,
  initializeSideQuestRuntime,
  resetSideQuests,
  sideQuestState,
  syncSideQuestSignals,
  teardownSideQuestRuntime,
} from './sideQuestStore.ts';
import { clearStoryTileHints, getActiveStoryTileHints } from './storyHintStore.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';

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
    settlementId: '0,0',
    q: 0,
    r: 0,
    stats: { xp: 100, hp: 100, atk: 10, spd: 1 },
    facing: 'down',
  };
}

function createRunSnapshot(): RunSnapshot {
  const chapter = {
    chapterId: 'test-chapter',
    chapterLabel: 'Test Chapter',
    actLabel: 'Test',
    title: 'Test Chapter',
    kicker: 'Test',
    briefing: 'Test',
    stakes: 'Test',
    guidance: 'Test',
    completionTitle: 'Done',
    completionText: 'Done',
    failureTitle: 'Failed',
    failureText: 'Failed',
    nextHint: 'Next',
  };

  return {
    mode: 'story_mode',
    modeLabel: 'Story Mode',
    seed: 1,
    chapterNumber: 1,
    chaptersCompleted: 0,
    status: 'active',
    startedAt: 1,
    score: 0,
    chapterScore: 0,
    discoveredTiles: 1,
    activeTiles: 1,
    inactiveTiles: 0,
    restoredTiles: 0,
    summary: '',
    mutator: {
      key: 'open_frontier',
      name: 'Open Frontier',
      description: 'Test',
    },
    chapter,
    progression: createInitialProgressionSnapshot(),
    objectives: [],
    dialogue: {
      activeEntryId: null,
      entries: [],
    },
    chapterArchive: [],
  };
}

let nowMs = 1_000_000;
const realDateNow = Date.now;

function setupSideQuestWorld(options: {
  workshopBuilt?: boolean;
  advancePastTriggerDelay?: boolean;
  expectQuest?: boolean;
} = {}) {
  const {
    workshopBuilt = true,
    advancePastTriggerDelay = true,
    expectQuest = true,
  } = options;
  loadWorld(workshopBuilt ? [createTownCenter(), createWorkshop()] : [createTownCenter()]);
  loadHeroes([createHero()]);
  currentPlayerSettlementId.value = '0,0';
  runSnapshot.value = createRunSnapshot();
  runVersion.value++;
  initializeSideQuestRuntime();
  syncSideQuestSignals();
  if (advancePastTriggerDelay) {
    nowMs += 8 * 60_000;
    syncSideQuestSignals();
  }
  const quest = sideQuestState.instances[0];
  if (expectQuest) {
    assert.ok(quest);
  }
  return quest!;
}

test.beforeEach(() => {
  nowMs = 1_000_000;
  Date.now = () => nowMs;
});

test.afterEach(() => {
  Date.now = realDateNow;
  teardownSideQuestRuntime();
  resetSideQuests();
  clearStoryTileHints();
  loadWorld([]);
  loadHeroes([]);
  loadTasks([]);
  resetGameRuntime();
  resetResourceState();
  resetPopulationState();
  currentPlayerSettlementId.value = null;
  currentPlayer.value = null;
  runSnapshot.value = null;
  runVersion.value++;
});

test('syncSideQuestSignals waits for configured trigger conditions before spawning a signal', () => {
  loadWorld([createTownCenter()]);
  loadHeroes([createHero()]);
  currentPlayerSettlementId.value = '0,0';
  runSnapshot.value = createRunSnapshot();
  runVersion.value++;
  initializeSideQuestRuntime();
  syncSideQuestSignals();

  assert.equal(sideQuestState.instances.length, 0);
  assert.equal(getActiveStoryTileHints.value.length, 0);
});

test('syncSideQuestSignals waits for the configured random delay after trigger conditions are met', () => {
  setupSideQuestWorld({ advancePastTriggerDelay: false, expectQuest: false });

  assert.equal(sideQuestState.instances.length, 0);
  assert.equal(getActiveStoryTileHints.value.length, 0);

  nowMs += 8 * 60_000;
  syncSideQuestSignals();

  const quest = sideQuestState.instances[0];
  assert.ok(quest);
  assert.equal(quest.status, 'signaled');
  assert.equal(getActiveStoryTileHints.value.length, 1);
});

test('syncSideQuestSignals spawns a reusable side quest signal hint', () => {
  const quest = setupSideQuestWorld();

  assert.equal(quest.status, 'signaled');
  assert.equal(quest.definitionId, 'lost_hero_distress');
  assert.equal(quest.spawnSettlementId, '0,0');

  const hints = getActiveStoryTileHints.value;
  assert.equal(hints.length, 1);
  assert.equal(hints[0]?.kind, 'side_quest');
  assert.equal(hints[0]?.q, quest.q);
  assert.equal(hints[0]?.r, quest.r);
});

test('exploring a signal tile reveals and assigns the quest to the discovering hero', () => {
  const quest = setupSideQuestWorld();

  emitGameplayEvent({
    type: 'task:completed',
    taskType: 'explore',
    tileId: quest.signalTileId,
    participantIds: ['h1'],
  });

  assert.equal(quest.status, 'active');
  assert.equal(quest.ownerPlayerId, 'player-1');
  assert.equal(quest.ownerSettlementId, '0,0');
  assert.equal(quest.discoveredByHeroId, 'h1');
  assert.equal(getActiveStoryTileHints.value.length, 0);
  assert.equal(runSnapshot.value?.dialogue.entries.length, 2);
});

test('discovering a signal tile through a watchtower reveal activates the rescue quest', () => {
  const quest = setupSideQuestWorld();
  const tile = tileIndex[quest.signalTileId]!;
  currentPlayer.value = { id: 'player-1', name: 'Player 1' };

  discoverTile(tile, { q: 1, r: 0, settlementId: '0,0' });
  syncSideQuestSignals();

  assert.equal(quest.status, 'active');
  assert.equal(quest.ownerPlayerId, 'player-1');
  assert.equal(quest.ownerSettlementId, '0,0');
  assert.equal(quest.discoveredByHeroId, null);
  assert.equal(getActiveStoryTileHints.value.length, 0);

  const rescueTask = getTaskDefinition(RESCUE_HERO_TASK_KEY);
  assert.ok(rescueTask);
  assert.equal(rescueTask.canStart(tile, heroes[0]!), true);
  assert.equal(runSnapshot.value?.dialogue.entries.length, 2);
});

test('discovering a signal tile with a pending explore task waits for explore completion hero credit', () => {
  const quest = setupSideQuestWorld();
  const tile = tileIndex[quest.signalTileId]!;
  loadTasks([{
    id: 'task_1',
    type: 'explore',
    tileId: quest.signalTileId,
    progressXp: 0,
    requiredXp: 10,
    createdMs: nowMs,
    lastUpdateMs: nowMs,
    participants: { h1: 0 },
    active: true,
  }]);

  discoverTile(tile, { q: 1, r: 0, settlementId: '0,0' });
  syncSideQuestSignals();

  assert.equal(quest.status, 'signaled');

  emitGameplayEvent({
    type: 'task:completed',
    taskType: 'explore',
    tileId: quest.signalTileId,
    participantIds: ['h1'],
  });

  assert.equal(quest.status, 'active');
  assert.equal(quest.ownerPlayerId, 'player-1');
  assert.equal(quest.ownerSettlementId, '0,0');
  assert.equal(quest.discoveredByHeroId, 'h1');
});

test('rescue task is available only for active side quest tiles and carries quest resources', () => {
  const quest = setupSideQuestWorld();
  emitGameplayEvent({
    type: 'task:completed',
    taskType: 'explore',
    tileId: quest.signalTileId,
    participantIds: ['h1'],
  });

  const tile = tileIndex[quest.signalTileId]!;
  tile.discovered = true;
  tile.terrain = 'plains';

  const rescueTask = getTaskDefinition(RESCUE_HERO_TASK_KEY);
  assert.ok(rescueTask);
  assert.equal(rescueTask.canStart(tile, heroes[0]!), true);
  assert.deepEqual(rescueTask.requiredResources?.(0, tile), [
    { type: 'food', amount: 8 },
    { type: 'wood', amount: 10 },
    { type: 'tools', amount: 2 },
  ]);
  assert.equal(getActiveSideQuestForTask(tile.id, RESCUE_HERO_TASK_KEY)?.id, quest.id);
});

test('starting and completing the rescue task uses supplies and adds the rescued hero', () => {
  const quest = setupSideQuestWorld();
  emitGameplayEvent({
    type: 'task:completed',
    taskType: 'explore',
    tileId: quest.signalTileId,
    participantIds: ['h1'],
  });

  const tile = tileIndex[quest.signalTileId]!;
  tile.discovered = true;
  tile.terrain = 'plains';

  const rescueTask = startTask(tile, RESCUE_HERO_TASK_KEY, heroes[0]!);
  assert.ok(rescueTask);
  assert.equal(rescueTask.type, RESCUE_HERO_TASK_KEY);
  assert.deepEqual(rescueTask.requiredResources, [
    { type: 'food', amount: 8 },
    { type: 'wood', amount: 10 },
    { type: 'tools', amount: 2 },
  ]);
  assert.equal(rescueTask.active, false);

  assert.equal(addResourcesToTask(rescueTask, { type: 'food', amount: 8 }), 8);
  assert.equal(addResourcesToTask(rescueTask, { type: 'wood', amount: 10 }), 10);
  assert.equal(addResourcesToTask(rescueTask, { type: 'tools', amount: 2 }), 2);
  assert.equal(rescueTask.active, true);

  assert.equal(boostTaskProgress(rescueTask.id, rescueTask.requiredXp), true);

  const rescuedHero = heroes.find((hero) => hero.id.includes('trailbreaker_ren'));
  assert.equal(quest.status, 'completed');
  assert.ok(rescuedHero);
  assert.equal(rescuedHero.name, 'Ren');
  assert.equal(rescuedHero.playerId, 'player-1');
});

test('starting rescue on an inactive frontier tile begins supply fetching', () => {
  const rescueTile: Tile = {
    id: '2,0',
    q: 2,
    r: 0,
    biome: 'plains',
    terrain: 'plains',
    discovered: true,
    isBaseTile: true,
    activationState: 'inactive',
    variant: null,
  };
  loadWorld([createTownCenter(), createWorkshop(), rescueTile]);
  loadHeroes([createHero()]);
  sideQuestState.instances.push({
    id: 'lost_hero_distress:0,0',
    definitionId: 'lost_hero_distress',
    status: 'active',
    signalTileId: rescueTile.id,
    q: rescueTile.q,
    r: rescueTile.r,
    spawnSettlementId: '0,0',
    ownerPlayerId: 'player-1',
    ownerSettlementId: '0,0',
    discoveredByHeroId: 'h1',
    objectives: [],
    createdAt: nowMs,
  });

  const tile = tileIndex[rescueTile.id]!;
  depositResourceToStorage('0,0', 'bread', 8);
  depositResourceToStorage('0,0', 'wood', 10);
  depositResourceToStorage('0,0', 'tools', 2);

  const hero = heroes[0]!;
  hero.q = tile.q;
  hero.r = tile.r;

  let moveCall: { target: { q: number; r: number }; task?: string; taskLocation?: { q: number; r: number } } | null = null;
  configureGameRuntime({
    moveHero: (_hero, target, task, taskLocation) => {
      moveCall = { target, task, taskLocation };
    },
  });

  const rescueTask = startTask(tile, RESCUE_HERO_TASK_KEY, hero);

  assert.ok(rescueTask);
  assert.equal(rescueTask.active, false);
  assert.ok(hero.carryingPayload);
  assert.ok(hero.carryingPayload.amount < 0);
  assert.ok(['bread', 'wood', 'tools'].includes(hero.carryingPayload.type));
  assert.deepEqual(hero.pendingTask, { tileId: rescueTile.id, taskType: RESCUE_HERO_TASK_KEY });
  assert.deepEqual(moveCall?.target, { q: 0, r: 0 });
});

test('completing the rescue objective grants a hero, not population', () => {
  const quest = setupSideQuestWorld();
  emitGameplayEvent({
    type: 'task:completed',
    taskType: 'explore',
    tileId: quest.signalTileId,
    participantIds: ['h1'],
  });

  emitGameplayEvent({
    type: 'task:completed',
    taskType: RESCUE_HERO_TASK_KEY,
    tileId: quest.signalTileId,
    participantIds: ['h1'],
  });

  const rescuedHero = heroes.find((hero) => hero.id.includes('trailbreaker_ren'));
  assert.equal(quest.status, 'completed');
  assert.ok(rescuedHero);
  assert.equal(rescuedHero.name, 'Ren');
  assert.equal(rescuedHero.playerId, 'player-1');
  assert.equal(rescuedHero.settlementId, '0,0');
  assert.equal(runSnapshot.value?.dialogue.entries.length, 3);
});
