import assert from 'node:assert/strict';
import test from 'node:test';

import type { Hero } from '../../core/types/Hero.ts';
import { configureGameRuntime, resetGameRuntime } from '../game/runtime.ts';
import {
  HERO_ABILITY_CHARGE_PROGRESS_REQUIRED,
  HERO_ABILITY_MAX_CHARGES,
  addHeroAbilityProgress,
} from './heroAbilities.ts';
import {
  getHeroMovementSpeedMultiplier,
  getHeroTaskRateMultiplier,
  getHeroTaskSkillCategory,
  selectHeroSkill,
} from './heroSkills.ts';

function hero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'h-test',
    name: 'Tester',
    avatar: '',
    q: 0,
    r: 0,
    stats: { xp: 0, hp: 1, atk: 1, spd: 1 },
    facing: 'down',
    ...overrides,
  };
}

test.afterEach(() => {
  resetGameRuntime();
});

test('partial XP progress broadcasts the updated skill meter', () => {
  const target = hero();
  const messages: { type: string; xpChargeProgress?: number }[] = [];
  configureGameRuntime({
    broadcast(message) {
      messages.push(message as { type: string; xpChargeProgress?: number });
    },
  });

  addHeroAbilityProgress(target, 3);

  assert.equal(target.xpChargeProgress, 3);
  assert.deepEqual(messages.map((message) => message.type), ['hero:ability_update']);
  assert.equal(messages[0]?.xpChargeProgress, 3);
});

test('full XP bars grant ability charges and skill points with overflow progress', () => {
  const target = hero();

  addHeroAbilityProgress(target, HERO_ABILITY_CHARGE_PROGRESS_REQUIRED + 25);

  assert.equal(target.abilityCharges, 1);
  assert.equal(target.abilityChargesEarned, 1);
  assert.equal(target.skillPoints, 1);
  assert.equal(target.skillPointsEarned, 1);
  assert.equal(target.xpChargeProgress, 25);
});

test('ability charges cap at three while skill points keep accumulating', () => {
  const target = hero({ abilityCharges: HERO_ABILITY_MAX_CHARGES });

  addHeroAbilityProgress(target, HERO_ABILITY_CHARGE_PROGRESS_REQUIRED * 2);

  assert.equal(target.abilityCharges, HERO_ABILITY_MAX_CHARGES);
  assert.equal(target.abilityChargesEarned, 2);
  assert.equal(target.skillPoints, 2);
  assert.equal(target.skillPointsEarned, 2);
  assert.equal(target.xpChargeProgress, 0);
});

test('skill selection spends one point and cannot exceed level ten', () => {
  const target = hero({ skillPoints: 11 });

  for (let i = 0; i < 10; i += 1) {
    assert.equal(selectHeroSkill(target, 'strength'), true);
  }
  assert.equal(selectHeroSkill(target, 'strength'), false);

  assert.equal(target.skillPoints, 1);
  assert.equal(target.skills?.strength, 10);
});

test('skill selection fails without an unspent skill point', () => {
  const target = hero();

  assert.equal(selectHeroSkill(target, 'speed'), false);
  assert.equal(target.skills?.speed, undefined);
});

test('skill helpers apply direct movement and task multipliers', () => {
  const skilled = hero({
    skills: {
      speed: 3,
      strength: 2,
      craft: 1,
      scouting: 3,
      survival: 1,
      teamwork: 2,
    },
  });

  assert.equal(Math.round(getHeroMovementSpeedMultiplier(skilled) * 100), 112);
  assert.equal(getHeroTaskSkillCategory('chopWood'), 'strength');
  assert.equal(getHeroTaskSkillCategory('buildHouse'), 'craft');
  assert.equal(getHeroTaskSkillCategory('explore'), 'scouting');
  assert.equal(getHeroTaskSkillCategory('hunt'), 'survival');
  assert.equal(getHeroTaskRateMultiplier(skilled, 'chopWood'), 1.1);
  assert.equal(getHeroTaskRateMultiplier(skilled, 'buildHouse'), 1.05);
  assert.equal(getHeroTaskRateMultiplier(skilled, 'explore'), 1.15);
  assert.equal(getHeroTaskRateMultiplier(skilled, 'hunt'), 1.05);
  assert.equal(Math.round(getHeroTaskRateMultiplier(skilled, 'chopWood', 3) * 1000), 1210);
});
