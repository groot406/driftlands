import test from 'node:test';
import assert from 'node:assert/strict';

import { growthSystem } from './growthSystem';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import { applyVariant } from '../../../src/core/variants';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import type { BaseMessage } from '../../../src/shared/protocol';
import type { Tile } from '../../../src/shared/game/types/Tile';

function withCapturedBroadcasts() {
  const messages: BaseMessage[] = [];
  configureGameRuntime({
    broadcast: (message) => {
      messages.push(message);
    },
  });
  return messages;
}

test.afterEach(() => {
  loadWorld([]);
  resetGameRuntime();
});

test('growthSystem keeps ranged growth duration stable across ticks and matures young forest', () => {
  loadWorld([
    {
      id: 'growth-forest',
      q: 1,
      r: 0,
      biome: 'forest',
      terrain: 'forest',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);

  const tile = tileIndex['growth-forest']!;
  const broadcasts = withCapturedBroadcasts();

  applyVariant(tile, 'young_forest', { stagger: false, respectBiome: true });

  assert.equal(tile.variant, 'young_forest');
  assert.equal(typeof tile.variantSetMs, 'number');
  assert.equal(typeof tile.variantAgeMs, 'number');
  assert.ok(tile.variantAgeMs! >= 480000);
  assert.ok(tile.variantAgeMs! <= 4800000);

  broadcasts.length = 0;

  growthSystem.tick({
    now: tile.variantSetMs! + tile.variantAgeMs! - 1,
    dt: tile.variantAgeMs! - 1,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(tile.variant, 'young_forest');
  assert.equal(broadcasts.length, 0);

  growthSystem.tick({
    now: tile.variantSetMs! + tile.variantAgeMs!,
    dt: 1,
    tick: 2,
    rng: {} as never,
  });

  assert.equal(tile.variant, null);
  assert.equal(tile.variantSetMs, undefined);
  assert.equal(tile.variantAgeMs, undefined);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0]?.type, 'tile:updated');
});

test('growthSystem advances fixed-duration tilled soil into draught state', () => {
  loadWorld([
    {
      id: 'growth-dirt',
      q: 2,
      r: 0,
      biome: 'dessert',
      terrain: 'dirt',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);

  const tile = tileIndex['growth-dirt']!;
  withCapturedBroadcasts();

  applyVariant(tile, 'dirt_tilled', { stagger: false, respectBiome: true });

  assert.equal(tile.variant, 'dirt_tilled');
  assert.equal(tile.variantAgeMs, 180000);

  growthSystem.tick({
    now: tile.variantSetMs! + tile.variantAgeMs!,
    dt: tile.variantAgeMs!,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(tile.variant, 'dirt_tilled_draught');
  assert.equal(tile.variantSetMs, undefined);
  assert.equal(tile.variantAgeMs, undefined);
});

test('growthSystem lets campfires burn out after their timed support window', () => {
  loadWorld([
    {
      id: 'growth-campfire',
      q: 3,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);

  const tile = tileIndex['growth-campfire']!;
  withCapturedBroadcasts();

  applyVariant(tile, 'plains_campfire', { stagger: false, respectBiome: false });

  assert.equal(tile.variant, 'plains_campfire');
  assert.equal(tile.variantAgeMs, 300000);

  growthSystem.tick({
    now: tile.variantSetMs! + tile.variantAgeMs!,
    dt: tile.variantAgeMs!,
    tick: 1,
    rng: {} as never,
  });

  assert.equal(tile.variant, null);
  assert.equal(tile.variantSetMs, undefined);
  assert.equal(tile.variantAgeMs, undefined);
});
