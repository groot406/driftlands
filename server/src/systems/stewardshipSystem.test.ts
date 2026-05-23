import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import type { Settler } from '../../../src/shared/game/types/Settler.ts';
import type { BaseMessage } from '../../../src/shared/protocol.ts';
import { loadWorld, tileIndex } from '../../../src/shared/game/world.ts';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime.ts';
import { depositResourceToStorage, resetResourceState } from '../../../src/shared/game/state/resourceStore.ts';
import { loadSettlers, resetSettlerState } from '../../../src/shared/game/state/settlerStore.ts';
import { resetPopulationState } from '../../../src/shared/game/state/populationStore.ts';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore.ts';
import { resolveStewardshipAfterAbsence } from './stewardshipSystem.ts';

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    biome: overrides.biome ?? 'plains',
    terrain: overrides.terrain,
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? !overrides.variant,
    variant: overrides.variant ?? null,
    ownerSettlementId: overrides.ownerSettlementId ?? (overrides.terrain === 'towncenter' ? overrides.id : '0,0'),
    controlledBySettlementId: overrides.controlledBySettlementId ?? (overrides.terrain === 'towncenter' ? overrides.id : '0,0'),
    activationState: overrides.activationState ?? 'active',
    condition: overrides.condition,
    conditionState: overrides.conditionState,
  };
}

function createSettler(id: string, settlementId: string): Settler {
  return {
    id,
    q: 0,
    r: 0,
    facing: 'down',
    appearanceSeed: 1,
    homeTileId: settlementId,
    homeAccessTileId: settlementId,
    settlementId,
    assignedWorkTileId: null,
    assignedRole: null,
    activity: 'idle',
    stateSinceMs: 0,
    hungerMs: 0,
    fatigueMs: 0,
    happiness: 100,
    workProgressMs: 0,
    carryingKind: null,
  };
}

function captureBroadcasts() {
  const messages: BaseMessage[] = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message);
    },
  });
  return messages;
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetSettlerState();
  resetPopulationState();
  resetSettlementSupportState();
  resetGameRuntime();
});

test('offline stewardship repairs damaged buildings using local settlers and materials', () => {
  const messages = captureBroadcasts();
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'forest',
      variant: 'forest_lumber_camp',
      condition: 20,
      conditionState: 'damaged',
    }),
  ]);
  loadSettlers([createSettler('settler-1', '0,0')]);
  depositResourceToStorage('0,0', 'wood', 5);

  const reports = resolveStewardshipAfterAbsence(10 * 60_000, 1_000_000);

  assert.equal(reports.length, 1);
  assert.equal(reports[0]?.settlementId, '0,0');
  assert.equal(reports[0]?.repairedBuildings, 1);
  assert.equal(reports[0]?.repairCycles, 3);
  assert.deepEqual(reports[0]?.resourcesSpent, [{ type: 'wood', amount: 3 }]);
  assert.equal(tileIndex['1,0']?.condition, 100);
  assert.equal(tileIndex['1,0']?.conditionState, 'healthy');
  assert.ok(messages.some((message) => message.type === 'resource:withdraw'));
  assert.ok(messages.some((message) => message.type === 'tile:updated'));
});

test('offline stewardship keeps repairs scoped to each settlement', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '10,0', q: 10, r: 0, terrain: 'towncenter' }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'forest',
      variant: 'forest_lumber_camp',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
      condition: 20,
      conditionState: 'damaged',
    }),
    createTile({
      id: '11,0',
      q: 11,
      r: 0,
      terrain: 'forest',
      variant: 'forest_lumber_camp',
      ownerSettlementId: '10,0',
      controlledBySettlementId: '10,0',
      condition: 20,
      conditionState: 'damaged',
    }),
  ]);
  loadSettlers([createSettler('settler-1', '0,0')]);
  depositResourceToStorage('0,0', 'wood', 5);

  const reports = resolveStewardshipAfterAbsence(10 * 60_000, 1_000_000);
  const firstSettlementReport = reports.find((report) => report.settlementId === '0,0');
  const secondSettlementReport = reports.find((report) => report.settlementId === '10,0');

  assert.equal(firstSettlementReport?.repairedBuildings, 1);
  assert.equal(secondSettlementReport?.repairedBuildings, 0);
  assert.equal(tileIndex['1,0']?.condition, 100);
  assert.equal(tileIndex['11,0']?.condition, 20);
  assert.equal(secondSettlementReport?.remainingDamagedBuildings, 1);
});
