import { reactive, ref } from 'vue';
import {
  listProgressionNodeDefinitions,
  type ProgressionNodeKey,
} from '../story/progression.ts';
import {
  listStudyDefinitions,
  type StudyKey,
} from '../studies/studies.ts';
import { HERO_MOVEMENT_SPEED_ADJ } from './movementBalance.ts';

export interface TestModeSettingsSnapshot {
  enabled: boolean;
  instantBuild: boolean;
  unlimitedResources: boolean;
  fastHeroMovement: boolean;
  fastGrowth: boolean;
  fastPopulationGrowth: boolean;
  fastSettlerCycles: boolean;
  supportTiles: boolean;
  progressionOverridesBySettlementId: Record<string, ProgressionNodeKey[]>;
  completedStudyKeys: StudyKey[];
}

export const TEST_MODE_VIRTUAL_RESOURCE_AMOUNT = 999_999;

const progressionSortOrder = new Map(
  listProgressionNodeDefinitions().map((node, index) => [node.key, index] as const),
);
const knownProgressionNodeKeys = new Set(progressionSortOrder.keys());
const studySortOrder = new Map(
  listStudyDefinitions().map((study, index) => [study.key, index] as const),
);
const knownStudyKeys = new Set(studySortOrder.keys());

function clearRecord(record: Record<string, ProgressionNodeKey[]>) {
  for (const key of Object.keys(record)) {
    delete record[key];
  }
}

export function normalizeProgressionNodeKeys(keys: readonly string[] | null | undefined): ProgressionNodeKey[] {
  const unique = new Set<ProgressionNodeKey>();

  for (const key of keys ?? []) {
    if (knownProgressionNodeKeys.has(key as ProgressionNodeKey)) {
      unique.add(key as ProgressionNodeKey);
    }
  }

  return Array.from(unique).sort((left, right) => {
    return (progressionSortOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (progressionSortOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function normalizeStudyKeys(keys: readonly string[] | null | undefined): StudyKey[] {
  const unique = new Set<StudyKey>();

  for (const key of keys ?? []) {
    if (knownStudyKeys.has(key as StudyKey)) {
      unique.add(key as StudyKey);
    }
  }

  return Array.from(unique).sort((left, right) => {
    return (studySortOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (studySortOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function normalizeProgressionOverridesBySettlementId(
  overrides: Record<string, readonly string[] | null | undefined> | null | undefined,
): Record<string, ProgressionNodeKey[]> {
  const normalized: Record<string, ProgressionNodeKey[]> = {};

  for (const [settlementId, keys] of Object.entries(overrides ?? {})) {
    const nodeKeys = normalizeProgressionNodeKeys(keys);
    if (!settlementId || nodeKeys.length === 0) {
      continue;
    }

    normalized[settlementId] = nodeKeys;
  }

  return normalized;
}

export function createDefaultTestModeSettings(): TestModeSettingsSnapshot {
  return {
    enabled: false,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  };
}

export function cloneTestModeSettings(snapshot: TestModeSettingsSnapshot | null | undefined): TestModeSettingsSnapshot {
  const normalized = snapshot ?? createDefaultTestModeSettings();

  return {
    enabled: !!normalized.enabled,
    instantBuild: !!normalized.instantBuild,
    unlimitedResources: !!normalized.unlimitedResources,
    fastHeroMovement: !!normalized.fastHeroMovement,
    fastGrowth: !!normalized.fastGrowth,
    fastPopulationGrowth: !!normalized.fastPopulationGrowth,
    fastSettlerCycles: !!normalized.fastSettlerCycles,
    supportTiles: !!normalized.supportTiles,
    progressionOverridesBySettlementId: normalizeProgressionOverridesBySettlementId(normalized.progressionOverridesBySettlementId),
    completedStudyKeys: normalizeStudyKeys(normalized.completedStudyKeys),
  };
}

export const testModeSettings = reactive<TestModeSettingsSnapshot>(createDefaultTestModeSettings());
export const testModeVersion = ref(0);

export function loadTestModeSettings(snapshot: TestModeSettingsSnapshot | null | undefined) {
  const next = cloneTestModeSettings(snapshot);
  testModeSettings.enabled = next.enabled;
  testModeSettings.instantBuild = next.instantBuild;
  testModeSettings.unlimitedResources = next.unlimitedResources;
  testModeSettings.fastHeroMovement = next.fastHeroMovement;
  testModeSettings.fastGrowth = next.fastGrowth;
  testModeSettings.fastPopulationGrowth = next.fastPopulationGrowth;
  testModeSettings.fastSettlerCycles = next.fastSettlerCycles;
  testModeSettings.supportTiles = next.supportTiles;
  clearRecord(testModeSettings.progressionOverridesBySettlementId);
  for (const [settlementId, keys] of Object.entries(next.progressionOverridesBySettlementId)) {
    testModeSettings.progressionOverridesBySettlementId[settlementId] = keys.slice();
  }
  testModeSettings.completedStudyKeys = next.completedStudyKeys.slice();
  testModeVersion.value++;
}

export function resetTestModeSettings() {
  loadTestModeSettings(createDefaultTestModeSettings());
}

export function getTestModeSettingsSnapshot() {
  return cloneTestModeSettings(testModeSettings);
}

export function isTestModeEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return !!snapshot?.enabled;
}

export function isInstantBuildEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.instantBuild;
}

export function isUnlimitedResourcesEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.unlimitedResources;
}

export function isFastHeroMovementEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.fastHeroMovement;
}

export function getHeroMovementSpeedAdj(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isFastHeroMovementEnabled(snapshot)
    ? HERO_MOVEMENT_SPEED_ADJ / 5
    : HERO_MOVEMENT_SPEED_ADJ;
}

export function isFastGrowthEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.fastGrowth;
}

export function getGrowthSpeedMultiplier(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isFastGrowthEnabled(snapshot) ? 60 : 1;
}

export function isFastPopulationGrowthEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.fastPopulationGrowth;
}

export function getPopulationGrowthMultiplier(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isFastPopulationGrowthEnabled(snapshot) ? 10 : 1;
}

export function isFastSettlerCyclesEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.fastSettlerCycles;
}

export function getSettlerCycleSpeedMultiplier(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isFastSettlerCyclesEnabled(snapshot) ? 5 : 1;
}

export function isTileSupportEnabled(snapshot: TestModeSettingsSnapshot | null | undefined = testModeSettings) {
  return isTestModeEnabled(snapshot) && !!snapshot?.supportTiles;
}

export function getProgressionOverrideNodeKeys(
  snapshot: TestModeSettingsSnapshot | null | undefined,
  settlementId: string | null | undefined,
) {
  if (!isTestModeEnabled(snapshot) || !settlementId) {
    return [] as ProgressionNodeKey[];
  }

  return normalizeProgressionNodeKeys(snapshot?.progressionOverridesBySettlementId?.[settlementId]);
}
