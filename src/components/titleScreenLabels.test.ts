import assert from 'node:assert/strict';
import test from 'node:test';
import { getPrimaryActionLabel } from './titleScreenLabels.ts';

test('native build start buttons do not include Demo wording', () => {
  assert.equal(getPrimaryActionLabel({ hasCurrentRun: false, hasExistingSettlement: false }), 'Start Colony');
  assert.equal(getPrimaryActionLabel({ hasCurrentRun: true, hasExistingSettlement: false }), 'Continue Colony');
  assert.equal(getPrimaryActionLabel({ hasCurrentRun: false, hasExistingSettlement: true }), 'Continue Colony');
});
