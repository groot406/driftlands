import test from 'node:test';
import assert from 'node:assert/strict';

import { applyBiomeModifiers, detectBiome } from './biomes';
import { weightedTerrainChoice } from './terrain';
import type { TerrainKey } from './terrainDefs';
import { resolveWorldTile } from './worldGeneration';
import { setWorldGenerationSeed } from './worldVariation';
import { discoverTile, ensureTileExists, startWorldGeneration, tileIndex } from './world';

const HEX_NEIGHBOR_DELTAS: Array<[number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

function withSeededRandom<T>(seed: number, run: () => T): T {
  const original = Math.random;
  let state = seed >>> 0;

  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function buildWeights(): Record<TerrainKey, number> {
  return {
    towncenter: 0,
    plains: 30,
    forest: 26,
    water: 20,
    mountain: 12,
    dirt: 16,
    snow: 10,
    dessert: 9,
    vulcano: 4,
    grain: 14,
  };
}

test('detectBiome picks the strongest matching regional signal instead of the first match', () => {
  const nearby: TerrainKey[] = [
    'water', 'water', 'water', 'water', 'water', 'water', 'water', 'water', 'water', 'water',
    'plains', 'plains', 'plains', 'plains', 'plains', 'plains',
    'forest', 'dirt',
  ];

  assert.equal(detectBiome(nearby), 'lake');
});

test('applyBiomeModifiers keeps transition terrain possible instead of hard-zeroing it', () => {
  const original = buildWeights();
  const adjusted = applyBiomeModifiers('lake', { ...original });

  assert.ok(adjusted.water > original.water);
  assert.ok(adjusted.plains > original.plains);
  assert.ok(adjusted.mountain > 0);
  assert.ok(adjusted.mountain < original.mountain);
});

test('weightedTerrainChoice strongly favors the dominant nearby terrain cluster', () => {
  const picks: Partial<Record<TerrainKey, number>> = {};

  withSeededRandom(0xdecafbad, () => {
    for (let i = 0; i < 400; i++) {
      const terrain = weightedTerrainChoice(
        ['forest', 'forest', 'forest', 'forest', 'plains', 'dirt'],
        ['forest', 'forest', 'forest', 'forest', 'forest', 'forest', 'forest', 'plains', 'plains', 'dirt', 'water', 'forest'],
      ).terrain;
      picks[terrain] = (picks[terrain] ?? 0) + 1;
    }
  });

  assert.ok((picks.forest ?? 0) > 200);
  assert.ok((picks.forest ?? 0) > (picks.plains ?? 0));
  assert.ok((picks.water ?? 0) < 20);
});

test('resolveWorldTile keeps the opening ring free of hard blocker biomes', () => {
  const blocked = new Set<TerrainKey>(['water', 'mountain', 'snow', 'dessert', 'vulcano']);

  for (let q = -2; q <= 2; q++) {
    for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
      const tile = resolveWorldTile(q, r);
      assert.equal(blocked.has(tile.terrain), false, `unexpected ${tile.terrain} at ${q},${r}`);
    }
  }
});

test('discovering the same far tiles in a different order resolves to the same biome map', () => {
  const targets: Array<[number, number]> = [
    [8, 0],
    [8, -1],
    [7, 1],
    [10, -3],
    [-9, 4],
    [-7, 6],
    [12, -7],
    [5, 9],
  ];

  function reveal(coords: Array<[number, number]>) {
    startWorldGeneration(0);
    const snapshot: Record<string, { terrain: TerrainKey | null; biome: string | null }> = {};

    for (const [q, r] of coords) {
      const tile = ensureTileExists(q, r);
      discoverTile(tile);
      snapshot[tile.id] = {
        terrain: tileIndex[tile.id]?.terrain ?? null,
        biome: tileIndex[tile.id]?.biome ?? null,
      };
    }

    return snapshot;
  }

  const forward = reveal(targets);
  const reverse = reveal(targets.slice().reverse());
  assert.deepEqual(forward, reverse);
});

test('discoverTile uses the settlement origin for terrain generation when settlement ownership is provided', () => {
  startWorldGeneration(0, 42);
  const settlementId = '20,0';
  const settlementTile = ensureTileExists(20, 0);
  settlementTile.discovered = true;
  settlementTile.terrain = 'towncenter';
  settlementTile.biome = 'plains';
  settlementTile.ownerSettlementId = settlementId;
  settlementTile.controlledBySettlementId = settlementId;
  tileIndex[settlementId] = settlementTile;

  let target: { q: number; r: number } | null = null;
  for (let radius = 1; radius <= 18 && !target; radius++) {
    for (let q = 20 - radius; q <= 20 + radius && !target; q++) {
      for (let r = -radius; r <= radius; r++) {
        const localDistance = Math.max(Math.abs(q - 20), Math.abs(r), Math.abs((q - 20) + r));
        if (localDistance !== radius) {
          continue;
        }

        const settlementTerrain = resolveWorldTile(q, r, { q: 20, r: 0 }).terrain;
        const localTerrain = resolveWorldTile(q, r, { q, r }).terrain;
        if (settlementTerrain !== localTerrain) {
          target = { q, r };
          break;
        }
      }
    }
  }

  assert.ok(target, 'expected an origin-sensitive tile');

  const tile = ensureTileExists(target.q, target.r);
  discoverTile(tile, { q: target.q, r: target.r, settlementId });

  assert.equal(tile.terrain, resolveWorldTile(target.q, target.r, { q: 20, r: 0 }).terrain);
});

test('neighboring tiles mostly stay inside the same biome family', () => {
  const deltas: Array<[number, number]> = [
    [1, 0],
    [1, -1],
    [0, -1],
  ];
  let totalPairs = 0;
  let sameBiomePairs = 0;

  for (let q = -16; q <= 16; q++) {
    for (let r = Math.max(-16, -q - 16); r <= Math.min(16, -q + 16); r++) {
      const current = resolveWorldTile(q, r);
      for (const [dq, dr] of deltas) {
        const neighbor = resolveWorldTile(q + dq, r + dr);
        totalPairs++;
        if (current.biome === neighbor.biome) {
          sameBiomePairs++;
        }
      }
    }
  }

  assert.ok(totalPairs > 0);
  assert.ok((sameBiomePairs / totalPairs) > 0.6);
});

test('world generation produces multiple terrain families across a wider frontier band', () => {
  const terrainCounts = new Map<TerrainKey, number>();
  const biomeCounts = new Map<string, number>();
  const innerCounts = new Map<TerrainKey, number>();
  const earlyCounts = new Map<TerrainKey, number>();

  for (let q = -30; q <= 30; q++) {
    for (let r = Math.max(-30, -q - 30); r <= Math.min(30, -q + 30); r++) {
      const tile = resolveWorldTile(q, r);
      terrainCounts.set(tile.terrain, (terrainCounts.get(tile.terrain) ?? 0) + 1);
      biomeCounts.set(tile.biome, (biomeCounts.get(tile.biome) ?? 0) + 1);
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 4) {
        earlyCounts.set(tile.terrain, (earlyCounts.get(tile.terrain) ?? 0) + 1);
      }
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 12) {
        innerCounts.set(tile.terrain, (innerCounts.get(tile.terrain) ?? 0) + 1);
      }
    }
  }

  assert.ok((terrainCounts.get('plains') ?? 0) > 0);
  assert.ok((terrainCounts.get('forest') ?? 0) > 0);
  assert.ok((terrainCounts.get('water') ?? 0) > 0);
  assert.ok(terrainCounts.size >= 6);
  assert.ok(biomeCounts.size >= 5);
  assert.ok((earlyCounts.get('forest') ?? 0) > 0);
  assert.ok((innerCounts.get('plains') ?? 0) > (innerCounts.get('mountain') ?? 0));
  assert.ok(((innerCounts.get('plains') ?? 0) + (innerCounts.get('forest') ?? 0) + (innerCounts.get('dirt') ?? 0)) > (innerCounts.get('water') ?? 0));
});

