import test from 'node:test';
import assert from 'node:assert/strict';

import type { Settler } from '../core/types/Settler';
import {
  applySettlersPatch,
  loadSettlers,
  resetSettlerState,
  settlers,
  settlerVersion,
} from './settlerStore';

function createSettler(overrides: Partial<Settler> & Pick<Settler, 'id'>): Settler {
  return {
    id: overrides.id,
    nameSeed: overrides.nameSeed ?? 1000,
    gender: overrides.gender ?? 'male',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    facing: overrides.facing ?? 'down',
    appearanceSeed: overrides.appearanceSeed ?? 1,
    homeTileId: overrides.homeTileId ?? '0,0',
    homeAccessTileId: overrides.homeAccessTileId ?? '0,0',
    settlementId: overrides.settlementId ?? '0,0',
    assignedWorkTileId: overrides.assignedWorkTileId ?? null,
    assignedRole: overrides.assignedRole ?? null,
    guardTowerTileId: overrides.guardTowerTileId ?? null,
    workTileId: overrides.workTileId ?? null,
    hiddenWhileWorking: overrides.hiddenWhileWorking ?? null,
    activity: overrides.activity ?? 'idle',
    blockerReason: overrides.blockerReason ?? null,
    stateSinceMs: overrides.stateSinceMs ?? 0,
    hungerMs: overrides.hungerMs ?? 0,
    fatigueMs: overrides.fatigueMs ?? 0,
    happiness: overrides.happiness ?? 100,
    traits: overrides.traits,
    drinkPreference: overrides.drinkPreference,
    workProgressMs: overrides.workProgressMs ?? 0,
    carryingKind: overrides.carryingKind ?? null,
    socialTileId: overrides.socialTileId ?? null,
    movement: overrides.movement,
    carryingPayload: overrides.carryingPayload,
  };
}

test.afterEach(() => {
  resetSettlerState();
});

test('applySettlersPatch updates and removes settlers without replacing unchanged entries', () => {
  loadSettlers([
    createSettler({ id: 'settler-1', q: 0, r: 0, activity: 'idle' }),
    createSettler({ id: 'settler-2', q: 1, r: 0, activity: 'working' }),
  ]);
  const unchangedSettler = settlers[1];
  const versionBefore = settlerVersion.value;

  applySettlersPatch({
    updates: [createSettler({ id: 'settler-1', q: 2, r: -1, activity: 'commuting_home' })],
    removedIds: [],
    timestamp: 10_000,
  });

  assert.equal(settlers.length, 2);
  assert.equal(settlers[0]?.id, 'settler-1');
  assert.equal(settlers[0]?.q, 2);
  assert.equal(settlers[0]?.r, -1);
  assert.equal(settlers[0]?.activity, 'commuting_home');
  assert.equal(settlers[1], unchangedSettler);
  assert.equal(settlerVersion.value, versionBefore + 1);

  applySettlersPatch({
    updates: [],
    removedIds: ['settler-2'],
    timestamp: 10_250,
  });

  assert.deepEqual(settlers.map((settler) => settler.id), ['settler-1']);
});

test('full settler load remains the resync fallback after patches', () => {
  loadSettlers([createSettler({ id: 'settler-1', q: 0, r: 0 })]);
  applySettlersPatch({
    updates: [createSettler({ id: 'settler-1', q: 3, r: 0 })],
    removedIds: [],
    timestamp: 10_000,
  });

  loadSettlers([
    createSettler({ id: 'settler-1', q: 5, r: 0 }),
    createSettler({ id: 'settler-3', q: 6, r: 0 }),
  ]);

  assert.deepEqual(
    settlers.map((settler) => ({ id: settler.id, q: settler.q })),
    [
      { id: 'settler-1', q: 5 },
      { id: 'settler-3', q: 6 },
    ],
  );
});
