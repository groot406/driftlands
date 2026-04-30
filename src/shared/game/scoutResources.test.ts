import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../core/types/Hero';
import type { ScoutTargetType } from '../../core/types/Scout';
import { SIDE_NAMES, type Terrain, type Tile, type TileSide } from '../../core/types/Tile';
import { resolveWorldTile } from '../../core/worldGeneration';
import { configureGameRuntime, resetGameRuntime } from './runtime';
import { ensureTileExists, loadWorld, resolveGeneratedTileVariant, startWorldGeneration, tileIndex } from './world';
import { isTileScoutWalkable, isTileWalkable } from './navigation';
import { PathService } from './PathService';
import {
  doesScoutResourceMatchTerrain,
  doesScoutResourceMatchTileForSettlement,
  getScoutSurveyMs,
  handleScoutResourceArrival,
  pickNextScoutTile,
  SCOUT_RESOURCE_TASK_TYPE,
  SCOUTABLE_RESOURCE_TYPES,
} from './scoutResources';

const SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
  a: [0, -1],
  b: [1, -1],
  c: [1, 0],
  d: [0, 1],
  e: [-1, 1],
  f: [-1, 0],
};

function createHero(q: number, r: number, resourceType: ScoutTargetType): Hero {
  return {
    id: 'hero-scout',
    name: 'Scout',
    avatar: 'santa',
    q,
    r,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
    scoutResourceIntent: { resourceType, playerId: 'player-1', playerName: 'Tester' },
  };
}

function findHiddenGeneratedTile(predicate: (terrain: Terrain) => boolean) {
  for (let radius = 2; radius <= 10; radius++) {
    for (let q = -radius; q <= radius; q++) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
        const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        if (distance !== radius) {
          continue;
        }

        const generated = resolveWorldTile(q, r);
        if (predicate(generated.terrain)) {
          return ensureTileExists(q, r);
        }
      }
    }
  }

  throw new Error('Unable to find generated tile for scout resource test.');
}

function findHiddenGeneratedTileWithVariant(predicate: (terrain: Terrain, variant: string | null) => boolean) {
  for (let radius = 2; radius <= 18; radius++) {
    for (let q = -radius; q <= radius; q++) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
        const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        if (distance !== radius) {
          continue;
        }

        const tile = ensureTileExists(q, r);
        const generated = resolveWorldTile(q, r);
        const variant = resolveGeneratedTileVariant(tile, generated.terrain);
        if (predicate(generated.terrain, variant)) {
          return tile;
        }
      }
    }
  }

  throw new Error('Unable to find generated variant tile for scout resource test.');
}

function findOriginSensitiveTile(
  origin: { q: number; r: number },
  predicate: (originTerrain: Terrain, defaultTerrain: Terrain) => boolean,
) {
  for (let radius = 2; radius <= 18; radius++) {
    for (let q = origin.q - radius; q <= origin.q + radius; q++) {
      for (let r = origin.r - radius; r <= origin.r + radius; r++) {
        const localDistance = Math.max(Math.abs(q - origin.q), Math.abs(r - origin.r), Math.abs((q - origin.q) + (r - origin.r)));
        if (localDistance !== radius) {
          continue;
        }

        const originTerrain = resolveWorldTile(q, r, origin).terrain;
        const defaultTerrain = resolveWorldTile(q, r).terrain;
        if (predicate(originTerrain, defaultTerrain)) {
          return ensureTileExists(q, r);
        }
      }
    }
  }

  throw new Error('Unable to find origin-sensitive scout tile.');
}

