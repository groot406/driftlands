import test from 'node:test';
import assert from 'node:assert/strict';

import { heroes, loadHeroes } from '../store/heroStore';
import { loadWorld } from './world';
import { startHeroMovement } from './heroService';
import type { Hero } from './types/Hero';
import type { Tile } from './types/Tile';
import { loadTestModeSettings, resetTestModeSettings } from '../shared/game/testMode.ts';

function createHero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: overrides.id ?? 'hero-1',
    name: overrides.name ?? 'Scout',
    avatar: overrides.avatar ?? 'boy',
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    stats: overrides.stats ?? { xp: 100, hp: 100, atk: 10, spd: 2 },
    facing: overrides.facing ?? 'down',
    ...overrides,
  };
}

function createHiddenPlain(q: number, r: number): Tile {
  return {
    id: `${q},${r}`,
    q,
    r,
    biome: 'plains',
    terrain: 'plains',
    discovered: false,
    isBaseTile: true,
    variant: null,
  };
}

test.afterEach(() => {
  loadHeroes([]);
  loadWorld([]);
  resetTestModeSettings();
});

test('server-authoritative explore movement can move between undiscovered frontier tiles', () => {
  loadWorld([
    createHiddenPlain(1, 0),
    createHiddenPlain(2, 0),
  ]);
  loadHeroes([createHero({ q: 1, r: 0 })]);

  startHeroMovement('hero-1', [{ q: 2, r: 0 }], { q: 2, r: 0 }, 'explore', {
    origin: { q: 1, r: 0 },
    startAt: 1_000,
    stepDurations: [900],
    cumulative: [900],
    authoritative: true,
    taskLocation: { q: 2, r: 0 },
  });

  const hero = heroes[0];
  assert.deepEqual(hero?.movement?.origin, { q: 1, r: 0 });
  assert.deepEqual(hero?.movement?.target, { q: 2, r: 0 });
  assert.deepEqual(hero?.pendingTask, { tileId: '2,0', taskType: 'explore' });
});

test('local non-authoritative movement still rejects fog-to-fog movement', () => {
  loadWorld([
    createHiddenPlain(1, 0),
    createHiddenPlain(2, 0),
  ]);
  loadHeroes([createHero({ q: 1, r: 0 })]);

  startHeroMovement('hero-1', [{ q: 2, r: 0 }], { q: 2, r: 0 }, 'explore', {
    origin: { q: 1, r: 0 },
    startAt: 1_000,
    stepDurations: [900],
    cumulative: [900],
    taskLocation: { q: 2, r: 0 },
  });

  assert.equal(heroes[0]?.movement, undefined);
});

test('local fallback timings use the fast hero movement debug toggle', () => {
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
      terrain: 'plains',
      discovered: true,
      isBaseTile: true,
      variant: null,
    } satisfies Tile,
  ]);
  loadHeroes([createHero({ q: 0, r: 0 })]);

  startHeroMovement('hero-1', [{ q: 1, r: 0 }], { q: 1, r: 0 });
  const normalDuration = heroes[0]?.movement?.stepDurations[0];

  loadHeroes([createHero({ q: 0, r: 0 })]);
  loadTestModeSettings({
    enabled: true,
    instantBuild: false,
    unlimitedResources: false,
    fastHeroMovement: true,
    fastGrowth: false,
    fastPopulationGrowth: false,
    fastSettlerCycles: false,
    supportTiles: false,
    progressionOverridesBySettlementId: {},
    completedStudyKeys: [],
  });

  startHeroMovement('hero-1', [{ q: 1, r: 0 }], { q: 1, r: 0 });
  const fastDuration = heroes[0]?.movement?.stepDurations[0];

  assert.ok(typeof normalDuration === 'number');
  assert.ok(typeof fastDuration === 'number');
  assert.ok(fastDuration < normalDuration);
  assert.equal(fastDuration, 187.5);
});
