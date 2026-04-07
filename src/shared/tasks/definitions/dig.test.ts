import assert from 'node:assert/strict';
import test from 'node:test';

import { terrainPositions } from '../../../core/terrainRegistry';
import { getTaskDefinition } from '../taskRegistry';
import './dig';

test('dig starts on plains', () => {
  const definition = getTaskDefinition('dig');

  assert.ok(definition);
  assert.equal(
    definition?.canStart(
      {
        id: 'plains-tile',
        q: 0,
        r: 1,
        biome: null,
        terrain: 'plains',
        isBaseTile: true,
        discovered: true,
        variant: null,
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
        id: 'dirt-tile',
        q: 0,
        r: 2,
        biome: null,
        terrain: 'dirt',
        isBaseTile: true,
        discovered: true,
        variant: null,
      } as any,
      {
        carryingPayload: undefined,
      } as any,
    ),
    false,
  );
});

test('dig converts plains into dirt', () => {
  const definition = getTaskDefinition('dig');
  const tileId = 'dig-test';
  const tile = {
    id: tileId,
    q: 2,
    r: -1,
    biome: null,
    terrain: 'plains',
    isBaseTile: true,
    discovered: true,
    variant: 'plains_flower',
    variantSetMs: Date.now(),
    variantAgeMs: 1234,
  } as any;

  terrainPositions.plains.add(tileId);
  terrainPositions.dirt.delete(tileId);
  const originalRandom = Math.random;
  Math.random = () => 1;

  try {
    definition?.onComplete?.(tile, {} as any, []);

    assert.equal(tile.terrain, 'dirt');
    assert.equal(tile.variant, null);
    assert.equal(tile.variantSetMs, undefined);
    assert.equal(tile.variantAgeMs, undefined);
    assert.ok(terrainPositions.dirt.has(tileId));
    assert.ok(!terrainPositions.plains.has(tileId));
  } finally {
    Math.random = originalRandom;
    terrainPositions.dirt.delete(tileId);
    terrainPositions.plains.delete(tileId);
  }
});