function findNonMatchingResource(terrain: Terrain) {
  const resourceType = SCOUTABLE_RESOURCE_TYPES.find((candidate) => !doesScoutResourceMatchTerrain(candidate, terrain));
  assert.ok(resourceType);
  return resourceType;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function axialDistanceToOrigin(q: number, r: number) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function markScoutedReturnCorridorToOrigin(tile: Tile) {
  let q = tile.q;
  let r = tile.r;

  while (q !== 0 || r !== 0) {
    const next = Object.values(SIDE_DELTAS)
      .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
      .sort((a, b) => axialDistanceToOrigin(a.q, a.r) - axialDistanceToOrigin(b.q, b.r))[0];

    assert.ok(next);
    const nextTile = ensureTileExists(next.q, next.r);
    if (!nextTile.discovered) {
      nextTile.scouted = true;
    }

    q = next.q;
    r = next.r;
  }
}

test.afterEach(() => {
  loadWorld([]);
  resetGameRuntime();
});

test('scouting a non-matching hidden tile marks it scouted without revealing terrain and chains onward', async () => {
  startWorldGeneration(1, 4242);
  const tile = findHiddenGeneratedTile(() => true);
  const generated = resolveWorldTile(tile.q, tile.r);
  const resourceType = findNonMatchingResource(generated.terrain);
  const hero = createHero(tile.q, tile.r, resourceType);
  const broadcasts: any[] = [];
  const moves: Array<{ q: number; r: number; task?: string; options?: { allowScouted?: boolean } }> = [];

  configureGameRuntime({
    broadcast: (message) => broadcasts.push(message),
    moveHero: (_hero, target, task, _taskLocation, options) => moves.push({ q: target.q, r: target.r, task, options }),
  });

  handleScoutResourceArrival(hero, tile);

  assert.equal(tile.scouted, undefined);
  assert.equal(moves.length, 0);

  await wait(getScoutSurveyMs(hero) + 20);

  assert.equal(tile.discovered, false);
  assert.equal(tile.terrain, null);
  assert.equal(tile.scouted, true);
  assert.equal(tile.scoutedForResource, resourceType);
  assert.ok(tile.scoutedResourceTypes?.includes(resourceType));
  assert.equal(isTileWalkable(tile), false);
  assert.equal(isTileScoutWalkable(tile), true);

  for (const side of SIDE_NAMES) {
    const [dq, dr] = SIDE_DELTAS[side];
    assert.ok(tileIndex[`${tile.q + dq},${tile.r + dr}`], `expected neighbor ${side} to exist`);
  }

  assert.equal(hero.scoutResourceIntent?.resourceType, resourceType);
  assert.equal(moves[0]?.task, SCOUT_RESOURCE_TASK_TYPE);
  assert.ok(broadcasts.some((message) => message.type === 'tile:updated' && message.tile.id === tile.id));
});

test('scouted hidden tiles are only walkable for scout routing', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'towncenter',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      scoutedForResource: 'wood',
      scoutedResourceTypes: ['wood'],
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
    {
      id: '2,0',
      q: 2,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);

  const pathService = new PathService();
  const scoutedTile = tileIndex['1,0']!;

  assert.equal(isTileWalkable(scoutedTile), false);
  assert.equal(isTileScoutWalkable(scoutedTile), true);
  assert.deepEqual(pathService.findWalkablePath(0, 0, 2, 0), []);
  assert.deepEqual(pathService.findWalkablePath(0, 0, 2, 0, { allowScouted: true }), [
    { q: 1, r: 0 },
    { q: 2, r: 0 },
  ]);
});

test('stale scout arrivals on hidden tiles return the hero to known walkable ground', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);

  const hero: Hero = {
    id: 'hero-scout',
    name: 'Scout',
    avatar: 'santa',
    q: 1,
    r: 0,
    stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
    facing: 'down',
  };
  const moves: Array<{ q: number; r: number; task?: string; options?: { allowScouted?: boolean } }> = [];

  configureGameRuntime({
    moveHero: (_hero, target, task, _taskLocation, options) => moves.push({ q: target.q, r: target.r, task, options }),
  });

  handleScoutResourceArrival(hero, tileIndex['1,0']!);

  assert.equal(hero.scoutResourceIntent, undefined);
  assert.deepEqual(moves, [{ q: 0, r: 0, task: undefined, options: { allowScouted: true } }]);
});

test('settlement-scoped scout matching uses the settlement origin for hidden tiles', () => {
  startWorldGeneration(1, 42);
  loadWorld([
    {
      id: '20,0',
      q: 20,
      r: 0,
      biome: 'plains',
      terrain: 'towncenter',
      discovered: true,
      isBaseTile: true,
      variant: null,
      ownerSettlementId: '20,0',
      controlledBySettlementId: '20,0',
    } satisfies Tile,
  ]);

  const tile = findOriginSensitiveTile({ q: 20, r: 0 }, (originTerrain, defaultTerrain) => originTerrain === 'water' && defaultTerrain !== 'water');

  assert.equal(doesScoutResourceMatchTileForSettlement('water', tile, '20,0'), true);
});

