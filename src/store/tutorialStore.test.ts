import test from 'node:test';
import assert from 'node:assert/strict';

import { getTutorialHintTaskKeysForStep } from './tutorialStore.ts';

test('tutorial hint routing sends waterless open-field starts to tree planting instead of docks', () => {
  const route = getTutorialHintTaskKeysForStep('build-dock', 'open_field');

  assert.deepEqual(route?.taskKeys, ['plantTrees', 'hunt', 'buildHuntersHut']);
  assert.equal(route?.scoutLabel, 'Find open land');
  assert.equal(route?.taskKeys.includes('buildDock'), false);
});

test('tutorial hint routing keeps shoreline and woodland early-food routes distinct', () => {
  assert.deepEqual(
    getTutorialHintTaskKeysForStep('build-dock', 'shoreline')?.taskKeys,
    ['buildDock'],
  );
  assert.deepEqual(
    getTutorialHintTaskKeysForStep('build-dock', 'woodland')?.taskKeys,
    ['hunt', 'buildHuntersHut'],
  );
});
