import test from 'node:test';
import assert from 'node:assert/strict';

import { getExploreHeroRate, getExploreRequiredXp, getExploreRewardedXp } from './explore';

test('explore required xp scales with distance', () => {
  assert.equal(getExploreRequiredXp(0), 640);
  assert.equal(getExploreRequiredXp(1), 845);
  assert.equal(getExploreRequiredXp(5), 1664);
  assert.equal(getExploreRequiredXp(10), 2688);
  assert.equal(getExploreRequiredXp(20), 4736);
});

test('explore hero rate ignores legacy xp and still values speed', () => {
  const noviceRate = getExploreHeroRate({
    stats: { xp: 10, hp: 100, atk: 10, spd: 1 },
  });
  const veteranRate = getExploreHeroRate({
    stats: { xp: 100, hp: 100, atk: 10, spd: 1 },
  });
  const fastScoutRate = getExploreHeroRate({
    stats: { xp: 10, hp: 100, atk: 10, spd: 3 },
  });

  assert.equal(noviceRate, 180);
  assert.equal(veteranRate, 180);
  assert.equal(fastScoutRate, 420);
  assert.equal(veteranRate, noviceRate);
  assert.ok(fastScoutRate > noviceRate);
});

test('explore rewards a small amount of hero xp for durable discovery', () => {
  assert.equal(getExploreRewardedXp(1), 3);
  assert.equal(getExploreRewardedXp(4), 3);
  assert.equal(getExploreRewardedXp(8), 3);
  assert.equal(getExploreRewardedXp(12), 3);
});
