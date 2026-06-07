import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { depositResourceToStorage, resetResourceState } from '../../../src/shared/game/state/resourceStore';
import { listResolvedJobSites, resolveJobResources, resolveSiteStatus } from './jobSiteRuntime';
import { resetStudyState } from '../../../src/store/studyStore';

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
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
    supportBand: overrides.supportBand ?? 'stable',
    jobSiteEnabled: overrides.jobSiteEnabled ?? null,
  };
}

test.afterEach(() => {
  loadWorld([]);
  resetResourceState();
  resetStudyState();
});

test('quarry sites resolve into infinite stone-producing job sites', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'mountain', biome: 'mountains', variant: 'mountains_with_quarry' }),
    createTile({ id: '1,1', q: 1, r: 1, terrain: 'mountain', biome: 'mountains' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'mountain', biome: 'mountains' }),
  ]);

  const quarrySite = listResolvedJobSites().find((site) => site.tile.id === '1,0');

  assert.equal(quarrySite?.building.key, 'quarry');

  const resources = quarrySite ? resolveJobResources(quarrySite, 1) : null;
  assert.deepEqual(resources?.consumes ?? [], []);
  assert.deepEqual(resources?.produces, [{ type: 'stone', amount: 4 }]);
});

test('active adjacent volcanoes increase nearby job-site output', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'mountain', biome: 'mountain', variant: 'mountains_with_quarry' }),
    createTile({ id: '1,1', q: 1, r: 1, terrain: 'mountain', biome: 'mountain' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'mountain', biome: 'mountain' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'vulcano', biome: 'mountain', isBaseTile: true }),
  ]);

  const quarrySite = listResolvedJobSites().find((site) => site.tile.id === '1,0');

  assert.equal(quarrySite?.building.key, 'quarry');

  const resources = quarrySite ? resolveJobResources(quarrySite, 1) : null;
  assert.deepEqual(resources?.produces, [{ type: 'stone', amount: 5 }]);
});

test('field winery resolves into durable grape-to-wine production', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'grapes', variant: 'grapes_winery', isBaseTile: false }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'grapes' }),
    createTile({ id: '1,1', q: 1, r: 1, terrain: 'grapes' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'grapes' }),
  ]);

  const winerySite = listResolvedJobSites().find((site) => site.tile.id === '1,0');

  assert.equal(winerySite?.building.key, 'winery');

  const resources = winerySite ? resolveJobResources(winerySite, 1) : null;
  assert.deepEqual(resources?.consumes, []);
  assert.deepEqual(resources?.produces, [{ type: 'wine', amount: 6 }]);
});

test('field brewery turns grain and connected hops into durable beer production', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'hops', variant: 'hops_brewery', isBaseTile: false }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'hops' }),
    createTile({ id: '1,1', q: 1, r: 1, terrain: 'hops' }),
    createTile({ id: '0,1', q: 0, r: 1, terrain: 'hops' }),
  ]);
  depositResourceToStorage('0,0', 'grain', 1);

  const brewerySite = listResolvedJobSites().find((site) => site.tile.id === '1,0');
  const resources = brewerySite ? resolveJobResources(brewerySite, 1) : null;

  assert.equal(brewerySite?.building.key, 'brewery');
  assert.deepEqual(resources?.consumes, [{ type: 'grain', amount: 1 }]);
  assert.deepEqual(resources?.produces, [{ type: 'beer', amount: 12 }]);
  assert.equal(brewerySite ? resolveSiteStatus(brewerySite, 1) : null, 'staffed');
});

test('legacy brewery and winery variants still resolve as minimum-output job sites', () => {
  loadWorld([
    createTile({ id: '0,0', q: 0, r: 0, terrain: 'towncenter' }),
    createTile({ id: '1,0', q: 1, r: 0, terrain: 'plains', variant: 'plains_brewery' }),
    createTile({ id: '2,0', q: 2, r: 0, terrain: 'plains', variant: 'plains_winery' }),
  ]);

  const brewerySite = listResolvedJobSites().find((site) => site.tile.id === '1,0');
  const winerySite = listResolvedJobSites().find((site) => site.tile.id === '2,0');

  assert.equal(brewerySite?.building.key, 'brewery');
  assert.deepEqual(brewerySite ? resolveJobResources(brewerySite, 1) : null, {
    consumes: [{ type: 'grain', amount: 1 }],
    produces: [{ type: 'beer', amount: 6 }],
  });
  assert.equal(winerySite?.building.key, 'winery');
  assert.deepEqual(winerySite ? resolveJobResources(winerySite, 1) : null, {
    consumes: [],
    produces: [{ type: 'wine', amount: 3 }],
  });
});