test('scouting a matching hidden tile pings the find, stops the scout intent, and returns home', async () => {
  startWorldGeneration(1, 8675309);
  const resourceType: ScoutTargetType = 'wood';
  const tile = findHiddenGeneratedTile((terrain) => doesScoutResourceMatchTerrain(resourceType, terrain));
  const hero = createHero(tile.q, tile.r, resourceType);
  const broadcasts: any[] = [];
  const moves: Array<{ q: number; r: number; task?: string; options?: { allowScouted?: boolean } }> = [];

  configureGameRuntime({
    broadcast: (message) => broadcasts.push(message),
    moveHero: (_hero, target, task, _taskLocation, options) => moves.push({ q: target.q, r: target.r, task, options }),
  });

  markScoutedReturnCorridorToOrigin(tile);
  handleScoutResourceArrival(hero, tile);

  assert.equal(tile.scouted, undefined);

  await wait(getScoutSurveyMs(hero) + 20);

  assert.equal(tile.discovered, false);
  assert.equal(tile.terrain, null);
  assert.equal(tile.scouted, true);
  assert.equal(tile.scoutFoundResource, resourceType);
  assert.equal(hero.scoutResourceIntent, undefined);
  assert.deepEqual(moves[0], { q: 0, r: 0, task: undefined, options: { allowScouted: true } });
  assert.ok(broadcasts.some((message) => message.type === 'coop:ping' && message.ping.label === 'Found Forest'));
});

test('scouting for rocks matches generated dirt rocks instead of mountains', async () => {
  startWorldGeneration(1, 202404);
  const resourceType: ScoutTargetType = 'stone';
  const tile = findHiddenGeneratedTileWithVariant((terrain, variant) => terrain === 'dirt' && variant === 'dirt_rocks');
  const hero = createHero(tile.q, tile.r, resourceType);
  const broadcasts: any[] = [];
  const moves: Array<{ q: number; r: number; task?: string; options?: { allowScouted?: boolean } }> = [];

  configureGameRuntime({
    broadcast: (message) => broadcasts.push(message),
    moveHero: (_hero, target, task, _taskLocation, options) => moves.push({ q: target.q, r: target.r, task, options }),
  });

  markScoutedReturnCorridorToOrigin(tile);
  handleScoutResourceArrival(hero, tile);

  await wait(getScoutSurveyMs(hero) + 20);

  assert.equal(tile.discovered, false);
  assert.equal(tile.terrain, null);
  assert.equal(tile.scouted, true);
  assert.equal(tile.scoutFoundResource, resourceType);
  assert.equal(hero.scoutResourceIntent, undefined);
  assert.deepEqual(moves[0], { q: 0, r: 0, task: undefined, options: { allowScouted: true } });
  assert.ok(broadcasts.some((message) => message.type === 'coop:ping' && message.ping.label === 'Found Rocks'));
});

test('scout target selection chooses a random reachable local neighbor instead of the nearest one', () => {
  loadWorld([
    {
      id: '0,0',
      q: 0,
      r: 0,
      biome: 'plains',
      terrain: 'towncenter',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
    {
      id: '1,0',
      q: 1,
      r: 0,
      biome: 'plains',
      terrain: null,
      discovered: false,
      scouted: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);

  const hero = createHero(1, 0, 'wood');
  const originalRandom = Math.random;
  Math.random = () => 0.6;

  try {
    const selected = pickNextScoutTile(hero, 'wood');
    assert.ok(selected);
    assert.deepEqual({ q: selected.q, r: selected.r }, { q: 1, r: 1 });
  } finally {
    Math.random = originalRandom;
  }
});

test('scout target selection clears the closest town-center ring before pushing outward', () => {
  startWorldGeneration(1, 13579);
  const closeTile = ensureTileExists(2, 0);
  const farTile = ensureTileExists(4, 0);
  const hero = createHero(0, 0, 'wood');
  closeTile.scouted = undefined;
  farTile.scouted = undefined;

  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    const selected = pickNextScoutTile(hero, 'wood');
    assert.ok(selected);
    const selectedDistance = Math.max(Math.abs(selected.q), Math.abs(selected.r), Math.abs(selected.q + selected.r));
    assert.equal(selectedDistance, 2);
    assert.notEqual(selected.id, farTile.id);
    assert.ok(closeTile);
  } finally {
    Math.random = originalRandom;
  }
});
