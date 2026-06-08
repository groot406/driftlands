import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile.ts';
import type { BaseMessage } from '../../../src/shared/protocol.ts';
import { loadWorld, tileIndex } from '../../../src/shared/game/world.ts';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime.ts';
import {
  depositResourceToStorage,
  getSettlementResourceInventory,
  resetResourceState,
} from '../../../src/shared/game/state/resourceStore.ts';
import {
  getPopulationSnapshot,
  loadPopulationSnapshot,
  resetPopulationState,
} from '../../../src/shared/game/state/populationStore.ts';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore.ts';
import { setStudyOverrides } from '../../../src/shared/game/state/studyStore.ts';
import { calamitySystem, resetCalamitySystem, triggerCalamity, warnCalamity } from './calamitySystem.ts';

const firstRng = {
  next: () => 0,
  int: (min: number) => min,
};

function captureBroadcasts() {
  const messages: BaseMessage[] = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message);
    },
  });
  return messages;
}

function tile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
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
    modifier: overrides.modifier ?? null,
    modifierRevealed: overrides.modifierRevealed ?? false,
  };
}

function townCenter() {
  return tile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
    ownerSettlementId: '0,0',
    controlledBySettlementId: '0,0',
  });
}

function townCenterAt(id: string, q: number, r: number) {
  return tile({
    id,
    q,
    r,
    terrain: 'towncenter',
    ownerSettlementId: id,
    controlledBySettlementId: id,
  });
}

function loadSettlementPopulation(current: number) {
  loadPopulationSnapshot({
    current,
    max: 15,
    beds: 15,
    hungerMs: 0,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [{
      settlementId: '0,0',
      current,
      max: 15,
      beds: 15,
      hungerMs: 0,
      supportCapacity: 0,
      ownedTileCount: 0,
      activeTileCount: 0,
      inactiveTileCount: 0,
      fragileTileCount: 0,
      uncontrolledTileCount: 0,
      pressureState: 'stable',
    }],
  });
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetPopulationState();
  resetSettlementSupportState();
  setStudyOverrides(null);
  resetGameRuntime();
  resetCalamitySystem(0);
});

test('volcano eruption scorches nearby crops and leaves rich soil behind', () => {
  const messages = captureBroadcasts();
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'vulcano', ownerSettlementId: null, controlledBySettlementId: null }),
    tile({ id: '2,0', q: 2, r: 0, terrain: 'grain', isBaseTile: true }),
    tile({ id: '2,-1', q: 2, r: -1, terrain: 'forest', isBaseTile: true }),
  ]);

  const outcome = triggerCalamity('volcano_eruption', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(outcome?.kind, 'volcano_eruption');
  assert.equal(tileIndex['2,0']?.terrain, 'dirt');
  assert.equal(tileIndex['2,0']?.modifier, 'rich_soil');
  assert.equal(tileIndex['2,-1']?.terrain, 'dirt');
  assert.ok(messages.some((message) => message.type === 'calamity:event'));
});

test('flood hydrates dry plots and washes out roads', () => {
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'water' }),
    tile({ id: '1,-1', q: 1, r: -1, terrain: 'dirt', variant: 'dirt_tilled_draught', isBaseTile: false }),
    tile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'road', isBaseTile: false }),
  ]);

  const outcome = triggerCalamity('flood', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(outcome?.kind, 'flood');
  assert.equal(tileIndex['1,-1']?.variant, 'dirt_tilled_hydrated');
  assert.equal(tileIndex['0,1']?.variant, null);
});

test('lost harvest turns crop fields back into dry tilled dirt', () => {
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'grain', isBaseTile: true }),
    tile({ id: '1,-1', q: 1, r: -1, terrain: 'hops', isBaseTile: true }),
  ]);

  const outcome = triggerCalamity('lost_harvest', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(outcome?.kind, 'lost_harvest');
  assert.equal(tileIndex['1,0']?.terrain, 'dirt');
  assert.equal(tileIndex['1,0']?.variant, 'dirt_tilled_draught');
});

test('food spoilage withdraws stored meal resources', () => {
  loadWorld([townCenter()]);
  depositResourceToStorage('0,0', 'meat', 20);
  depositResourceToStorage('0,0', 'bread', 10);

  const outcome = triggerCalamity('food_spoilage', { settlementId: '0,0', rng: firstRng, now: 10_000 });
  const inventory = getSettlementResourceInventory('0,0');

  assert.equal(outcome?.kind, 'food_spoilage');
  assert.equal(inventory.meat, 15);
  assert.equal(inventory.bread, 7);
  assert.deepEqual(outcome?.resourceLosses, [
    { type: 'meat', amount: 5 },
    { type: 'bread', amount: 3 },
  ]);
});

test('forest fire scars forest tiles without removing the terrain', () => {
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'forest', isBaseTile: true }),
    tile({ id: '1,-1', q: 1, r: -1, terrain: 'forest', isBaseTile: true }),
  ]);

  const outcome = triggerCalamity('forest_fire', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(outcome?.kind, 'forest_fire');
  assert.equal(tileIndex['1,0']?.terrain, 'forest');
  assert.equal(tileIndex['1,0']?.variant, 'chopped_forest');
});

