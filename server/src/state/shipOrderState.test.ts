import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore';
import { loadTestModeSettings, resetTestModeSettings } from '../../../src/shared/game/testMode.ts';
import { setIo } from '../messages/messageRouter';
import { FIRST_SHIP_ARRIVAL_MAX_MS, FIRST_SHIP_ARRIVAL_MIN_MS, shipOrderState } from './shipOrderState';

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
    controlledBySettlementId: overrides.controlledBySettlementId ?? '0,0',
    ownerSettlementId: overrides.ownerSettlementId ?? '0,0',
    supportBand: overrides.supportBand ?? 'stable',
    jobSiteEnabled: overrides.jobSiteEnabled ?? null,
  };
}

test.afterEach(() => {
  shipOrderState.reset();
  loadWorld([]);
  resetResourceState();
  resetTestModeSettings();
});

test('unlimited resources allow loading ship cargo without stored warehouse stock', () => {
  const emitted: unknown[] = [];
  setIo({ emit: (_event: string, message: unknown) => emitted.push(message) });

  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_harbor' }),
  ]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: true,
    fastHeroMovement: false,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    fastGuardTraining: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  shipOrderState.tick(1_000);
  const scheduledArrival = shipOrderState.getOverview().nextArrivalAt;
  assert.ok(scheduledArrival);
  assert.equal(shipOrderState.getOverview().activeOrder, null);
  assert.ok(scheduledArrival >= 1_000 + FIRST_SHIP_ARRIVAL_MIN_MS);
  assert.ok(scheduledArrival <= 1_000 + FIRST_SHIP_ARRIVAL_MAX_MS);

  shipOrderState.tick(scheduledArrival);
  const order = shipOrderState.getOverview().activeOrder;
  assert.ok(order);

  const accepted = shipOrderState.contribute({
    settlementId: '0,0',
    playerId: 'player-1',
    playerName: 'Player 1',
    resources: { wood: 5 },
  });

  assert.equal(accepted, true);
  assert.equal(shipOrderState.getOverview().activeOrder?.fulfilled.wood, 5);
  assert.equal(emitted.some((message) => (message as { type?: string }).type === 'resource:withdraw'), false);
});