test('representative seeds favor land over water in the early world', () => {
  const seeds = [1, 7, 42, 99, 123456789, 987654321, 20260405, 0xdecafbad];

  for (const seed of seeds) {
    setWorldGenerationSeed(seed);
    let waterCount = 0;
    let total = 0;

    for (let q = -30; q <= 30; q++) {
      for (let r = Math.max(-30, -q - 30); r <= Math.min(30, -q + 30); r++) {
        total++;
        if (resolveWorldTile(q, r).terrain === 'water') {
          waterCount++;
        }
      }
    }

    const waterRatio = waterCount / Math.max(total, 1);
    assert.ok(waterRatio < 0.35, `expected less water-heavy generation for seed ${seed}, got ratio ${waterRatio.toFixed(3)}`);
  }

  setWorldGenerationSeed(123456789);
});

test('the first four rings always include some forest across representative seeds', () => {
  const seeds = [1, 7, 42, 99, 123456789, 987654321, 20260405, 0xdecafbad];

  for (const seed of seeds) {
    setWorldGenerationSeed(seed);
    let forestCount = 0;

    for (let q = -4; q <= 4; q++) {
      for (let r = Math.max(-4, -q - 4); r <= Math.min(4, -q + 4); r++) {
        const tile = resolveWorldTile(q, r);
        if (tile.terrain === 'forest') {
          forestCount++;
        }
      }
    }

    assert.ok(forestCount > 0, `expected early forest for seed ${seed}`);
  }

  setWorldGenerationSeed(123456789);
});

