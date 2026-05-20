import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import type { Tile } from '../core/types/Tile.ts';
import type { RunSnapshot } from '../shared/goals/types.ts';
import { emitGameplayEvent } from '../shared/gameplay/events.ts';
import { createInitialProgressionSnapshot } from '../shared/story/progression.ts';
import { RESCUE_HERO_TASK_KEY } from '../shared/sideQuests/definitions.ts';
import '../shared/tasks/taskDefinitions.ts';
import { getTaskDefinition } from '../shared/tasks/taskRegistry.ts';
import { loadWorld, tileIndex } from '../shared/game/world.ts';
import { heroes, loadHeroes } from './heroStore.ts';
import { resetPopulationState } from './populationStore.ts';
import { runSnapshot, runVersion } from './runStore.ts';
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

function setupSideQuestWorld() {
  loadWorld([createTownCenter()]);
  loadHeroes([createHero()]);
  currentPlayerSettlementId.value = '0,0';
  runSnapshot.value = createRunSnapshot();
  runVersion.value++;
  initializeSideQuestRuntime();
  syncSideQuestSignals();
  const quest = sideQuestState.instances[0];
  assert.ok(quest);
  return quest;
}

test.afterEach(() => {
  teardownSideQuestRuntime();
  resetSideQuests();
  clearStoryTileHints();
  loadWorld([]);
  loadHeroes([]);
  resetPopulationState();
  currentPlayerSettlementId.value = null;
  runSnapshot.value = null;
  runVersion.value++;
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
