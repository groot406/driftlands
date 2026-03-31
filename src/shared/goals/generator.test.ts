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

// --- Tutorial missions (1-10) use fixed mutators ---

test('tutorial mission 1 uses open_frontier mutator and teaches exploration', () => {
  const blueprint = generateFoundingExpeditionMission(42, 1, 1);

  assert.equal(blueprint.mutator.key, 'open_frontier');
  assert.ok(blueprint.objectives.some((o) => o.kind === 'discover_tiles'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'chopWood'));
  assert.ok(blueprint.objectives.some((o) => o.kind === 'reach_distance'));
});

test('tutorial mission 2 uses timber_rush mutator and teaches dock and house building', () => {
  const blueprint = generateFoundingExpeditionMission(42, 2, 3);

  assert.equal(blueprint.mutator.key, 'timber_rush');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildDock'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildHouse'));
});

test('tutorial mission 3 teaches the full farming cycle', () => {
  const blueprint = generateFoundingExpeditionMission(42, 3, 4);

  assert.ok(blueprint.objectives.some((o) => o.taskType === 'tillLand'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'seedGrain'));
  assert.ok(blueprint.objectives.some((o) => o.resourceType === 'grain'));
});

test('tutorial mission 5 teaches food security with watchtower and granary', () => {
  const blueprint = generateFoundingExpeditionMission(42, 5, 5);

  assert.equal(blueprint.mutator.key, 'foragers_feast');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildWatchtower'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildGranary'));
});

test('tutorial mission 6 teaches mining with prospectors_call mutator', () => {
  const blueprint = generateFoundingExpeditionMission(42, 6, 6);

  assert.equal(blueprint.mutator.key, 'prospectors_call');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildMine'));
  assert.ok(blueprint.objectives.some((o) => o.resourceType === 'ore'));
});

test('tutorial mission 9 uses new_hearths mutator and requires a town center', () => {
  const blueprint = generateFoundingExpeditionMission(42, 9, 9);

  assert.equal(blueprint.mutator.key, 'new_hearths');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildTownCenter' && o.required));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildRoad'));
});

test('tutorial missions 1-10 are deterministic regardless of seed', () => {
  for (let mission = 1; mission <= 10; mission++) {
    const a = generateFoundingExpeditionMission(1, mission, 5);
    const b = generateFoundingExpeditionMission(9999, mission, 5);

    assert.equal(a.mutator.key, b.mutator.key);
    assert.equal(a.objectives.length, b.objectives.length);

    for (let i = 0; i < a.objectives.length; i++) {
      assert.equal(a.objectives[i]!.id, b.objectives[i]!.id);
      assert.equal(a.objectives[i]!.kind, b.objectives[i]!.kind);
      assert.equal(a.objectives[i]!.target, b.objectives[i]!.target);
    }
  }
});

test('tutorial missions have 3-4 objectives each', () => {
  for (let mission = 1; mission <= 10; mission++) {
    const blueprint = generateFoundingExpeditionMission(42, mission, 5);
    assert.ok(
      blueprint.objectives.length >= 3 && blueprint.objectives.length <= 4,
      `Mission ${mission} has ${blueprint.objectives.length} objectives, expected 3-4`,
    );
  }
});

// --- Procedural missions (11+) use mutator-based generation ---

test('procedural mission 11 can roll roadworks charters', () => {
  const seen = collectMutators(11, 12);

  assert.ok(seen.has('roadworks_drive'));
});

test('procedural mission 11 can roll new-hearth charters with town-center and road objectives', () => {
  const blueprint = findMissionByMutator('new_hearths', 11, 12);

  assert.ok(blueprint);
  assert.equal(blueprint?.mutator.key, 'new_hearths');
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildTownCenter' && o.required));
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildRoad' && o.required));
});

test('procedural roadworks charters require both roads and a supply depot', () => {
  const blueprint = findMissionByMutator('roadworks_drive', 11, 12);

  assert.ok(blueprint);
  assert.equal(blueprint?.mutator.key, 'roadworks_drive');
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildRoad' && o.required));
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildSupplyDepot' && o.required));
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
