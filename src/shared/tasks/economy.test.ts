import test from 'node:test';
import assert from 'node:assert/strict';

import { getBuildingDefinitionByTaskKey } from '../buildings/registry.ts';
import { getTaskDefinition } from './taskRegistry.ts';
import './taskDefinitions.ts';

test('task economy formulas stay flat regardless of distance', () => {
  const explore = getTaskDefinition('explore');
  const buildRoad = getTaskDefinition('buildRoad');
  const gatherTimber = getTaskDefinition('gatherTimber');

  assert.equal(explore?.requiredXp(1), explore?.requiredXp(20));
  assert.deepEqual(buildRoad?.requiredResources?.(1), buildRoad?.requiredResources?.(20));
  assert.deepEqual(gatherTimber?.totalRewardedResources?.(1), gatherTimber?.totalRewardedResources?.(20));
});

test('building economy formulas stay flat regardless of distance', () => {
  const dock = getBuildingDefinitionByTaskKey('buildDock');
  const townCenter = getBuildingDefinitionByTaskKey('buildTownCenter');

  assert.equal(dock?.requiredXp(1), dock?.requiredXp(20));
  assert.deepEqual(dock?.requiredResources(1), dock?.requiredResources(20));
  assert.equal(townCenter?.requiredXp(1), townCenter?.requiredXp(20));
  assert.deepEqual(townCenter?.requiredResources(1), townCenter?.requiredResources(20));
});
