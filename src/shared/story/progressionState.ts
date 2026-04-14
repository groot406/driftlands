import type { TerrainKey } from '../../core/terrainDefs.ts';
import type { TaskType } from '../../core/types/Task.ts';
import {
  cloneStoryProgression,
  createInitialProgressionSnapshot,
  getAvailableStoryTaskKeys,
  getInitialStoryHeroIds,
  isStoryTaskUnlocked as isStoryTaskUnlockedForProgression,
  isStoryTerrainUnlocked as isStoryTerrainUnlockedForProgression,
  isStoryUpgradeUnlocked as isStoryUpgradeUnlockedForProgression,
  type ProgressionSnapshot,
  type UpgradeKey,
} from './progression.ts';

let activeStoryProgression = createInitialProgressionSnapshot();

export function getStoryProgressionState() {
  return cloneStoryProgression(activeStoryProgression);
}

export function loadStoryProgression(progression: ProgressionSnapshot | null | undefined) {
  activeStoryProgression = progression
    ? cloneStoryProgression(progression)
    : createInitialProgressionSnapshot();

  return getStoryProgressionState();
}

export function resetStoryProgression() {
  activeStoryProgression = createInitialProgressionSnapshot();
  return getStoryProgressionState();
}

// Backward-compatible alias while older callers are migrated.
export function setStoryProgressionForMission(_missionNumber: number) {
  return resetStoryProgression();
}

export function getUnlockedStoryHeroIds() {
  return activeStoryProgression.unlocked.heroes.slice();
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

export function isStoryUpgradeUnlocked(upgradeKey: UpgradeKey) {
  return isStoryUpgradeUnlockedForProgression(activeStoryProgression, upgradeKey);
}
