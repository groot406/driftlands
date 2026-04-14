import test from 'node:test';
import assert from 'node:assert/strict';

import { clientMessageRouter } from '../messageRouter';
import { loadWorld } from '../world';
import { worldHandler } from './worldHandler';
import { populationState, resetClientPopulationState } from '../../store/clientPopulationStore';
import { resetClientWorkforceState, workforceState } from '../../store/clientJobStore';
import { resetSettlerState, settlers } from '../../store/settlerStore';

test.afterEach(() => {
  loadWorld([]);
  resetClientPopulationState();
  resetClientWorkforceState();
  resetSettlerState();
});

test('world snapshots and jobs updates hydrate workforce state', () => {
  worldHandler.init();

  clientMessageRouter.route({
    type: 'world:snapshot',
    tiles: [],
    heroes: [],
    settlers: [
      {
        id: 'settler-1',
        q: 0,
        r: 0,
        facing: 'down',
        appearanceSeed: 1,
        homeTileId: '0,0',
        homeAccessTileId: '0,0',
        settlementId: '0,0',
        assignedWorkTileId: '1,0',
        activity: 'commuting_work',
        stateSinceMs: 1,
        hungerMs: 0,
        fatigueMs: 0,
        workProgressMs: 0,
        carryingKind: null,
      },
    ],
    tasks: [],
    resources: {},
    storages: [],
    population: {
      current: 2,
      max: 4,
      beds: 2,
      hungerMs: 0,
      supportCapacity: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      pressureState: 'stable',
      settlements: [],
    },
    jobs: {
      availableWorkers: 2,
      assignedWorkers: 1,
      idleWorkers: 1,
      sites: [
        {
          tileId: '1,0',
          buildingKey: 'granary',
          slots: 1,
          assignedWorkers: 1,
          status: 'staffed',
        },
      ],
    },
  });

  assert.equal(populationState.current, 2);
  assert.equal(settlers.length, 1);
  assert.equal(workforceState.availableWorkers, 2);
  assert.equal(workforceState.sites.length, 1);
  assert.equal(workforceState.sites[0]?.buildingKey, 'granary');

  clientMessageRouter.route({
    type: 'jobs:update',
    availableWorkers: 3,
    assignedWorkers: 2,
    idleWorkers: 1,
    sites: [
      {
        tileId: '1,0',
        buildingKey: 'granary',
        slots: 1,
        assignedWorkers: 1,
        status: 'staffed',
      },
      {
        tileId: '2,0',
        buildingKey: 'bakery',
        slots: 1,
        assignedWorkers: 1,
        status: 'missing_input',
      },
    ],
  });

  assert.equal(workforceState.availableWorkers, 3);
  assert.equal(workforceState.assignedWorkers, 2);
  assert.equal(workforceState.idleWorkers, 1);
  assert.equal(workforceState.sites[1]?.buildingKey, 'bakery');
  assert.equal(workforceState.sites[1]?.status, 'missing_input');
});