test('the early frontier always includes a small pond with plains shoreline across representative seeds', () => {
  const seeds = [1, 7, 42, 99, 123456789, 987654321, 20260405, 0xdecafbad];

  for (const seed of seeds) {
    setWorldGenerationSeed(seed);
    const waterTiles = new Set<string>();
    const visited = new Set<string>();
    const coords = new Map<string, { q: number; r: number }>();

    for (let q = -8; q <= 8; q++) {
      for (let r = Math.max(-8, -q - 8); r <= Math.min(8, -q + 8); r++) {
        const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
        if (distance < 5 || distance > 8) {
          continue;
        }

        const tile = resolveWorldTile(q, r);
        if (tile.terrain !== 'water') {
          continue;
        }

        const key = `${q},${r}`;
        waterTiles.add(key);
        coords.set(key, { q, r });
      }
    }

    let foundEarlyPond = false;

    for (const key of waterTiles) {
      if (visited.has(key)) {
        continue;
      }

      const queue = [key];
      const component: string[] = [];
      visited.add(key);

      while (queue.length) {
        const currentKey = queue.shift()!;
        component.push(currentKey);
        const current = coords.get(currentKey)!;

        for (const [dq, dr] of HEX_NEIGHBOR_DELTAS) {
          const neighborKey = `${current.q + dq},${current.r + dr}`;
          if (!waterTiles.has(neighborKey) || visited.has(neighborKey)) {
            continue;
          }
          visited.add(neighborKey);
          queue.push(neighborKey);
        }
      }

      let plainsShorelineEdges = 0;
      for (const componentKey of component) {
        const current = coords.get(componentKey)!;
        for (const [dq, dr] of HEX_NEIGHBOR_DELTAS) {
          const neighbor = resolveWorldTile(current.q + dq, current.r + dr);
          if (neighbor.terrain === 'plains') {
            plainsShorelineEdges++;
          }
        }
      }

      if (component.length >= 3 && component.length <= 6 && plainsShorelineEdges >= 6) {
        foundEarlyPond = true;
        break;
      }
    }

    assert.ok(foundEarlyPond, `expected an early pond shoreline for seed ${seed}`);
  }

  setWorldGenerationSeed(123456789);
});

test('harsh frontier terrain includes snow and rare volcanoes across representative seeds', () => {
  const seeds = [1, 7, 42, 99, 123456789, 987654321, 20260405, 0xdecafbad];

  for (const seed of seeds) {
    setWorldGenerationSeed(seed);
    let snowCount = 0;
    let volcanoCount = 0;

    for (let q = -20; q <= 20; q++) {
      for (let r = Math.max(-20, -q - 20); r <= Math.min(20, -q + 20); r++) {
        const tile = resolveWorldTile(q, r);
        if (tile.terrain === 'snow') {
          snowCount++;
        } else if (tile.terrain === 'vulcano') {
          volcanoCount++;
        }
      }
    }

    assert.ok(snowCount > 0, `expected snow within radius 20 for seed ${seed}`);
    assert.ok(volcanoCount > 0, `expected volcano within radius 20 for seed ${seed}`);
  }

  setWorldGenerationSeed(123456789);
});
