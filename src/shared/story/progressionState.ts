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
let activeSettlementId: string | null = null;
const progressionBySettlementId = new Map<string, ProgressionSnapshot>();

function resolveProgression(settlementId: string | null | undefined) {
  return settlementId
    ? progressionBySettlementId.get(settlementId) ?? createInitialProgressionSnapshot()
    : activeStoryProgression;
}

export function setActiveStorySettlement(settlementId: string | null | undefined) {
  activeSettlementId = settlementId ?? null;
  activeStoryProgression = resolveProgression(activeSettlementId);
  return getStoryProgressionState();
}

export function getActiveStorySettlementId() {
  return activeSettlementId;
}

export function getStoryProgressionState(settlementId?: string | null) {
  return cloneStoryProgression(resolveProgression(settlementId ?? activeSettlementId));
}

export function loadStoryProgression(progression: ProgressionSnapshot | null | undefined, settlementId?: string | null) {
  const nextProgression = progression
    ? cloneStoryProgression(progression)
    : createInitialProgressionSnapshot();

  const targetSettlementId = settlementId ?? activeSettlementId;
  if (targetSettlementId) {
    progressionBySettlementId.set(targetSettlementId, nextProgression);
  }

  activeStoryProgression = nextProgression;
  return getStoryProgressionState(targetSettlementId);
}

export function resetStoryProgression(settlementId?: string | null) {
  const targetSettlementId = settlementId ?? null;
  if (targetSettlementId) {
    progressionBySettlementId.delete(targetSettlementId);
    if (activeSettlementId === targetSettlementId) {
      activeStoryProgression = createInitialProgressionSnapshot();
    }
    return getStoryProgressionState(targetSettlementId);
  }

  progressionBySettlementId.clear();
  activeStoryProgression = createInitialProgressionSnapshot();
  return getStoryProgressionState(activeSettlementId);
}

// Backward-compatible alias while older callers are migrated.
export function setStoryProgressionForMission(_missionNumber: number) {
  return resetStoryProgression();
}

export function getUnlockedStoryHeroIds() {
  return resolveProgression(activeSettlementId).unlocked.heroes.slice();
}

export function getInitialUnlockedStoryHeroIds() {
  return getInitialStoryHeroIds().slice();
}

export function getUnlockedStoryTaskKeys() {
  return getAvailableStoryTaskKeys(resolveProgression(activeSettlementId));
}

export function isStoryTaskUnlocked(taskKey: TaskType, settlementId?: string | null) {
  return isStoryTaskUnlockedForProgression(resolveProgression(settlementId ?? activeSettlementId), taskKey);
}

export function isStoryTerrainUnlocked(terrainKey: TerrainKey, settlementId?: string | null) {
  return isStoryTerrainUnlockedForProgression(resolveProgression(settlementId ?? activeSettlementId), terrainKey);
}

export function isStoryUpgradeUnlocked(upgradeKey: UpgradeKey, settlementId?: string | null) {
  return isStoryUpgradeUnlockedForProgression(resolveProgression(settlementId ?? activeSettlementId), upgradeKey);
}
