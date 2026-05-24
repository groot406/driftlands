import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addStudyProgress,
  getStudyJobOutputMultiplier,
  getStudySnapshot,
  isContentUnlockedByStudies,
  resetStudyState,
  setStudyOverrides,
  selectActiveStudy,
} from './studyStore.ts';
import { listStudyDefinitions, STUDY_WORK_CYCLE_MS } from '../shared/studies/studies.ts';

test.afterEach(() => {
  resetStudyState();
});

test('study progress completes subjects and applies their unlock effects', () => {
  resetStudyState();

  const completedStudy = addStudyProgress(6 * STUDY_WORK_CYCLE_MS);

  assert.equal(completedStudy?.key, 'field_notebooks');
  assert.deepEqual(getStudySnapshot().completedStudyKeys, ['field_notebooks']);
  assert.equal(getStudySnapshot().activeStudyKey, 'masonry_treatises');
  assert.equal(getStudyJobOutputMultiplier(), 1.1);
  assert.equal(isContentUnlockedByStudies({ kind: 'upgrade', key: 'stone_house_upgrade' }), false);

  addStudyProgress(9 * STUDY_WORK_CYCLE_MS);

  assert.equal(isContentUnlockedByStudies({ kind: 'upgrade', key: 'stone_house_upgrade' }), true);
});

test('active study can be selected from unfinished subjects', () => {
  resetStudyState();

  assert.equal(selectActiveStudy('warehouse_ledgers'), true);
  assert.equal(getStudySnapshot().activeStudyKey, 'warehouse_ledgers');

  addStudyProgress(12 * STUDY_WORK_CYCLE_MS);

  assert.equal(isContentUnlockedByStudies({ kind: 'upgrade', key: 'warehouse_upgrade' }), true);
  assert.equal(selectActiveStudy('warehouse_ledgers'), false);
  assert.notEqual(getStudySnapshot().activeStudyKey, 'warehouse_ledgers');
});

test('study state is scoped per settlement', () => {
  resetStudyState();

  assert.equal(selectActiveStudy('warehouse_ledgers', '0,0'), true);
  addStudyProgress(12 * STUDY_WORK_CYCLE_MS, '0,0');

  const firstSettlement = getStudySnapshot('0,0');
  const secondSettlement = getStudySnapshot('10,0');

  assert.deepEqual(firstSettlement.completedStudyKeys, ['warehouse_ledgers']);
  assert.equal(firstSettlement.activeStudyKey, 'field_notebooks');
  assert.deepEqual(secondSettlement.completedStudyKeys, []);
  assert.equal(secondSettlement.activeStudyKey, 'field_notebooks');
});

test('study overrides can be applied and cleared without changing underlying progress', () => {
  resetStudyState();

  setStudyOverrides(['field_notebooks']);
  assert.deepEqual(getStudySnapshot().completedStudyKeys, ['field_notebooks']);
  assert.equal(getStudySnapshot().activeStudyKey, 'masonry_treatises');
  assert.equal(getStudyJobOutputMultiplier(), 1.1);

  setStudyOverrides([]);
  assert.deepEqual(getStudySnapshot().completedStudyKeys, []);
  assert.equal(getStudySnapshot().activeStudyKey, 'field_notebooks');
  assert.equal(getStudyJobOutputMultiplier(), 1);
});

test('default study queue keeps military command improvements before late economy buffs', () => {
  const studies = listStudyDefinitions();
  const studyIndex = new Map(studies.map((study, index) => [study.key, index]));
  const totalCyclesThroughPalisades = studies
    .slice(0, (studyIndex.get('defensive_construction') ?? -1) + 1)
    .reduce((total, study) => total + (study.requiredProgressMs / STUDY_WORK_CYCLE_MS), 0);

  assert.ok((studyIndex.get('border_management') ?? Infinity) < (studyIndex.get('warehouse_ledgers') ?? -1));
  assert.ok((studyIndex.get('defensive_construction') ?? Infinity) < (studyIndex.get('warehouse_ledgers') ?? -1));
  assert.equal(isContentUnlockedByStudies({ kind: 'building', key: 'wall' }), false);
  assert.equal(isContentUnlockedByStudies({ kind: 'building', key: 'barracks' }), false);
  assert.equal(isContentUnlockedByStudies({ kind: 'building', key: 'weaponSmith' }), false);

  setStudyOverrides(['border_management']);
  assert.equal(isContentUnlockedByStudies({ kind: 'building', key: 'wall' }), false);
  assert.ok(totalCyclesThroughPalisades <= 30);
});
