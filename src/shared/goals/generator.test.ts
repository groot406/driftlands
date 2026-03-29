import assert from 'node:assert/strict';
import test from 'node:test';

import { generateFoundingExpeditionMission } from './generator';

function collectMutators(missionNumber: number, currentFrontierDistance: number, seedCount: number = 256) {
  const seen = new Set<string>();

  for (let seed = 1; seed <= seedCount; seed++) {
    seen.add(generateFoundingExpeditionMission(seed, missionNumber, currentFrontierDistance).mutator.key);
  }

  return seen;
}

function findMissionByMutator(mutatorKey: string, missionNumber: number, currentFrontierDistance: number, seedCount: number = 512) {
  for (let seed = 1; seed <= seedCount; seed++) {
    const blueprint = generateFoundingExpeditionMission(seed, missionNumber, currentFrontierDistance);
    if (blueprint.mutator.key === mutatorKey) {
      return blueprint;
    }
  }

  return null;
}

test('mission 3 can roll roadworks charters before town-center charters unlock', () => {
  const seen = collectMutators(3, 8);

  assert.ok(seen.has('roadworks_drive'));
  assert.ok(!seen.has('new_hearths'));
});

test('roadworks charters require both roads and a supply depot', () => {
  const blueprint = findMissionByMutator('roadworks_drive', 3, 8);

  assert.ok(blueprint);
  assert.equal(blueprint?.mutator.key, 'roadworks_drive');
  assert.ok(blueprint?.objectives.some((objective) => objective.taskType === 'buildRoad' && objective.required));
  assert.ok(blueprint?.objectives.some((objective) => objective.taskType === 'buildSupplyDepot' && objective.required));
});

test('mission 4 can roll new-hearth charters with town-center and road objectives', () => {
  const blueprint = findMissionByMutator('new_hearths', 4, 10);

  assert.ok(blueprint);
  assert.equal(blueprint?.mutator.key, 'new_hearths');
  assert.ok(blueprint?.objectives.some((objective) => objective.taskType === 'buildTownCenter' && objective.required));
  assert.ok(blueprint?.objectives.some((objective) => objective.taskType === 'buildRoad' && objective.required));
});

test('mission rewards use score bonuses instead of time extensions', () => {
  const blueprint = generateFoundingExpeditionMission(123456789, 3, 8);

  for (const objective of blueprint.objectives) {
    if (!objective.reward) {
      continue;
    }

    assert.ok(objective.reward.scoreBonus && objective.reward.scoreBonus > 0);
    assert.match(objective.reward.label, /^\+\d+ score$/);
  }
});
