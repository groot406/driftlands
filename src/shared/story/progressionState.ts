import type { TerrainKey } from '../../core/terrainDefs.ts';
import type { TaskType } from '../../core/types/Task.ts';
import {
  cloneStoryProgression,
  createStoryProgression,
  getAvailableStoryTaskKeys,
  getInitialStoryHeroIds,
  isStoryTaskUnlocked as isStoryTaskUnlockedForProgression,
  isStoryTerrainUnlocked as isStoryTerrainUnlockedForProgression,
  type StoryProgressionSnapshot,
} from './progression.ts';

let activeStoryProgression = createStoryProgression(1);

export function getStoryProgressionState() {
  return cloneStoryProgression(activeStoryProgression);
}

export function loadStoryProgression(progression: StoryProgressionSnapshot | null | undefined) {
  activeStoryProgression = progression
    ? cloneStoryProgression(progression)
    : createStoryProgression(1);

  return getStoryProgressionState();
}

export function setStoryProgressionForMission(missionNumber: number) {
  activeStoryProgression = createStoryProgression(missionNumber);
  return getStoryProgressionState();
}

export function getUnlockedStoryHeroIds() {
  return activeStoryProgression.heroes.available.slice();
}

export function getInitialUnlockedStoryHeroIds() {
  return getInitialStoryHeroIds().slice();
}

export function getUnlockedStoryTaskKeys() {
  return getAvailableStoryTaskKeys(activeStoryProgression);
}

export function isStoryTaskUnlocked(taskKey: TaskType) {
  return isStoryTaskUnlockedForProgression(activeStoryProgression, taskKey);
}

export function isStoryTerrainUnlocked(terrainKey: TerrainKey) {
  return isStoryTerrainUnlockedForProgression(activeStoryProgression, terrainKey);
}
