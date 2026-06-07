import test from 'node:test';
import assert from 'node:assert/strict';

import type { BuildingDefinition } from '../../../src/shared/buildings/registry';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import { maintainJobSiteFields } from './fieldWork';
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
  { buildingKey: 'granary', siteVariant: 'grain_granary', terrain: 'grain', plantedVariant: 'grain_planted' },
  { buildingKey: 'brewery', siteVariant: 'hops_brewery', terrain: 'hops', plantedVariant: 'hops_planted' },
  { buildingKey: 'winery', siteVariant: 'grapes_winery', terrain: 'grapes', plantedVariant: 'grapes_planted' },
] as const) {
  test(`${scenario.buildingKey} field work harvests and replants mature neighboring ${scenario.terrain}`, () => {
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

    assert.equal(maintainJobSiteFields(site), true);

    assert.equal(tileIndex['1,0']?.terrain, scenario.terrain);
    assert.equal(tileIndex['1,0']?.variant, scenario.plantedVariant);
    assert.equal(tileIndex['1,0']?.isBaseTile, false);
  });
}
