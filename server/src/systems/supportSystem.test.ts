import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../src/shared/game/types/Hero';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { loadHeroes } from '../../../src/shared/game/state/heroStore';
import { loadPopulationSnapshot, resetPopulationState } from '../../../src/shared/game/state/populationStore';
import { resetResourceState } from '../../../src/shared/game/state/resourceStore';
import { resetSettlementSupportState } from '../../../src/shared/game/state/settlementSupportStore';
import { loadWorld, tileIndex } from '../../../src/shared/game/world';
import { resetWorkforceState } from '../../../src/shared/game/state/jobStore';
import { supportSystem } from './supportSystem';

function createTile(overrides: Partial<Tile> & Pick<Tile, 'id' | 'q' | 'r' | 'terrain'>): Tile {
  return {
    id: overrides.id,
    q: overrides.q,
    r: overrides.r,
    biome: overrides.biome ?? 'plains',
    terrain: overrides.terrain,
    discovered: overrides.discovered ?? true,
    isBaseTile: overrides.isBaseTile ?? true,
    variant: overrides.variant ?? null,
    activationState: overrides.activationState ?? 'active',
    controlledBySettlementId: overrides.controlledBySettlementId ?? '0,0',
    ownerSettlementId: overrides.ownerSettlementId ?? '0,0',
    supportBand: overrides.supportBand ?? 'stable',
  };
}

function loadPopulation(current: number, beds: number, hungerMs: number = 0) {
  loadPopulationSnapshot({
    current,
    max: Math.max(current, beds, 10),
    beds,
    hungerMs,
    supportCapacity: 0,
    activeTileCount: 0,
    inactiveTileCount: 0,
    pressureState: 'stable',
    settlements: [],
  });
}

function tickAt(now: number) {
  supportSystem.tick({
    now,
    dt: 1_000,
    tick: Math.floor(now / 1_000),
    rng: {} as never,
  });
}

function createControlledFrontierTiles(count: number): Tile[] {
  const tiles: Tile[] = [];
  const coords: Array<{ q: number; r: number; dist: number }> = [];

  for (let q = -9; q <= 9; q++) {
    for (let r = Math.max(-9, -q - 9); r <= Math.min(9, -q + 9); r++) {
      if (q === 0 && r === 0) {
        continue;
      }

      const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      coords.push({ q, r, dist });
    }
  }

  coords.sort((a, b) => {
    if (a.dist !== b.dist) {
      return a.dist - b.dist;
    }

    return `${a.q},${a.r}`.localeCompare(`${b.q},${b.r}`);
  });

  for (const coord of coords.slice(0, count)) {
    tiles.push(createTile({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      terrain: 'plains',
    }));
  }

  return tiles;
}

test.afterEach(() => {
  loadWorld([]);
  loadHeroes([]);
  resetResourceState();
  resetPopulationState();
  resetSettlementSupportState();
  resetWorkforceState();
  resetGameRuntime();
});

test('support system does not reroute heroes standing on controlled offline tiles', () => {
  const frontierTiles = createControlledFrontierTiles(85);
  const townCenter = createTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
  });

  loadWorld([townCenter, ...frontierTiles]);
  loadPopulation(0, 0);

  const offlineTile = frontierTiles[frontierTiles.length - 1]!;
  const moveCalls: Array<{ q: number; r: number }> = [];
  configureGameRuntime({
    moveHero: (_hero, target) => {
      moveCalls.push(target);
    },
  });

  loadHeroes([
    {
      id: 'hero-1',
      name: 'Scout',
      avatar: 'santa',
      q: offlineTile.q,
      r: offlineTile.r,
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
    } satisfies Hero,
  ]);

  tickAt(1_000);

  assert.equal(tileIndex[offlineTile.id]?.controlledBySettlementId, '0,0');
  assert.equal(tileIndex[offlineTile.id]?.activationState, 'inactive');
  assert.deepEqual(moveCalls, []);
});
