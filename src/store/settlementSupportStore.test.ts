import test from 'node:test';
import assert from 'node:assert/strict';

import type { Tile } from '../core/types/Tile.ts';
import { loadWorld, tileIndex } from '../core/world.ts';
import { recalculateSettlementSupport, resetSettlementSupportState } from './settlementSupportStore.ts';

function createTowncenterTile(): Tile {
  return {
    id: '0,0',
    q: 0,
    r: 0,
    biome: 'plains',
    terrain: 'towncenter',
    discovered: true,
    isBaseTile: true,
    activationState: 'active',
    variant: null,
  };
}

function createFrontierTiles(count: number): Tile[] {
  const tiles: Tile[] = [];

  for (let q = -8; q <= 8; q++) {
    for (let r = Math.max(-8, -q - 8); r <= Math.min(8, -q + 8); r++) {
      if (q === 0 && r === 0) {
        continue;
      }

      tiles.push({
        id: `${q},${r}`,
        q,
        r,
        biome: 'plains',
        terrain: 'plains',
        discovered: true,
        isBaseTile: true,
        activationState: 'active',
        variant: null,
      });

      if (tiles.length >= count) {
        return tiles;
      }
    }
  }

  return tiles;
}

function createSortedFrontierCoords(reserved: Set<string> = new Set()) {
  const coords: Array<{ q: number; r: number; dist: number }> = [];

  for (let q = -8; q <= 10; q++) {
    for (let r = Math.max(-10, -q - 10); r <= Math.min(10, -q + 10); r++) {
      const id = `${q},${r}`;
      if ((q === 0 && r === 0) || reserved.has(id)) {
        continue;
      }

      coords.push({
        q,
        r,
        dist: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)),
      });
    }
  }

  coords.sort((a, b) => {
    if (a.dist !== b.dist) {
      return a.dist - b.dist;
    }

    return `${a.q},${a.r}`.localeCompare(`${b.q},${b.r}`);
  });

  return coords;
}

test.afterEach(() => {
  loadWorld([]);
  resetSettlementSupportState();
});

test('a fully housed starter town can sustain a 100-tile frontier push', () => {
  loadWorld([createTowncenterTile()]);

  const result = recalculateSettlementSupport(10, 0);

  assert.ok(result.snapshot.supportCapacity >= 150);
});

test('inactive tiles automatically restore once support rises again', () => {
  loadWorld([
    createTowncenterTile(),
    ...createFrontierTiles(85),
  ]);

  const strained = recalculateSettlementSupport(0, 0);

  assert.equal(strained.snapshot.inactiveTileCount, 1);
  assert.equal(strained.newlyInactiveTileIds.length, 1);

  const restoredTileId = strained.newlyInactiveTileIds[0]!;
  const recovered = recalculateSettlementSupport(1, 0);

  assert.equal(recovered.snapshot.inactiveTileCount, 0);
  assert.deepEqual(recovered.newlyActiveTileIds, [restoredTileId]);
  assert.deepEqual(recovered.restoredTileIds, [restoredTileId]);
});

test('campfires temporarily keep nearby controlled frontier tiles online beyond base support capacity', () => {
  const reserved = new Set(['8,0', '8,-1']);
  const frontier: Tile[] = [];
  const coords = createSortedFrontierCoords(reserved);

  for (const coord of coords.slice(0, 83)) {
    frontier.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    });
  }

  loadWorld([
    createTowncenterTile(),
    ...frontier,
    {
      id: '8,0',
      q: 8,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'plains_campfire',
    } satisfies Tile,
    {
      id: '8,-1',
      q: 8,
      r: -1,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
  ]);

  const result = recalculateSettlementSupport(0, 0);

  assert.equal(result.snapshot.supportCapacity, 85);
  assert.equal(result.snapshot.activeTileCount, 85);
  assert.equal(tileIndex['8,-1']?.activationState, 'active');
});

test('road networks chain support into neighboring frontier tiles beyond base reach', () => {
  const reserved = new Set(['8,0', '9,0', '10,0']);
  const frontier: Tile[] = [];
  const coords = createSortedFrontierCoords(reserved);

  for (const coord of coords.slice(0, 83)) {
    frontier.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    });
  }

  loadWorld([
    createTowncenterTile(),
    ...frontier,
    {
      id: '8,0',
      q: 8,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'road',
    } satisfies Tile,
    {
      id: '9,0',
      q: 9,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'road',
    } satisfies Tile,
    {
      id: '10,0',
      q: 10,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
  ]);

  const result = recalculateSettlementSupport(0, 0);

  assert.equal(result.snapshot.supportCapacity, 86);
  assert.equal(result.snapshot.activeTileCount, 86);
  assert.equal(tileIndex['9,0']?.activationState, 'active');
  assert.equal(tileIndex['10,0']?.activationState, 'active');
  assert.equal(tileIndex['10,0']?.controlledBySettlementId, '0,0');
});

test('bridges keep adjacent shore tiles active beyond town-center reach', () => {
  const reserved = new Set(['9,0', '10,0']);
  const frontier: Tile[] = [];
  const coords = createSortedFrontierCoords(reserved);

  for (const coord of coords.slice(0, 83)) {
    frontier.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    });
  }

  loadWorld([
    createTowncenterTile(),
    ...frontier,
    {
      id: '9,0',
      q: 9,
      r: 0,
      biome: 'lake',
      terrain: 'water',
      discovered: true,
      isBaseTile: false,
      activationState: 'active',
      variant: 'water_bridge_cf',
    } satisfies Tile,
    {
      id: '10,0',
      q: 10,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      activationState: 'active',
      variant: null,
    } satisfies Tile,
  ]);

  const result = recalculateSettlementSupport(0, 0);

  assert.equal(result.snapshot.supportCapacity, 85);
  assert.equal(result.snapshot.activeTileCount, 85);
  assert.equal(tileIndex['10,0']?.activationState, 'active');
  assert.equal(tileIndex['10,0']?.controlledBySettlementId, '0,0');
});
