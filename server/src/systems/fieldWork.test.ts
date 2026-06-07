import test from 'node:test';
import assert from 'node:assert/strict';

import type { BuildingDefinition } from '../../../src/shared/buildings/registry';
import type { ResourceType } from '../../../src/shared/game/types/Resource';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import {
  AGRICULTURAL_FIELD_SUBTASK_MS,
  chooseAgriculturalFieldAction,
  completeAgriculturalFieldAction,
  getAgriculturalProcessInputs,
  getAgriculturalProcessOutput,
} from './fieldWork';
import type { ResolvedJobSite } from './jobSiteRuntime';

function tile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
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
  };
}

test.afterEach(() => {
  loadWorld([]);
});

for (const scenario of [
  {
    buildingKey: 'granary',
    siteVariant: 'grain_granary',
    terrain: 'grain',
    plantedVariant: 'grain_planted',
    resourceType: 'grain',
    harvestAmount: 3,
  },
  {
    buildingKey: 'brewery',
    siteVariant: 'hops_brewery',
    terrain: 'hops',
    plantedVariant: 'hops_planted',
    resourceType: 'hops',
    harvestAmount: 2,
  },
  {
    buildingKey: 'winery',
    siteVariant: 'grapes_winery',
    terrain: 'grapes',
    plantedVariant: 'grapes_planted',
    resourceType: 'grapes',
    harvestAmount: 2,
  },
] as const) {
  test(`${scenario.buildingKey} field work completes one crop phase at a time`, () => {
    loadWorld([
      tile({ id: '0,0', q: 0, r: 0, terrain: scenario.terrain, variant: scenario.siteVariant, isBaseTile: false }),
      tile({ id: '1,0', q: 1, r: 0, terrain: scenario.terrain, isBaseTile: true }),
      tile({ id: '4,0', q: 4, r: 0, terrain: 'plains', variant: 'plains_well', isBaseTile: false }),
    ]);
    const site: ResolvedJobSite = {
      tile: tileIndex['0,0']!,
      building: { key: scenario.buildingKey } as BuildingDefinition,
      slots: 1,
    };

    const harvest = chooseAgriculturalFieldAction(site);
    assert.deepEqual(harvest, {
      phase: 'harvest',
      fieldTileId: '1,0',
      durationMs: AGRICULTURAL_FIELD_SUBTASK_MS,
    });

    const harvestCompletion = completeAgriculturalFieldAction(site, harvest!);
    assert.equal(harvestCompletion.changed, true);
    assert.deepEqual(harvestCompletion.harvested, {
      type: scenario.resourceType as ResourceType,
      amount: scenario.harvestAmount,
    });
    assert.equal(tileIndex['1,0']?.terrain, 'dirt');
    assert.equal(tileIndex['1,0']?.variant, null);

    const prepare = chooseAgriculturalFieldAction(site);
    assert.deepEqual(prepare, {
      phase: 'prepare_land',
      fieldTileId: '1,0',
      durationMs: AGRICULTURAL_FIELD_SUBTASK_MS,
    });

    const prepareCompletion = completeAgriculturalFieldAction(site, prepare!);
    assert.equal(prepareCompletion.changed, true);
    assert.equal(tileIndex['1,0']?.terrain, 'dirt');
    assert.equal(tileIndex['1,0']?.variant, 'dirt_tilled_hydrated');

    const seed = chooseAgriculturalFieldAction(site);
    assert.deepEqual(seed, {
      phase: 'seed',
      fieldTileId: '1,0',
      durationMs: AGRICULTURAL_FIELD_SUBTASK_MS,
    });

    const seedCompletion = completeAgriculturalFieldAction(site, seed!);
    assert.equal(seedCompletion.changed, true);
    assert.equal(tileIndex['1,0']?.terrain, scenario.terrain);
    assert.equal(tileIndex['1,0']?.variant, scenario.plantedVariant);
    assert.equal(tileIndex['1,0']?.isBaseTile, false);
  });

  test(`${scenario.buildingKey} workers irrigate dry prepared fields without nearby water`, () => {
    loadWorld([
      tile({ id: '0,0', q: 0, r: 0, terrain: scenario.terrain, variant: scenario.siteVariant, isBaseTile: false }),
      tile({ id: '1,0', q: 1, r: 0, terrain: 'dirt', variant: 'dirt_tilled_draught', isBaseTile: false }),
    ]);
    const site: ResolvedJobSite = {
      tile: tileIndex['0,0']!,
      building: { key: scenario.buildingKey } as BuildingDefinition,
      slots: 1,
    };

    const irrigate = chooseAgriculturalFieldAction(site);
    assert.deepEqual(irrigate, {
      phase: 'irrigate',
      fieldTileId: '1,0',
      durationMs: AGRICULTURAL_FIELD_SUBTASK_MS,
    });

    const completion = completeAgriculturalFieldAction(site, irrigate!);
    assert.equal(completion.changed, true);
    assert.equal(tileIndex['1,0']?.terrain, 'dirt');
    assert.equal(tileIndex['1,0']?.variant, 'dirt_tilled');
  });
}

test('brewery and winery processing consumes stored harvest batches', () => {
  loadWorld([
    tile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    tile({ id: '1,0', q: 1, r: 0, terrain: 'hops', variant: 'hops_brewery', isBaseTile: false }),
    tile({ id: '2,0', q: 2, r: 0, terrain: 'hops' }),
    tile({ id: '3,0', q: 3, r: 0, terrain: 'grapes', variant: 'grapes_winery', isBaseTile: false }),
    tile({ id: '4,0', q: 4, r: 0, terrain: 'grapes' }),
  ]);
  const brewery: ResolvedJobSite = {
    tile: tileIndex['1,0']!,
    building: { key: 'brewery' } as BuildingDefinition,
    slots: 1,
  };
  const winery: ResolvedJobSite = {
    tile: tileIndex['3,0']!,
    building: { key: 'winery' } as BuildingDefinition,
    slots: 1,
  };

  assert.deepEqual(getAgriculturalProcessInputs(brewery), [
    { type: 'grain', amount: 1 },
    { type: 'hops', amount: 2 },
  ]);
  assert.deepEqual(getAgriculturalProcessOutput(brewery), { type: 'beer', amount: 4 });
  assert.deepEqual(getAgriculturalProcessInputs(winery), [{ type: 'grapes', amount: 2 }]);
  assert.deepEqual(getAgriculturalProcessOutput(winery), { type: 'wine', amount: 2 });
});
