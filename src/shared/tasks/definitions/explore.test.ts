import test from 'node:test';
import assert from 'node:assert/strict';

import { getExploreHeroRate, getExploreRequiredXp, getExploreRewardedXp } from './explore';

test('explore required xp stays flat regardless of distance', () => {
  assert.equal(getExploreRequiredXp(0), 795);
  assert.equal(getExploreRequiredXp(1), 795);
  assert.equal(getExploreRequiredXp(5), 795);
  assert.equal(getExploreRequiredXp(10), 795);
  assert.equal(getExploreRequiredXp(20), 795);
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

  assert.equal(noviceRate, 248);
  assert.equal(veteranRate, 576);
  assert.equal(fastScoutRate, 440);
  assert.ok(veteranRate < (noviceRate * 3));
  assert.ok(fastScoutRate > noviceRate);
});

test('explore xp rewards stay flat regardless of distance', () => {
  assert.equal(getExploreRewardedXp(1), 1);
  assert.equal(getExploreRewardedXp(4), 1);
  assert.equal(getExploreRewardedXp(8), 1);
  assert.equal(getExploreRewardedXp(12), 1);
});
