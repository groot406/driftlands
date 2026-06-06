import test from 'node:test';
import assert from 'node:assert/strict';

import './taskDefinitions.ts';
import { getTaskDefinition } from './taskRegistry.ts';
import { formatContinueTaskLabel } from './taskLabels.ts';

test('continue task label uses the requested action wording for plant trees', () => {
  const def = getTaskDefinition('plantTrees');

  assert.equal(formatContinueTaskLabel(def, 'plantTrees'), 'Continue task: Plant tree');
});

