import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import { loadWorld, tileIndex } from '../../../src/shared/game/world.ts';
import { resetPopulationState } from '../../../src/shared/game/state/populationStore.ts';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore.ts';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore.ts';
import { resetStudyState } from '../../../src/store/studyStore.ts';
import { ensureBarracksMilitaryState } from '../../../src/shared/game/military.ts';
import { createDefaultSeasonConfig } from '../../../src/shared/seasons/types.ts';
import { setIo } from '../messages/messageRouter.ts';
import { playerSettlementState } from '../state/playerSettlementState.ts';
import { seasonState } from '../state/seasonState.ts';
import { ServerMilitaryHandler } from './militaryHandler.ts';

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    ...overrides,
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    biome: overrides.biome ?? 'plains',
    terrain: overrides.terrain,
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    variant: overrides.variant ?? null,
    activationState: overrides.activationState ?? 'active',
    controlledBySettlementId: overrides.controlledBySettlementId ?? overrides.id,
    ownerSettlementId: overrides.ownerSettlementId ?? overrides.id,
    supportBand: overrides.supportBand ?? 'stable',
    jobSiteEnabled: overrides.jobSiteEnabled ?? null,
  };
}

test.afterEach(() => {
  setIo({ emit() {} });
  seasonState.loadPersistenceSnapshot(null);
  playerSettlementState.reset();
  loadWorld([]);
  resetPopulationState();
  resetResourceState();
  resetWorkforceState();
  resetStudyState();
});

test('defeated players cannot queue guard training', () => {
  setIo({ emit() {} });
  playerSettlementState.registerPlayer('socket-attacker', 'attacker-player', 'Attacker');
  playerSettlementState.registerPlayer('socket-defender', 'defender-player', 'Defender');
  assert.equal(playerSettlementState.assignPlayerSettlement('attacker-player', '0,0'), true);
  assert.equal(playerSettlementState.assignPlayerSettlement('defender-player', '6,0'), true);
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '6,0', q: 6, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({
      id: '6,1',
      q: 6,
      r: 1,
      terrain: 'plains',
      variant: 'plains_barracks',
      ownerSettlementId: '6,0',
      controlledBySettlementId: '6,0',
    }),
  ]);
  seasonState.initialize(42, 1_000);
  seasonState.recordEvent({
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0'],
    defeatedAt: 5_000,
  });

  const barracks = ensureBarracksMilitaryState(tileIndex['6,1']);
  assert.ok(barracks);
  const handler = new ServerMilitaryHandler({} as never);

  (handler as any).handleQueueGuardTraining({ id: 'socket-defender' }, {
    type: 'military:queue_guard_training',
    barracksTileId: '6,1',
    quantity: 1,
  });

  assert.equal(barracks.barracksTrainingQueue, 0);
});

test('assigning guards carries barracks origins from reserve to the tower', () => {
  setIo({ emit() {} });
  playerSettlementState.registerPlayer('socket-player', 'player-1', 'Player');
  assert.equal(playerSettlementState.assignPlayerSettlement('player-1', '0,0'), true);
  seasonState.initialize(42, 1_000);
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
      guardReserve: 0,
    }),
    createTile({
      id: '2,0',
      q: 2,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
      towerAssignedGuards: 0,
    }),
    createTile({
      id: '3,0',
      q: 3,
      r: 0,
      terrain: 'plains',
      variant: 'plains_barracks',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
      guardReserve: 1,
    }),
  ]);

  const handler = new ServerMilitaryHandler({} as never);
  (handler as any).handleAssignGuards({ id: 'socket-player' }, {
    type: 'military:assign_guards',
    tileId: '2,0',
    delta: 1,
  });

  assert.equal(tileIndex['0,0']?.guardReserve ?? 0, 0);
  assert.equal(tileIndex['3,0']?.guardReserve ?? 0, 0);
  assert.equal(tileIndex['2,0']?.towerAssignedGuards ?? 0, 1);
  assert.deepEqual(tileIndex['2,0']?.towerGuardOriginTileIds ?? [], ['3,0']);
});

test('town center raids cannot start while a defender watchtower stands within 15 tiles', () => {
  setIo({ emit() {} });
  playerSettlementState.registerPlayer('socket-player', 'player-1', 'Player');
  assert.equal(playerSettlementState.assignPlayerSettlement('player-1', '0,0'), true);
  const config = createDefaultSeasonConfig();
  config.stages[0]!.borderPolicy = 'locked_open';
  seasonState.initialize(42, 1_000, config);
  loadWorld([
    createTile({
      id: '0,0',
      q: 0,
      r: 0,
      terrain: 'towncenter',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
      borderMode: 'open',
    }),
    createTile({
      id: '1,0',
      q: 1,
      r: 0,
      terrain: 'plains',
      variant: 'plains_barracks',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
      guardReserve: 1,
    }),
    createTile({
      id: '20,0',
      q: 20,
      r: 0,
      terrain: 'towncenter',
      ownerSettlementId: '20,0',
      controlledBySettlementId: '20,0',
      borderMode: 'open',
    }),
    createTile({
      id: '25,0',
      q: 25,
      r: 0,
      terrain: 'plains',
      variant: 'plains_watchtower',
      ownerSettlementId: '20,0',
      controlledBySettlementId: '20,0',
    }),
  ]);

  const handler = new ServerMilitaryHandler({} as never);
  (handler as any).handleSetRaidTarget({ id: 'socket-player' }, {
    type: 'military:set_raid_target',
    settlementId: '0,0',
    targetTileId: '20,0',
  });

  assert.equal(tileIndex['0,0']?.raidTargetTileId ?? null, null);
  assert.equal(tileIndex['1,0']?.guardReserve ?? 0, 1);
  assert.equal(tileIndex['20,0']?.towerAttackerSettlementId ?? null, null);
});
