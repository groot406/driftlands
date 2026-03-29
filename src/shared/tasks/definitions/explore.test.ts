import test from 'node:test';
import assert from 'node:assert/strict';

import { getExploreHeroRate, getExploreRequiredXp, getExploreRewardedXp } from './explore';

test('explore required xp now ramps faster into higher frontier rings', () => {
  assert.equal(getExploreRequiredXp(0), 450);
  assert.equal(getExploreRequiredXp(1), 1325);
  assert.equal(getExploreRequiredXp(5), 5325);
  assert.equal(getExploreRequiredXp(10), 11450);
  assert.equal(getExploreRequiredXp(20), 27450);
});

test('explore hero rate grows sublinearly from xp and still values speed', () => {
  const noviceRate = getExploreHeroRate({
    stats: { xp: 10, hp: 100, atk: 10, spd: 1 },
  });
  const veteranRate = getExploreHeroRate({
    stats: { xp: 100, hp: 100, atk: 10, spd: 1 },
  });
  const fastScoutRate = getExploreHeroRate({
    stats: { xp: 10, hp: 100, atk: 10, spd: 3 },
  });

  assert.equal(noviceRate, 124);
  assert.equal(veteranRate, 288);
  assert.equal(fastScoutRate, 220);
  assert.ok(veteranRate < (noviceRate * 3));
  assert.ok(fastScoutRate > noviceRate);
});

test('explore xp rewards scale more gently with distance', () => {
  assert.equal(getExploreRewardedXp(1), 1);
  assert.equal(getExploreRewardedXp(4), 1);
  assert.equal(getExploreRewardedXp(8), 2);
  assert.equal(getExploreRewardedXp(12), 3);
});
