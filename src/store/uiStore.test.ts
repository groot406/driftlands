import test from 'node:test';
import assert from 'node:assert/strict';

import type { Hero } from '../core/types/Hero.ts';
import { loadHeroes } from './heroStore.ts';
import { currentPlayerSettlementId } from './settlementStartStore.ts';
import { ensureHeroSelected, selectHero, selectedHeroId } from './uiStore.ts';
import { currentPlayer } from '../core/socket.ts';

function hero(overrides: Partial<Hero> & Pick<Hero, 'id'>): Hero {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    avatar: overrides.avatar ?? 'santa',
    playerId: overrides.playerId,
    playerName: overrides.playerName,
    settlementId: overrides.settlementId,
    q: overrides.q ?? 0,
    r: overrides.r ?? 0,
    stats: overrides.stats ?? { xp: 0, hp: 10, atk: 1, spd: 1 },
    facing: overrides.facing ?? 'down',
  };
}

test.afterEach(() => {
  loadHeroes([]);
  selectedHeroId.value = null;
  currentPlayerSettlementId.value = null;
  currentPlayer.value = null;
});

test('auto selection replaces another player hero with own settlement hero', () => {
  currentPlayer.value = { id: 'player-a', name: 'Player A' };
  currentPlayerSettlementId.value = '10,0';
  loadHeroes([
    hero({ id: 'other-hero', playerId: 'player-b', settlementId: '0,0' }),
    hero({ id: 'own-hero', playerId: 'player-a', settlementId: '10,0' }),
  ]);
  selectedHeroId.value = 'other-hero';

  ensureHeroSelected(false);

  assert.equal(selectedHeroId.value, 'own-hero');
});

test('selectHero ignores heroes owned by another player', () => {
  currentPlayer.value = { id: 'player-a', name: 'Player A' };
  currentPlayerSettlementId.value = '10,0';
  loadHeroes([
    hero({ id: 'own-hero', playerId: 'player-a', settlementId: '10,0' }),
    hero({ id: 'other-hero', playerId: 'player-b', settlementId: '20,0' }),
  ]);

  selectedHeroId.value = 'own-hero';
  const otherHero = hero({ id: 'other-hero', playerId: 'player-b', settlementId: '20,0' });

  selectHero(otherHero, true);

  assert.equal(selectedHeroId.value, 'own-hero');
});
