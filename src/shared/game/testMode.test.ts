import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getGrowthSpeedMultiplier,
  getHeroMovementSpeedAdj,
  getPopulationGrowthMultiplier,
  getProgressionOverrideNodeKeys,
  getSettlerCycleSpeedMultiplier,
  getTestModeSettingsSnapshot,
  isTileSupportEnabled,
  loadTestModeSettings,
  resetTestModeSettings,
} from './testMode.ts';
import { HERO_MOVEMENT_SPEED_ADJ } from './movementBalance.ts';

test.afterEach(() => {
  resetTestModeSettings();
});

test('progression overrides stay settlement-scoped and only apply while test mode is enabled', () => {
  loadTestModeSettings({
    enabled: false,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {
      '0,0': ['expansion', 'expansion', 'not-a-node'],
      '2,0': ['security'],
    },
    completedStudyKeys: [],
  });

  assert.deepEqual(getProgressionOverrideNodeKeys(getTestModeSettingsSnapshot(), '0,0'), []);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {
      '0,0': ['expansion', 'expansion', 'not-a-node'],
      '2,0': ['security'],
    },
    completedStudyKeys: [],
  });

  assert.deepEqual(getProgressionOverrideNodeKeys(getTestModeSettingsSnapshot(), '0,0'), ['expansion']);
  assert.deepEqual(getProgressionOverrideNodeKeys(getTestModeSettingsSnapshot(), '2,0'), ['security']);
});

test('fast hero movement reduces the effective movement timing by 5x only in test mode', () => {
  assert.equal(getHeroMovementSpeedAdj(getTestModeSettingsSnapshot()), HERO_MOVEMENT_SPEED_ADJ);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: true,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  assert.equal(getHeroMovementSpeedAdj(getTestModeSettingsSnapshot()), HERO_MOVEMENT_SPEED_ADJ / 5);
});

test('fast growth speeds tile aging up by 60x only in test mode', () => {
  assert.equal(getGrowthSpeedMultiplier(getTestModeSettingsSnapshot()), 1);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: true,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  assert.equal(getGrowthSpeedMultiplier(getTestModeSettingsSnapshot()), 60);
});

test('support tiles only applies while test mode is enabled', () => {
  assert.equal(isTileSupportEnabled(getTestModeSettingsSnapshot()), false);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: true,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  assert.equal(isTileSupportEnabled(getTestModeSettingsSnapshot()), true);
});

test('fast population growth speeds passive settler growth up by 10x only in test mode', () => {
  assert.equal(getPopulationGrowthMultiplier(getTestModeSettingsSnapshot()), 1);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: true,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  assert.equal(getPopulationGrowthMultiplier(getTestModeSettingsSnapshot()), 10);
});

test('fast settler cycles speeds work cycles up by 5x only in test mode', () => {
  assert.equal(getSettlerCycleSpeedMultiplier(getTestModeSettingsSnapshot()), 1);

  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: true,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  assert.equal(getSettlerCycleSpeedMultiplier(getTestModeSettingsSnapshot()), 5);
});
