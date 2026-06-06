import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../../../src/shared/game/types/Hero';
import type { Tile } from '../../../src/shared/game/types/Tile';
import { configureGameRuntime, resetGameRuntime } from '../../../src/shared/game/runtime';
import { heroes, loadHeroes } from '../../../src/shared/game/state/heroStore';
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
  supportSystem.init();
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

test('support system sends heroes on enemy controlled ground back to their own town center', () => {
  const playerTownCenter = createTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
    ownerSettlementId: '0,0',
    controlledBySettlementId: '0,0',
  });
  const enemyTownCenter = createTile({
    id: '10,0',
    q: 10,
    r: 0,
    terrain: 'towncenter',
    ownerSettlementId: '10,0',
    controlledBySettlementId: '10,0',
  });
  const capturedTile = createTile({
    id: '2,0',
    q: 2,
    r: 0,
    terrain: 'plains',
    ownerSettlementId: '0,0',
    controlledBySettlementId: '0,0',
  });

  loadWorld([playerTownCenter, enemyTownCenter, capturedTile]);
  loadPopulation(1, 1);

  const moveCalls: Array<{ heroId: string; q: number; r: number; ignoreTerritoryRestrictions?: boolean }> = [];
  configureGameRuntime({
    moveHero: (hero, target, _task, _taskLocation, options) => {
      moveCalls.push({
        heroId: hero.id,
        q: target.q,
        r: target.r,
        ignoreTerritoryRestrictions: options?.ignoreTerritoryRestrictions,
      });
    },
  });

  loadHeroes([
    {
      id: 'hero-1',
      name: 'Scout',
      avatar: 'santa',
      q: capturedTile.q,
      r: capturedTile.r,
      settlementId: '10,0',
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
    } satisfies Hero,
  ]);

  tickAt(1_000);

  assert.deepEqual(moveCalls, [
    {
      heroId: 'hero-1',
      q: 10,
      r: 0,
      ignoreTerritoryRestrictions: true,
    },
  ]);
});

test('support system lets heroes cross enemy controlled paths toward owned ground', () => {
  const playerTownCenter = createTile({
    id: '0,0',
    q: 0,
    r: 0,
    terrain: 'towncenter',
    ownerSettlementId: '0,0',
    controlledBySettlementId: '0,0',
  });
  const enemyTile = createTile({
    id: '1,0',
    q: 1,
    r: 0,
    terrain: 'plains',
    ownerSettlementId: 'enemy',
    controlledBySettlementId: 'enemy',
  });
  const separatedOwnedTile = createTile({
    id: '2,0',
    q: 2,
    r: 0,
    terrain: 'plains',
    ownerSettlementId: '0,0',
    controlledBySettlementId: '0,0',
  });

  loadWorld([playerTownCenter, enemyTile, separatedOwnedTile]);
  loadPopulation(1, 1);

  const moveCalls: Array<{ heroId: string; q: number; r: number }> = [];
  configureGameRuntime({
    moveHero: (hero, target) => {
      moveCalls.push({
        heroId: hero.id,
        q: target.q,
        r: target.r,
      });
    },
  });

  loadHeroes([
    {
      id: 'hero-1',
      name: 'Scout',
      avatar: 'santa',
      q: playerTownCenter.q,
      r: playerTownCenter.r,
      settlementId: '0,0',
      stats: { xp: 10, hp: 10, atk: 1, spd: 1 },
      facing: 'down',
      movement: {
        origin: { q: 0, r: 0 },
        target: { q: 2, r: 0 },
        path: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
        startMs: 0,
        stepDurations: [1_000, 1_000],
        cumulative: [1_000, 2_000],
        authoritative: true,
      },
    } satisfies Hero,
  ]);

  tickAt(1_000);

  assert.deepEqual(moveCalls, []);
  assert.deepEqual(heroes[0]?.movement?.target, { q: 2, r: 0 });
});
