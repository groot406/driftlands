import assert from 'node:assert/strict';
import test from 'node:test';

import type { Tile } from '../../core/types/Tile';
import {
  isRenderableExplorationTile,
  isScoutingFrontierTile,
  isVisibleExplorationTile,
} from './explorationFrontier';

function tile(id: string, discovered = false, scouted = false): Tile {
  return {
    id,
    q: Number(id.split(',')[0] ?? 0),
    r: Number(id.split(',')[1] ?? 0),
    biome: null,
    terrain: discovered ? 'plains' : null,
    discovered,
    scouted,
    isBaseTile: true,
    variant: null,
  };
}

test('render visibility skips scout routing frontier tiles', () => {
  const scouted = tile('0,0', false, true);
  const hiddenNeighbor = tile('1,0');

  hiddenNeighbor.neighbors = {
    a: scouted,
    b: scouted,
    c: scouted,
    d: scouted,
    e: scouted,
    f: scouted,
  };

  assert.equal(isScoutingFrontierTile(hiddenNeighbor), true);
  assert.equal(isVisibleExplorationTile(hiddenNeighbor), true);
  assert.equal(isRenderableExplorationTile(hiddenNeighbor), false);
});

test('render visibility still includes discovered, scouted, and discovered-frontier tiles', () => {
  const discovered = tile('0,0', true);
  const scouted = tile('1,0', false, true);
  const hiddenNeighbor = tile('2,0');

  hiddenNeighbor.neighbors = {
    a: discovered,
    b: discovered,
    c: discovered,
    d: discovered,
    e: discovered,
    f: discovered,
  };

  assert.equal(isRenderableExplorationTile(discovered), true);
  assert.equal(isRenderableExplorationTile(scouted), true);
  assert.equal(isRenderableExplorationTile(hiddenNeighbor), true);
});

