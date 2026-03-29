import assert from 'node:assert/strict';
import test from 'node:test';

import { isProceduralRoadVariant, isRoadConnectionTarget, isRoadTile } from './roads';

test('roads connect to adjacent roads and town centers', () => {
  assert.equal(isProceduralRoadVariant('road'), true);
  assert.equal(isProceduralRoadVariant('road_ad'), true);
  assert.equal(isProceduralRoadVariant('plains_watchtower'), false);

  assert.equal(isRoadTile({ terrain: 'plains', variant: 'road' } as any), true);
  assert.equal(isRoadTile({ terrain: 'towncenter', variant: null } as any), false);

  assert.equal(isRoadConnectionTarget({ terrain: 'plains', variant: 'road' } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'towncenter', variant: null } as any), true);
  assert.equal(isRoadConnectionTarget({ terrain: 'plains', variant: null } as any), false);
});
