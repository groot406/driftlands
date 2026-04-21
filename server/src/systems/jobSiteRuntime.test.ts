import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../../../src/shared/game/types/Tile';
import { loadWorld } from '../../../src/shared/game/world';
import { listResolvedJobSites, resolveJobResources } from './jobSiteRuntime';
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
  assert.deepEqual(resources?.produces, [{ type: 'stone', amount: 3 }]);
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
  assert.deepEqual(resources?.produces, [{ type: 'stone', amount: 3.75 }]);
});
