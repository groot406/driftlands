import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import { heroes, loadHeroes, syncHeroRoster } from './heroStore.ts';

function cloneHero(hero: Hero): Hero {
  return {
    ...hero,
    stats: { ...hero.stats },
    movement: hero.movement
      ? {
          ...hero.movement,
          origin: { ...hero.movement.origin },
          target: { ...hero.movement.target },
          path: hero.movement.path.map((step) => ({ ...step })),
          stepDurations: hero.movement.stepDurations.slice(),
          cumulative: hero.movement.cumulative.slice(),
        }
      : undefined,
    pendingTask: hero.pendingTask ? { ...hero.pendingTask } : undefined,
    carryingPayload: hero.carryingPayload ? { ...hero.carryingPayload } : undefined,
    pendingChain: hero.pendingChain ? { ...hero.pendingChain } : undefined,
    returnPos: hero.returnPos ? { ...hero.returnPos } : undefined,
    currentOffset: hero.currentOffset ? { ...hero.currentOffset } : undefined,
    lastSoundPosition: hero.lastSoundPosition ? { ...hero.lastSoundPosition } : undefined,
  };
}

test('syncHeroRoster preserves live hero progression for existing heroes', () => {
  const originalHeroes = heroes.map(cloneHero);

  try {
    loadHeroes([
      {
        id: 'h1',
        name: 'Santa',
        avatar: 'santa',
        q: 3,
        r: 4,
        stats: { xp: 47, hp: 125, atk: 18, spd: 3 },
        facing: 'left',
        currentTaskId: 'task-42',
        pendingTask: { tileId: '3,4', taskType: 'explore' },
      },
      {
        id: 'h2',
        name: 'Harm',
        avatar: 'boy',
        q: -2,
        r: 1,
        stats: { xp: 29, hp: 110, atk: 15, spd: 2 },
        facing: 'up',
      },
    ]);

    syncHeroRoster(['h1', 'h2', 'h3']);

    const veteran = heroes.find((hero) => hero.id === 'h1');
    const unlock = heroes.find((hero) => hero.id === 'h3');

    assert.ok(veteran);
    assert.equal(veteran.stats.xp, 47);
    assert.equal(veteran.stats.hp, 125);
    assert.equal(veteran.facing, 'left');
    assert.equal(veteran.currentTaskId, 'task-42');
    assert.deepEqual(veteran.pendingTask, { tileId: '3,4', taskType: 'explore' });
    assert.equal(veteran.q, 3);
    assert.equal(veteran.r, 4);

    assert.ok(unlock);
    assert.equal(unlock.stats.xp, 100);
    assert.equal(unlock.q, 0);
    assert.equal(unlock.r, 0);
  } finally {
    loadHeroes(originalHeroes);
  }
});
