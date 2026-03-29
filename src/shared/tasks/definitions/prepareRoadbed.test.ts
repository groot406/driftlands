import assert from 'node:assert/strict';
import test from 'node:test';

import { terrainPositions } from '../../../core/terrainRegistry';
import { getTaskDefinition } from '../taskRegistry';
import './prepareRoadbed';

test('prepareRoadbed starts on rough dirt but not on active dirt improvements', () => {
  const definition = getTaskDefinition('prepareRoadbed');

  assert.ok(definition);
  assert.equal(
    definition?.canStart(
      {
        id: 'rough-dirt',
        q: 0,
        r: 1,
        biome: null,
        terrain: 'dirt',
        discovered: true,
        variant: 'dirt_rocks',
      } as any,
      {
        carryingPayload: undefined,
      } as any,
    ),
    true,
  );
  assert.equal(
    definition?.canStart(
      {
        id: 'tilled-dirt',
        q: 0,
        r: 2,
        biome: null,
        terrain: 'dirt',
        discovered: true,
        variant: 'dirt_tilled',
      } as any,
      {
        carryingPayload: undefined,
      } as any,
    ),
    false,
  );
});

test('prepareRoadbed converts dirt into plains for road placement', () => {
  const definition = getTaskDefinition('prepareRoadbed');
  const tileId = 'prepared-roadbed-test';
  const tile = {
    id: tileId,
    q: 2,
    r: -1,
    biome: null,
    terrain: 'dirt',
    discovered: true,
    variant: 'dirt_big_rock',
    variantSetMs: Date.now(),
    variantAgeMs: 1234,
  } as any;

  terrainPositions.dirt.add(tileId);
  terrainPositions.plains.delete(tileId);

  try {
    definition?.onComplete?.(tile, {} as any, []);

    assert.equal(tile.terrain, 'plains');
    assert.equal(tile.variant, null);
    assert.equal(tile.variantSetMs, undefined);
    assert.equal(tile.variantAgeMs, undefined);
    assert.ok(terrainPositions.plains.has(tileId));
    assert.ok(!terrainPositions.dirt.has(tileId));
  } finally {
    terrainPositions.dirt.delete(tileId);
    terrainPositions.plains.delete(tileId);
  }
});
