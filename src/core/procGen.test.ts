import test from 'node:test';
import assert from 'node:assert/strict';

import { getTileSpriteKey, getTileType } from './procGen';
import { resolveWorldTile } from './worldGeneration';
import { setWorldGenerationSeed } from './worldVariation';

function eachHexInRadius(radius: number, visit: (q: number, r: number) => void) {
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      visit(q, r);
    }
  }
}

test('title background thins water without changing world generation output', () => {
  setWorldGenerationSeed(123456789);

  let worldWater = 0;
  let titleWater = 0;

  eachHexInRadius(28, (q, r) => {
    const worldTerrainBefore = resolveWorldTile(q, r).terrain;
    if (worldTerrainBefore === 'water') {
      worldWater++;
    }

    if (getTileType(q, r) === 'water') {
      titleWater++;
    }

    assert.equal(resolveWorldTile(q, r).terrain, worldTerrainBefore);
  });

  assert.ok(worldWater > 0);
  assert.ok(titleWater < worldWater * 0.9, `expected title water (${titleWater}) below world water (${worldWater})`);

  setWorldGenerationSeed(123456789);
});

test('title background chooses decorative sprite variants beyond base terrain keys', () => {
  setWorldGenerationSeed(123456789);

  const terrains = new Set<string>();
  const spriteKeys = new Set<string>();

  eachHexInRadius(28, (q, r) => {
    terrains.add(getTileType(q, r));
    spriteKeys.add(getTileSpriteKey(q, r));
  });

  assert.ok(spriteKeys.size > terrains.size * 3, `expected more sprite variety than terrain variety, got ${spriteKeys.size}/${terrains.size}`);
  assert.ok(spriteKeys.has('water_reflections') || spriteKeys.has('water_shallows'));
  assert.ok(spriteKeys.has('plains_meadow') || spriteKeys.has('plains_rock'));

  setWorldGenerationSeed(123456789);
});
