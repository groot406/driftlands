import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import { loadWorld } from '../../../src/shared/game/world.ts';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore.ts';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore.ts';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore.ts';
import { resetStudyState } from '../../../src/store/studyStore.ts';
import { setIo } from '../messages/messageRouter.ts';
import { playerSettlementState } from './playerSettlementState.ts';
import { seasonState } from './seasonState.ts';

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

function loadPopulationForSettlements(settlementIds: string[]) {
  loadPopulationSnapshot({
    current: 0,
    max: 10,
    beds: 0,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: settlementIds.map((settlementId) => ({
      settlementId,
      current: 0,
      max: 10,
      beds: 0,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    })),
  });
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

test('settlement defeat events are exposed on season leaderboard entries', () => {
  setIo({ emit() {} });
  playerSettlementState.registerPlayer('socket-attacker', 'attacker-player', 'Attacker');
  playerSettlementState.registerPlayer('socket-defender', 'defender-player', 'Defender');
  assert.equal(playerSettlementState.assignPlayerSettlement('attacker-player', '0,0'), true);
  assert.equal(playerSettlementState.assignPlayerSettlement('defender-player', '6,0'), true);
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '6,0', q: 6, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  seasonState.initialize(42, 1_000);

  seasonState.recordEvent({
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0', '5,0'],
    defeatedAt: 5_000,
  });

  const defender = seasonState.getSnapshot()?.leaderboard.find((entry) => entry.settlementId === '6,0');
  assert.equal(defender?.defeated, true);
  assert.equal(defender?.defeatedAt, 5_000);
  assert.equal(defender?.defeatedBySettlementId, '0,0');
  assert.equal(defender?.defeatedByPlayerId, 'attacker-player');
  assert.equal(defender?.defeatedByPlayerName, 'Attacker');
  assert.equal(defender?.capturedTownCenterTileId, '6,0');
  assert.equal(defender?.transferredTileCount, 2);
});

test('defeated players cannot issue new season actions while attackers can continue', () => {
  setIo({ emit() {} });
  playerSettlementState.registerPlayer('socket-attacker', 'attacker-player', 'Attacker');
  playerSettlementState.registerPlayer('socket-defender', 'defender-player', 'Defender');
  playerSettlementState.registerPlayer('socket-rival', 'rival-player', 'Rival');
  assert.equal(playerSettlementState.assignPlayerSettlement('attacker-player', '0,0'), true);
  assert.equal(playerSettlementState.assignPlayerSettlement('defender-player', '6,0'), true);
  assert.equal(playerSettlementState.assignPlayerSettlement('rival-player', '12,0'), true);
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '6,0', q: 6, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '12,0', q: 12, r: 0, terrain: 'towncenter', ownerSettlementId: '12,0', controlledBySettlementId: '12,0' }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0', '12,0']);
  seasonState.initialize(42, 1_000);

  assert.equal(seasonState.canPlayerTakeNewActions(null), false);
  assert.equal(seasonState.canPlayerTakeNewActions('attacker-player'), true);
  assert.equal(seasonState.canPlayerTakeNewActions('defender-player'), true);
  assert.equal(seasonState.canPlayerTakeNewActions('rival-player'), true);

  seasonState.recordEvent({
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0'],
    defeatedAt: 5_000,
  });

  assert.equal(seasonState.canPlayerTakeNewActions('attacker-player'), true);
  assert.equal(seasonState.canPlayerTakeNewActions('defender-player'), false);
  assert.equal(seasonState.canPlayerTakeNewActions('rival-player'), true);
});

test('season completes when only one claimed settlement remains undefeated', () => {
  setIo({ emit() {} });
  playerSettlementState.registerPlayer('socket-attacker', 'attacker-player', 'Attacker');
  playerSettlementState.registerPlayer('socket-defender', 'defender-player', 'Defender');
  assert.equal(playerSettlementState.assignPlayerSettlement('attacker-player', '0,0'), true);
  assert.equal(playerSettlementState.assignPlayerSettlement('defender-player', '6,0'), true);
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
    createTile({ id: '6,0', q: 6, r: 0, terrain: 'towncenter', ownerSettlementId: '0,0', controlledBySettlementId: '0,0' }),
  ]);
  loadPopulationForSettlements(['0,0', '6,0']);
  seasonState.initialize(42, 1_000);

  seasonState.recordEvent({
    type: 'military:settlement_defeated',
    defeatedSettlementId: '6,0',
    attackerSettlementId: '0,0',
    capturedTownCenterTileId: '6,0',
    transferredTileIds: ['6,0'],
    defeatedAt: 5_000,
  });

  const snapshot = seasonState.getSnapshot();
  assert.equal(snapshot?.status, 'completed');
  assert.equal(snapshot?.currentStage, 'completed');
  assert.equal(snapshot?.completedAt, 5_000);
  assert.equal(snapshot?.completedReason?.kind, 'last_player_standing');
  assert.equal(snapshot?.completedReason?.playerId, 'attacker-player');
  assert.equal(snapshot?.completedReason?.settlementId, '0,0');
});
