import test from 'node:test';
import assert from 'node:assert/strict';

import { clientMessageRouter } from '../messageRouter';
import { loadWorld } from '../world';
import { worldHandler } from './worldHandler';
import { populationState, resetClientPopulationState } from '../../store/clientPopulationStore';
import { resetClientWorkforceState, workforceState } from '../../store/clientJobStore';
import { resetClientStudyState } from '../../store/clientStudyStore';
import { resetSettlerState, settlers } from '../../store/settlerStore';
import { resetServerConfigStore, serverDebugModeEnabled } from '../../store/serverConfigStore.ts';
import {
  depositResourceToStorage,
  getStorageResourceAmount,
  resetResourceState,
  resourceInventory,
} from '../../store/resourceStore';
import type { Tile } from '../types/Tile';

function createTowncenterTile(id: string, q: number, r: number): Tile {
  return {
    id,
    q,
    r,
    biome: 'plains',
    terrain: 'towncenter',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    variant: null,
  };
}

function emptyStudies() {
  return {
    activeStudyKey: null,
    completedStudyKeys: [],
    studies: [],
  };
}

test.afterEach(() => {
  loadWorld([]);
  resetClientPopulationState();
  resetClientWorkforceState();
  resetClientStudyState();
  resetSettlerState();
  resetServerConfigStore();
  resetResourceState();
});

test('server debug mode stays disabled until a snapshot explicitly enables it', () => {
  assert.equal(serverDebugModeEnabled.value, false);
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
    studies: emptyStudies(),
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

test('world snapshots keep per-storage inventory hydrated when legacy aggregate resources are also present', () => {
  worldHandler.init();

  clientMessageRouter.route({
    type: 'world:snapshot',
    tiles: [createTowncenterTile('0,0', 0, 0)],
    heroes: [],
    settlers: [],
    tasks: [],
    resources: { wood: 25 },
    storages: [
      {
        tileId: '0,0',
        kind: 'towncenter',
        capacity: 240,
        resources: { wood: 25 },
      },
    ],
    population: {
      current: 0,
      max: 0,
      beds: 0,
      hungerMs: 0,
      supportCapacity: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      pressureState: 'stable',
      settlements: [],
    },
    jobs: {
      availableWorkers: 0,
      assignedWorkers: 0,
      idleWorkers: 0,
      sites: [],
    },
    studies: emptyStudies(),
  });

  assert.equal(resourceInventory.wood, 25);
  assert.equal(getStorageResourceAmount('0,0', 'wood'), 25);

  depositResourceToStorage('0,0', 'wood', 1);

  assert.equal(resourceInventory.wood, 26);
  assert.equal(getStorageResourceAmount('0,0', 'wood'), 26);
});

test('world snapshots advertise when server debug mode is disabled', () => {
  worldHandler.init();

  clientMessageRouter.route({
    type: 'world:snapshot',
    tiles: [],
    heroes: [],
    settlers: [],
    tasks: [],
    resources: {},
    storages: [],
    population: {
      current: 0,
      max: 0,
      beds: 0,
      hungerMs: 0,
      supportCapacity: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      pressureState: 'stable',
      settlements: [],
    },
    jobs: {
      availableWorkers: 0,
      assignedWorkers: 0,
      idleWorkers: 0,
      sites: [],
    },
    studies: emptyStudies(),
    debugModeEnabled: false,
  });

  assert.equal(serverDebugModeEnabled.value, false);
});
