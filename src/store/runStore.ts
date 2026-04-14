import { computed, ref } from 'vue';
import type { RunSnapshot } from '../shared/goals/types.ts';
import { cloneStoryProgression, type ProgressionSnapshot } from '../shared/story/progression.ts';
import { loadStoryProgression } from '../shared/story/progressionState.ts';
import { setWorldGenerationSeed } from '../core/worldVariation.ts';
import { syncHeroRoster } from './heroStore.ts';

interface MissionOverlayState {
  type: 'disabled';
}

export const runSnapshot = ref<RunSnapshot | null>(null);
export const runLoaded = ref(false);
export const runVersion = ref(0);
export const missionOverlay = ref<MissionOverlayState | null>(null);

function sameHeroRoster(a: string[], b: string[]) {
  return a.length === b.length && a.every((heroId, index) => heroId === b[index]);
}

function cloneProgression(progression: ProgressionSnapshot): ProgressionSnapshot {
  return cloneStoryProgression(progression);
}

function cloneRunSnapshot(run: RunSnapshot): RunSnapshot {
  return {
    ...run,
    mutator: { ...run.mutator },
    chapter: { ...run.chapter },
    progression: cloneProgression(run.progression),
    objectives: [],
    dialogue: {
      activeEntryId: run.dialogue.activeEntryId,
      entries: run.dialogue.entries.map((entry) => ({
        ...entry,
        speaker: { ...entry.speaker },
      })),
    },
    chapterArchive: [],
    lastCompletedChapter: undefined,
  };
}

export function loadRunState(run: RunSnapshot) {
  const previous = runSnapshot.value ? cloneRunSnapshot(runSnapshot.value) : null;
  const next = cloneRunSnapshot(run);
  const shouldSyncHeroRoster = !previous || !sameHeroRoster(previous.progression.unlocked.heroes, next.progression.unlocked.heroes);

  setWorldGenerationSeed(next.seed);
  runSnapshot.value = next;
  runLoaded.value = true;
  loadStoryProgression(next.progression);
  if (shouldSyncHeroRoster) {
    syncHeroRoster(next.progression.unlocked.heroes);
  }

  missionOverlay.value = null;
  runVersion.value++;
}

export function dismissMissionOverlay() {
  missionOverlay.value = null;
  runVersion.value++;
}

export const showMissionOverlay = computed(() => false);

export function dismissRunOutcome() {
  dismissMissionOverlay();
}

export const showRunOutcome = showMissionOverlay;
