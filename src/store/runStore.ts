import { computed, ref } from 'vue';
import type {
  CompletedChapterSnapshot,
  DialogueLogSnapshot,
  RunSnapshot,
} from '../shared/goals/types.ts';
import {
  cloneStoryProgression,
  getNewlyUnlockedStoryDescriptors,
  type ProgressionSnapshot,
} from '../shared/story/progression.ts';
import { loadStoryProgression } from '../shared/story/progressionState.ts';
import { setWorldGenerationSeed } from '../core/worldVariation.ts';
import { addNotification } from './notificationStore';
import { syncHeroRoster } from './heroStore.ts';

interface ChapterCompletionOverlayState {
  type: 'completed';
  chapter: CompletedChapterSnapshot;
  nextRun: RunSnapshot | null;
}

export type MissionOverlayState = ChapterCompletionOverlayState;

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

function cloneDialogue(dialogue: DialogueLogSnapshot): DialogueLogSnapshot {
  return {
    activeEntryId: dialogue.activeEntryId,
    entries: dialogue.entries.map((entry) => ({
      ...entry,
      speaker: { ...entry.speaker },
    })),
  };
}

function cloneCompletedChapter(chapter: CompletedChapterSnapshot): CompletedChapterSnapshot {
  return {
    ...chapter,
    mutator: { ...chapter.mutator },
    chapter: { ...chapter.chapter },
    objectives: chapter.objectives.map((objective) => ({ ...objective })),
  };
}

function cloneRunSnapshot(run: RunSnapshot): RunSnapshot {
  return {
    ...run,
    mutator: { ...run.mutator },
    chapter: { ...run.chapter },
    progression: cloneProgression(run.progression),
    objectives: run.objectives.map((objective) => ({ ...objective })),
    dialogue: cloneDialogue(run.dialogue),
    chapterArchive: run.chapterArchive.map(cloneCompletedChapter),
    lastCompletedChapter: run.lastCompletedChapter ? cloneCompletedChapter(run.lastCompletedChapter) : undefined,
  };
}

export function loadRunState(run: RunSnapshot) {
  const previous = runSnapshot.value ? cloneRunSnapshot(runSnapshot.value) : null;
  const next = cloneRunSnapshot(run);
  const shouldSyncHeroRoster = !previous
    || !sameHeroRoster(previous.progression.unlocked.heroes, next.progression.unlocked.heroes);

  setWorldGenerationSeed(next.seed);
  runSnapshot.value = next;
  runLoaded.value = true;
  loadStoryProgression(next.progression);
  if (shouldSyncHeroRoster) {
    syncHeroRoster(next.progression.unlocked.heroes);
  }

  if (previous && previous.chapterNumber === next.chapterNumber) {
    const previousObjectives = new Map(previous.objectives.map((objective) => [objective.id, objective]));

    for (const objective of next.objectives) {
      const previousObjective = previousObjectives.get(objective.id);
      if (previousObjective && !previousObjective.completed && objective.completed) {
        const rewardSuffix = objective.reward?.scoreBonus
          ? ` Reward: ${objective.reward.label}.`
          : '';

        addNotification({
          type: 'goal_completed',
          title: 'Objective complete',
          message: `${objective.title} finished.${rewardSuffix}`,
          duration: 6000,
        });
      }
    }
  }

  if (previous) {
    const previousCompletedChapterNumber = previous.lastCompletedChapter?.chapterNumber ?? null;
    const nextCompletedChapterNumber = next.lastCompletedChapter?.chapterNumber ?? null;

    if (
      next.lastCompletedChapter
      && nextCompletedChapterNumber !== previousCompletedChapterNumber
    ) {
      missionOverlay.value = {
        type: 'completed',
        chapter: cloneCompletedChapter(next.lastCompletedChapter),
        nextRun: cloneRunSnapshot(next),
      };

      addNotification({
        type: 'run_state',
        title: `Chapter ${next.lastCompletedChapter.chapterNumber} complete`,
        message: `Chapter ${next.chapterNumber} is ready in the Chronicle.`,
        duration: 7000,
      });

      const unlocks = getNewlyUnlockedStoryDescriptors(next.progression);
      if (unlocks.length) {
        const preview = unlocks.slice(0, 3).map((unlock) => unlock.label).join(', ');
        const suffix = unlocks.length > 3 ? ` and ${unlocks.length - 3} more` : '';

        addNotification({
          type: 'run_state',
          title: 'New milestones',
          message: `${preview}${suffix}.`,
          duration: 7000,
        });
      }
    }
  }

  runVersion.value++;
}

export function dismissMissionOverlay() {
  missionOverlay.value = null;
  runVersion.value++;
}

export const showMissionOverlay = computed(() => !!missionOverlay.value);

export function dismissRunOutcome() {
  dismissMissionOverlay();
}

export const showRunOutcome = showMissionOverlay;