test('outbreak drops settlement population', () => {
  loadWorld([townCenter()]);
  loadSettlementPopulation(6);

  const outcome = triggerCalamity('outbreak', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(outcome?.kind, 'outbreak');
  assert.equal(outcome?.populationLoss, 2);
  assert.equal(getPopulationSnapshot().current, 4);
  assert.equal(getPopulationSnapshot().settlements[0]?.current, 4);
});

test('warning broadcasts before delayed impact', () => {
  const messages = captureBroadcasts();
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'water' }),
    tile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'road', isBaseTile: false }),
  ]);

  const pending = warnCalamity('flood', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(pending.kind, 'flood');
  assert.equal(pending.impactAt - 10_000, 180_000);
  assert.equal(messages.at(-1)?.type, 'calamity:event');
  assert.equal((messages.at(-1) as any).phase, 'warning');
  assert.equal(tileIndex['0,1']?.variant, 'road');

  calamitySystem.tick({
    now: pending.impactAt,
    dt: 180_000,
    tick: 1,
    rng: firstRng as never,
  });

  assert.equal(tileIndex['0,1']?.variant, null);
  assert.ok(messages.some((message) => message.type === 'calamity:event' && (message as any).phase === 'impact'));
});

test('automatic calamity roll warns all discovered settlements for the same impact time', () => {
  const messages = captureBroadcasts();
  resetCalamitySystem(0);
  const firstAutomaticRollAt = 12 * 60_000;
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'water' }),
    tile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'road', isBaseTile: false }),
    townCenterAt('5,0', 5, 0),
    tile({ id: '6,0', q: 6, r: 0, terrain: 'water', ownerSettlementId: '5,0', controlledBySettlementId: '5,0' }),
    tile({ id: '5,1', q: 5, r: 1, terrain: 'plains', variant: 'road', isBaseTile: false, ownerSettlementId: '5,0', controlledBySettlementId: '5,0' }),
  ]);

  calamitySystem.tick({
    now: firstAutomaticRollAt,
    dt: 1_000,
    tick: 1,
    rng: firstRng as never,
  });

  const warnings = messages.filter((message) => (
    message.type === 'calamity:event'
    && (message as any).phase === 'warning'
  ));
  assert.equal(warnings.length, 2);
  assert.deepEqual(warnings.map((message) => (message as any).settlementId).sort(), ['0,0', '5,0']);
  assert.equal(new Set(warnings.map((message) => (message as any).impactAt)).size, 1);
  assert.equal((warnings[0] as any).impactAt - firstAutomaticRollAt, 180_000);

  calamitySystem.tick({
    now: firstAutomaticRollAt + 3 * 60_000,
    dt: 180_000,
    tick: 2,
    rng: firstRng as never,
  });

  assert.equal(tileIndex['0,1']?.variant, null);
  assert.equal(tileIndex['5,1']?.variant, null);
});

test('automatic calamity roll warns a settlement once when it has multiple town centers', () => {
  const messages = captureBroadcasts();
  resetCalamitySystem(0);
  const firstAutomaticRollAt = 12 * 60_000;
  loadWorld([
    townCenter(),
    tile({
      id: '5,0',
      q: 5,
      r: 0,
      terrain: 'towncenter',
      ownerSettlementId: '0,0',
      controlledBySettlementId: '0,0',
    }),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'water' }),
    tile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'road', isBaseTile: false }),
  ]);

  calamitySystem.tick({
    now: firstAutomaticRollAt,
    dt: 1_000,
    tick: 1,
    rng: firstRng as never,
  });

  const warnings = messages.filter((message) => (
    message.type === 'calamity:event'
    && (message as any).phase === 'warning'
  ));
  assert.equal(warnings.length, 1);
  assert.equal((warnings[0] as any).settlementId, '0,0');
});

test('flood control reduces road washout during impact', () => {
  loadWorld([
    townCenter(),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'water' }),
    tile({ id: '0,1', q: 0, r: 1, terrain: 'plains', variant: 'road', isBaseTile: false }),
    tile({ id: '1,-1', q: 1, r: -1, terrain: 'plains', variant: 'road_ad', isBaseTile: false }),
    tile({ id: '2,-1', q: 2, r: -1, terrain: 'plains', variant: 'plains_well', isBaseTile: false }),
  ]);

  triggerCalamity('flood', { settlementId: '0,0', rng: firstRng, now: 10_000, targetTileId: '1,0' });

  const washedRoads = ['0,1', '1,-1'].filter((tileId) => tileIndex[tileId]?.variant === null);
  assert.equal(washedRoads.length, 1);
});

test('field medicine contains outbreak before population drops', () => {
  loadWorld([townCenter()]);
  loadSettlementPopulation(6);
  setStudyOverrides(['field_medicine'], '0,0');

  const outcome = triggerCalamity('outbreak', { settlementId: '0,0', rng: firstRng, now: 10_000 });

  assert.equal(outcome?.phase, 'averted');
  assert.equal(outcome?.populationLoss, 0);
  assert.equal(getPopulationSnapshot().current, 6);
});
