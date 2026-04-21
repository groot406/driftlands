import test from 'node:test';
import assert from 'node:assert/strict';

import type { TaskDefinition, TaskType } from '../../core/types/Task.ts';
import { getTaskCompletionXpReward, getTaskRewardedStats } from './taskRewards.ts';

function createTaskDefinition(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    key: overrides.key ?? 'testTask',
    label: overrides.label ?? 'Test Task',
    canStart: overrides.canStart ?? (() => true),
    requiredXp: overrides.requiredXp ?? (() => 1),
    heroRate: overrides.heroRate ?? (() => 1),
    ...overrides,
  };
}

test('durable world tasks reward more completion xp than extraction tasks', () => {
  assert.equal(getTaskCompletionXpReward('chopWood'), 0);
  assert.equal(getTaskCompletionXpReward('gatherTimber'), 0);
  assert.equal(getTaskCompletionXpReward('harvestGrain'), 1);
  assert.equal(getTaskCompletionXpReward('plantTrees'), 10);
  assert.equal(getTaskCompletionXpReward('buildTownCenter'), 20);
});

test('build and upgrade tasks have fallback xp rewards', () => {
  assert.equal(getTaskCompletionXpReward('buildFutureThing' as TaskType), 8);
  assert.equal(getTaskCompletionXpReward('upgradeFutureThing' as TaskType), 10);
  assert.equal(getTaskCompletionXpReward('futureTask' as TaskType), 1);
});

test('task rewarded stats fill in xp without dropping explicit stat rewards', () => {
  const definition = createTaskDefinition({
    key: 'plantTrees',
    totalRewardedStats: () => ({ xp: 10, hp: 0, atk: 2, spd: 0 }),
  });

  assert.deepEqual(getTaskRewardedStats(definition, 0), {
    xp: 10,
    hp: 0,
    atk: 2,
    spd: 0,
  });
});

test('task rewarded stats add fallback xp when the definition has no stat rewards', () => {
  const definition = createTaskDefinition({ key: 'buildHouse' });

  assert.deepEqual(getTaskRewardedStats(definition, 0), { xp: 8 });
});
