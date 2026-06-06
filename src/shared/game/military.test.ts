import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile.ts';
import { isWatchtowerTile, shouldOpenTownCenterRaidDetail, shouldUseStandaloneMilitaryDetailMode } from './military.ts';

test('foreign town centers should open the raid target detail instead of the settlement overview', () => {
  const foreignTownCenter = {
    id: '10,4',
    terrain: 'towncenter',
  } satisfies Pick<Tile, 'id' | 'terrain'>;

  assert.equal(shouldOpenTownCenterRaidDetail(foreignTownCenter, '2,2'), true);
  assert.equal(shouldOpenTownCenterRaidDetail(foreignTownCenter, '10,4'), false);
  assert.equal(shouldOpenTownCenterRaidDetail(foreignTownCenter, null), false);
});

test('town centers use the full town-center panel when opening raid details', () => {
  assert.equal(shouldUseStandaloneMilitaryDetailMode({ terrain: 'towncenter' } satisfies Pick<Tile, 'terrain'>), false);
  assert.equal(shouldUseStandaloneMilitaryDetailMode({ terrain: 'plains', variant: 'plains_watchtower' } satisfies Pick<Tile, 'terrain' | 'variant'>), true);
});

test('water beacons count as watchtower-class military tiles', () => {
  assert.equal(isWatchtowerTile({ terrain: 'water', variant: 'water_beacon' } as Tile), true);
  assert.equal(shouldUseStandaloneMilitaryDetailMode({ terrain: 'water', variant: 'water_beacon' } satisfies Pick<Tile, 'terrain' | 'variant'>), true);
});
