import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addStudyProgress,
  getStudyJobOutputMultiplier,
  getStudySnapshot,
  isContentUnlockedByStudies,
  resetStudyState,
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
