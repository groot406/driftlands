import assert from 'node:assert/strict';
import test from 'node:test';

import { getJobSiteAdvice, getJobSiteStatusDescriptor, getMissingInputResources } from './jobSiteDetails.ts';
import { formatSettlerBlocker } from '../game/settlerBlockers.ts';

test('job site status descriptors stay user-facing and stable', () => {
  assert.deepEqual(getJobSiteStatusDescriptor('staffed'), {
    text: 'Staffed — production is running',
    tone: 'ok',
  });

  assert.deepEqual(getJobSiteStatusDescriptor('paused'), {
    text: 'Paused — manually turned off',
    tone: 'warn',
  });

  assert.deepEqual(getJobSiteStatusDescriptor('storage_full'), {
    text: 'Storage full — clear space in colony stores',
    tone: 'danger',
  });

  assert.deepEqual(getJobSiteStatusDescriptor('depleted'), {
    text: 'Depleted — this vein has run dry',
    tone: 'danger',
  });
});

test('missing input advice calls out shortages and upstream bakery guidance', () => {
  const advice = getJobSiteAdvice({
    building: {
      key: 'bakery',
      consumes: [{ type: 'grain', amount: 1 }],
      produces: [{ type: 'food', amount: 3 }],
      jobSlots: 1,
      cycleMs: 60_000,
    },
    site: {
      status: 'missing_input',
      assignedWorkers: 1,
      slots: 1,
    },
    population: {
      current: 3,
      max: 10,
      beds: 4,
      hungerMs: 0,
      pressureState: 'stable',
      inactiveTileCount: 0,
    },
    workforce: {
      availableWorkers: 3,
      idleWorkers: 0,
    },
    resourceInventory: {
      grain: 0,
    },
    totalFreeStorage: 20,
  });

  assert.ok(advice.some((entry) => entry.includes('grain')));
  assert.ok(advice.some((entry) => entry.includes('granaries')));
});

test('unstaffed advice escalates from houses to another town center when capped', () => {
  const advice = getJobSiteAdvice({
    building: {
      key: 'lumberCamp',
      consumes: [],
      produces: [{ type: 'wood', amount: 2 }],
      jobSlots: 1,
      cycleMs: 60_000,
    },
    site: {
      status: 'unstaffed',
      assignedWorkers: 0,
      slots: 1,
    },
    population: {
      current: 10,
      max: 10,
      beds: 10,
      hungerMs: 0,
      pressureState: 'stable',
      inactiveTileCount: 0,
    },
    workforce: {
      availableWorkers: 0,
      idleWorkers: 0,
    },
    resourceInventory: {},
    totalFreeStorage: 50,
  });

  assert.ok(advice.some((entry) => entry.includes('town center')));
  assert.ok(advice.some((entry) => entry.includes('houses')));
});

test('missing input gap calculation scales by assigned workers', () => {
  const shortages = getMissingInputResources(
    [{ type: 'grain', amount: 1 }],
    2,
    { grain: 1 },
  );

  assert.deepEqual(shortages, [{
    type: 'grain',
    required: 2,
    available: 1,
    missing: 1,
  }]);
});

test('settler blocker labels explain the resource or logistics problem', () => {
  assert.equal(formatSettlerBlocker({
    code: 'missing_repair_material',
    resourceType: 'wood',
    amount: 2,
  }), 'Waiting: needs 2 wood for repairs');

  assert.equal(formatSettlerBlocker({
    code: 'storage_full',
    resourceType: 'stone',
  }), 'Waiting: storage full for stone');
});
