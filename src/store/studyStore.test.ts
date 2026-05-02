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
import { STUDY_WORK_CYCLE_MS } from '../shared/studies/studies.ts';

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
