import assert from 'node:assert/strict';
import test from 'node:test';

import { generateFoundingExpeditionMission, type RunGenerationMetrics } from './generator.ts';
import { createEmptyProgressionMetrics, evaluateProgression, type ProgressionSnapshot } from '../story/progression.ts';

function metrics(frontierDistance: number, overrides: Partial<RunGenerationMetrics> = {}): RunGenerationMetrics {
  return {
    frontierDistance,
    population: overrides.population ?? 1,
    activeTiles: overrides.activeTiles ?? 0,
    inactiveTiles: overrides.inactiveTiles ?? 0,
  };
}

function lateProgression(): ProgressionSnapshot {
  return evaluateProgression({
    ...createEmptyProgressionMetrics(),
    frontierDistance: 10,
    population: 7,
    beds: 8,
    discoveredTerrains: ['water', 'forest', 'mountain', 'snow', 'dessert'],
    resourceStock: {
      grain: 10,
      stone: 8,
      ore: 12,
    },
    buildingCounts: {
      house: 2,
      watchtower: 1,
      granary: 1,
      supplyDepot: 1,
      townCenter: 1,
    },
    operationalBuildingCounts: {
      granary: 1,
    },
  });
}

function collectMutators(
  missionNumber: number,
  currentFrontierDistance: number,
  progression?: ProgressionSnapshot,
  seedCount: number = 256,
) {
  const seen = new Set<string>();

  for (let seed = 1; seed <= seedCount; seed++) {
    seen.add(generateFoundingExpeditionMission(seed, missionNumber, metrics(currentFrontierDistance), progression).mutator.key);
  }

  return seen;
}

function findMissionByMutator(
  mutatorKey: string,
  missionNumber: number,
  currentFrontierDistance: number,
  progression?: ProgressionSnapshot,
  seedCount: number = 512,
) {
  for (let seed = 1; seed <= seedCount; seed++) {
    const blueprint = generateFoundingExpeditionMission(seed, missionNumber, metrics(currentFrontierDistance), progression);
    if (blueprint.mutator.key === mutatorKey) {
      return blueprint;
    }
  }

  return null;
}

// --- Tutorial missions (1-10) use fixed mutators ---

test('tutorial mission 1 uses open_frontier mutator and teaches exploration', () => {
  const blueprint = generateFoundingExpeditionMission(42, 1, metrics(1));

  assert.equal(blueprint.mutator.key, 'open_frontier');
  assert.ok(blueprint.objectives.some((o) => o.kind === 'discover_tiles'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'chopWood'));
  assert.ok(blueprint.objectives.some((o) => o.kind === 'reach_distance'));
});

test('tutorial mission 2 uses timber_rush mutator and teaches dock and house building', () => {
  const blueprint = generateFoundingExpeditionMission(42, 2, metrics(3));

  assert.equal(blueprint.mutator.key, 'timber_rush');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildDock'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildHouse'));
});

test('tutorial mission 3 teaches the full farming cycle', () => {
  const blueprint = generateFoundingExpeditionMission(42, 3, metrics(4));

  assert.ok(blueprint.objectives.some((o) => o.taskType === 'tillLand'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'seedGrain'));
  assert.ok(blueprint.objectives.some((o) => o.resourceType === 'grain'));
});

test('tutorial mission 5 teaches food security with watchtower, granary, and bakery', () => {
  const blueprint = generateFoundingExpeditionMission(42, 5, metrics(5, { activeTiles: 12 }));

  assert.equal(blueprint.mutator.key, 'foragers_feast');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildWatchtower'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildGranary'));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildBakery'));
  assert.ok(blueprint.objectives.some((o) => o.kind === 'reach_active_tiles' && o.target === 16));
});

test('tutorial mission 6 teaches mining with prospectors_call mutator', () => {
  const blueprint = generateFoundingExpeditionMission(42, 6, metrics(6, { activeTiles: 10 }));

  assert.equal(blueprint.mutator.key, 'prospectors_call');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildMine'));
  assert.ok(blueprint.objectives.some((o) => o.resourceType === 'ore'));
  assert.ok(blueprint.objectives.some((o) => o.kind === 'reach_active_tiles' && o.target === 14));
});

test('tutorial mission 9 uses new_hearths mutator and requires a town center', () => {
  const blueprint = generateFoundingExpeditionMission(42, 9, metrics(9, { activeTiles: 22 }));

  assert.equal(blueprint.mutator.key, 'new_hearths');
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildTownCenter' && o.required));
  assert.ok(blueprint.objectives.some((o) => o.taskType === 'buildRoad'));
  assert.ok(blueprint.objectives.some((o) => o.kind === 'reach_active_tiles' && o.target === 28));
});

test('tutorial missions 1-10 are deterministic regardless of seed', () => {
  for (let mission = 1; mission <= 10; mission++) {
    const a = generateFoundingExpeditionMission(1, mission, metrics(5, { activeTiles: 9 }));
    const b = generateFoundingExpeditionMission(9999, mission, metrics(5, { activeTiles: 9 }));

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
    const blueprint = generateFoundingExpeditionMission(42, mission, metrics(5, { activeTiles: 9 }));
    assert.ok(
      blueprint.objectives.length >= 3 && blueprint.objectives.length <= 5,
      `Mission ${mission} has ${blueprint.objectives.length} objectives, expected 3-5`,
    );
  }
});

// --- Procedural missions (11+) use mutator-based generation ---

test('procedural mission 11 can roll roadworks charters', () => {
  const seen = collectMutators(11, 12, lateProgression());

  assert.ok(seen.has('roadworks_drive'));
});

test('procedural mission 11 can roll new-hearth charters with town-center and road objectives', () => {
  const blueprint = findMissionByMutator('new_hearths', 11, 12, lateProgression());

  assert.ok(blueprint);
  assert.equal(blueprint?.mutator.key, 'new_hearths');
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildTownCenter' && o.required));
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildRoad' && o.required));
});

test('procedural roadworks charters require both roads and a supply depot', () => {
  const blueprint = findMissionByMutator('roadworks_drive', 11, 12, lateProgression());

  assert.ok(blueprint);
  assert.equal(blueprint?.mutator.key, 'roadworks_drive');
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildRoad' && o.required));
  assert.ok(blueprint?.objectives.some((o) => o.taskType === 'buildSupplyDepot' && o.required));
});

test('mission rewards use score bonuses instead of time extensions', () => {
  const blueprint = generateFoundingExpeditionMission(123456789, 3, metrics(8));

  for (const objective of blueprint.objectives) {
    if (!objective.reward) {
      continue;
    }

    assert.ok(objective.reward.scoreBonus && objective.reward.scoreBonus > 0);
    assert.match(objective.reward.label, /^\+\d+ score$/);
  }
});

test('missions with inactive tiles add a restore objective', () => {
  const blueprint = generateFoundingExpeditionMission(42, 7, metrics(8, { activeTiles: 14, inactiveTiles: 3 }));

  assert.ok(blueprint.objectives.some((o) => o.kind === 'restore_tiles' && o.target === 2 && !o.required));
});
