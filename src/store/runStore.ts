import { computed, ref } from 'vue';
import type { CompletedMissionSnapshot, RunSnapshot } from '../shared/goals/types.ts';
import { getNewlyUnlockedStoryDescriptors, type StoryProgressionSnapshot } from '../shared/story/progression.ts';
import { loadStoryProgression } from '../shared/story/progressionState.ts';
import { addNotification } from './notificationStore';
import { syncHeroRoster } from './heroStore.ts';

interface MissionCompletionOverlayState {
  type: 'completed';
  mission: CompletedMissionSnapshot;
  nextRun: RunSnapshot | null;
}

export type MissionOverlayState = MissionCompletionOverlayState;

export const runSnapshot = ref<RunSnapshot | null>(null);
export const runLoaded = ref(false);
export const runVersion = ref(0);
export const missionOverlay = ref<MissionOverlayState | null>(null);

function sameHeroRoster(a: string[], b: string[]) {
  return a.length === b.length && a.every((heroId, index) => heroId === b[index]);
}

function cloneProgression(progression: StoryProgressionSnapshot): StoryProgressionSnapshot {
  return {
    missionNumber: progression.missionNumber,
    heroes: {
      available: progression.heroes.available.slice(),
      newlyUnlocked: progression.heroes.newlyUnlocked.slice(),
    },
    buildings: {
      available: progression.buildings.available.slice(),
      newlyUnlocked: progression.buildings.newlyUnlocked.slice(),
    },
    tasks: {
      available: progression.tasks.available.slice(),
      newlyUnlocked: progression.tasks.newlyUnlocked.slice(),
    },
    terrains: {
      available: progression.terrains.available.slice(),
      newlyUnlocked: progression.terrains.newlyUnlocked.slice(),
    },
  };
}

function cloneCompletedMission(mission: CompletedMissionSnapshot): CompletedMissionSnapshot {
  return {
    ...mission,
    mutator: { ...mission.mutator },
    story: { ...mission.story },
    objectives: mission.objectives.map((objective) => ({ ...objective })),
  };
}

function cloneRunSnapshot(run: RunSnapshot): RunSnapshot {
  return {
    ...run,
    mutator: { ...run.mutator },
    story: { ...run.story },
    progression: cloneProgression(run.progression),
    objectives: run.objectives.map((objective) => ({ ...objective })),
    lastCompletedMission: run.lastCompletedMission ? cloneCompletedMission(run.lastCompletedMission) : undefined,
  };
}

export function loadRunState(run: RunSnapshot) {
  const previous = runSnapshot.value ? cloneRunSnapshot(runSnapshot.value) : null;
  const next = cloneRunSnapshot(run);
  const shouldSyncHeroRoster = !previous || !sameHeroRoster(previous.progression.heroes.available, next.progression.heroes.available);

  runSnapshot.value = next;
  runLoaded.value = true;
  loadStoryProgression(next.progression);
  if (shouldSyncHeroRoster) {
    syncHeroRoster(next.progression.heroes.available);
  }

  if (previous && previous.missionNumber === next.missionNumber) {
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
    const previousCompletedMissionNumber = previous.lastCompletedMission?.missionNumber ?? null;
    const nextCompletedMissionNumber = next.lastCompletedMission?.missionNumber ?? null;

    if (
      next.lastCompletedMission &&
      nextCompletedMissionNumber !== previousCompletedMissionNumber
    ) {
      missionOverlay.value = {
        type: 'completed',
        mission: cloneCompletedMission(next.lastCompletedMission),
        nextRun: cloneRunSnapshot(next),
      };

      addNotification({
        type: 'run_state',
        title: `Mission ${next.lastCompletedMission.missionNumber} complete`,
        message: `Mission ${next.missionNumber} is now available in Mission Centre.`,
        duration: 7000,
      });

      const unlocks = getNewlyUnlockedStoryDescriptors(next.progression);
      if (unlocks.length) {
        const preview = unlocks.slice(0, 3).map((unlock) => unlock.label).join(', ');
        const suffix = unlocks.length > 3 ? ` and ${unlocks.length - 3} more` : '';

        addNotification({
          type: 'run_state',
          title: 'New story unlocks',
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

// Backward-compatible aliases for older overlay modules during HMR / cached loads.
export function dismissRunOutcome() {
  dismissMissionOverlay();
}

export const showRunOutcome = showMissionOverlay;
