import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import { getWorldGenerationSeed, setWorldGenerationSeed } from '../core/worldVariation.ts';
import type {
  DialogueLogSnapshot,
  ObjectiveSnapshot,
  RunMutatorSnapshot,
  RunSnapshot,
  RunStoryBeat,
} from '../shared/goals/types.ts';
import { createInitialProgressionSnapshot } from '../shared/story/progression.ts';
import { loadStoryProgression } from '../shared/story/progressionState.ts';
import { heroes, loadHeroes } from './heroStore.ts';
import { loadRunState, missionOverlay, runLoaded, runSnapshot, runVersion } from './runStore.ts';

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

function createChapter(): RunStoryBeat {
  return {
    chapterId: 'chapter-1',
    chapterLabel: 'Chapter 1',
    actLabel: 'Act I',
    title: 'First Charter',
    kicker: 'The colony steps inland.',
    briefing: 'Push out from the shoreline and establish the first ring of work sites.',
    stakes: 'If the shoreline stalls, the charter fails.',
    guidance: 'Scout, gather timber, and open the first lanes.',
    completionTitle: 'Charter Secured',
    completionText: 'The camp holds and the next wave can follow.',
    failureTitle: 'Charter Lost',
    failureText: 'The shoreline went dark before the road crews could anchor it.',
    nextHint: 'Keep the fires lit for the next landing.',
  };
}

function createMutator(): RunMutatorSnapshot {
  return {
    key: 'open_frontier',
    name: 'Open Frontier',
    description: 'Broad scouting and flexible expansion.',
  };
}

function createObjective(id: string): ObjectiveSnapshot {
  return {
    id,
    title: 'Scout the shallows',
    description: 'Reveal the tiles around the landing.',
    kind: 'discover_tiles',
    required: true,
    target: 6,
    progress: 0,
    completed: false,
  };
}

function createDialogue(): DialogueLogSnapshot {
  return {
    activeEntryId: 'entry-1',
    entries: [
      {
        id: 'entry-1',
        chapterNumber: 1,
        kind: 'chapter_intro',
        speaker: {
          id: 'advisor',
          name: 'Chronicle',
          avatar: null,
        },
        text: 'Set up camp and map the first safe ground.',
        createdAt: 1,
      },
    ],
  };
}

function createRun(seed: number): RunSnapshot {
  return {
    mode: 'story_mode',
    modeLabel: 'Story Mode',
    seed,
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
    summary: 'Found the first camp.',
    mutator: createMutator(),
    chapter: createChapter(),
    progression: createInitialProgressionSnapshot(),
    objectives: [createObjective('objective-1')],
    dialogue: createDialogue(),
    chapterArchive: [],
  };
}

test('loadRunState syncs world generation seed to the active run seed', () => {
  const originalSeed = getWorldGenerationSeed();
  const originalHeroes = heroes.map(cloneHero);
  const originalRun = runSnapshot.value ? structuredClone(runSnapshot.value) : null;
  const originalRunLoaded = runLoaded.value;
  const originalRunVersion = runVersion.value;
  const originalMissionOverlay = missionOverlay.value ? structuredClone(missionOverlay.value) : null;

  try {
    const run = createRun(0xdecafbad);
    setWorldGenerationSeed(7);

    loadRunState(run);

    assert.equal(getWorldGenerationSeed(), run.seed >>> 0);
    assert.equal(runSnapshot.value?.seed, run.seed);
    assert.equal(runSnapshot.value?.chapterNumber, 1);
  } finally {
    setWorldGenerationSeed(originalSeed);
    loadHeroes(originalHeroes);
    missionOverlay.value = originalMissionOverlay;
    runVersion.value = originalRunVersion;

    if (originalRun) {
      runSnapshot.value = originalRun;
      runLoaded.value = true;
      loadStoryProgression(originalRun.progression);
    } else {
      runSnapshot.value = null;
      runLoaded.value = originalRunLoaded;
      loadStoryProgression(null);
    }
  }
});
