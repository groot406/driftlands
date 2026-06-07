import assert from 'node:assert/strict';
import test from 'node:test';

import type { Hero } from '../types/Hero.ts';
import { clientMessageRouter } from '../messageRouter.ts';
import { currentPlayer } from '../socket.ts';
import { clearTextIndicators, getTextIndicators } from '../textIndicators.ts';
import { heroMessageHandler } from './heroMessageHandler.ts';
import { getHero, loadHeroes } from '../../store/heroStore.ts';
import { getNotifications, resetNotifications } from '../../store/notificationStore.ts';

function hero(overrides: Partial<Hero> = {}): Hero {
    return {
        id: 'h-test',
        name: 'Tester',
        avatar: '',
        q: 0,
        r: 0,
        stats: { xp: 0, hp: 1, atk: 1, spd: 1 },
        facing: 'down',
        skillPoints: 0,
        skillPointsEarned: 0,
        skills: {},
        ...overrides,
    };
}

function routeAbilityUpdate(heroId: string, overrides: Partial<{
    abilityCharges: number;
    xpChargeProgress: number;
    abilityChargesEarned: number;
    skillPoints: number;
    skillPointsEarned: number;
    skills: Hero['skills'];
}> = {}) {
    clientMessageRouter.route({
        type: 'hero:ability_update',
        heroId,
        abilityCharges: overrides.abilityCharges ?? 0,
        xpChargeProgress: overrides.xpChargeProgress ?? 0,
        abilityChargesEarned: overrides.abilityChargesEarned ?? 0,
        skillPoints: overrides.skillPoints ?? 1,
        skillPointsEarned: overrides.skillPointsEarned ?? 1,
        skills: overrides.skills ?? {},
    });
}

test.beforeEach(() => {
    heroMessageHandler.init();
    currentPlayer.value = { id: 'player-local', name: 'Local' };
    resetNotifications();
    clearTextIndicators();
});

test.afterEach(() => {
    currentPlayer.value = null;
    loadHeroes([]);
    resetNotifications();
    clearTextIndicators();
});

test('local hero earning a skill point creates local announcement UI', () => {
    loadHeroes([hero({ id: 'hero-local', name: 'Ada', playerId: 'player-local' })]);

    routeAbilityUpdate('hero-local');

    assert.equal(getNotifications.value.length, 1);
    assert.equal(getNotifications.value[0]?.type, 'hero_skill');
    assert.equal(getNotifications.value[0]?.message, 'Ada earned 1 skill point. Open Skills to choose an upgrade.');
    assert.equal(getTextIndicators().length, 1);
    assert.equal(getTextIndicators()[0]?.text, 'Skill point ready');
});

test('other player hero earning a skill point updates state without local announcement UI', () => {
    loadHeroes([hero({ id: 'hero-other', playerId: 'player-other' })]);

    routeAbilityUpdate('hero-other');

    const updatedHero = getHero('hero-other');
    assert.equal(updatedHero?.skillPoints, 1);
    assert.equal(updatedHero?.skillPointsEarned, 1);
    assert.equal(getNotifications.value.length, 0);
    assert.equal(getTextIndicators().length, 0);
});

test('ability updates replace selected skill state', () => {
    loadHeroes([hero({ id: 'hero-local', playerId: 'player-local', skillPoints: 1, skillPointsEarned: 1 })]);

    routeAbilityUpdate('hero-local', {
        skillPoints: 0,
        skillPointsEarned: 1,
        skills: { speed: 1, craft: 2 },
    });

    const updatedHero = getHero('hero-local');
    assert.equal(updatedHero?.skillPoints, 0);
    assert.deepEqual(updatedHero?.skills, { speed: 1, craft: 2 });
});
