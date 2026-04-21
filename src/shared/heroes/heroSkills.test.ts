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
  getProductionBoostConfig,
  getStabilizeDurationMs,
  getTaskRushBurstAmount,
  selectHeroSkill,
  shouldRefundSurveyWhenNothingFound,
  shouldRefundTaskRushOnCompletion,
  shouldRepairOnStabilize,
  shouldRevealAdjacentOnSurvey,
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

test('skill selection spends one point and cannot exceed level three', () => {
  const target = hero({ skillPoints: 4 });

  assert.equal(selectHeroSkill(target, 'production_boost'), true);
  assert.equal(selectHeroSkill(target, 'production_boost'), true);
  assert.equal(selectHeroSkill(target, 'production_boost'), true);
  assert.equal(selectHeroSkill(target, 'production_boost'), false);

  assert.equal(target.skillPoints, 1);
  assert.equal(target.skills?.production_boost, 3);
});

test('skill selection fails without an unspent skill point', () => {
  const target = hero();

  assert.equal(selectHeroSkill(target, 'task_rush'), false);
  assert.equal(target.skills?.task_rush, undefined);
});

test('skill helpers scale existing hero ability effects', () => {
  const skilled = hero({
    skills: {
      production_boost: 3,
      task_rush: 3,
      stabilizing_method: 3,
      survey_method: 3,
    },
  });

  assert.deepEqual(getProductionBoostConfig(skilled), {
    multiplier: 1.75,
    cycles: 2,
    inputReduction: 1,
  });
  assert.equal(getTaskRushBurstAmount(1000, skilled), 1500);
  assert.equal(shouldRefundTaskRushOnCompletion(skilled), true);
  assert.equal(getStabilizeDurationMs(120_000, skilled), 240_000);
  assert.equal(shouldRepairOnStabilize(skilled), true);
  assert.equal(shouldRevealAdjacentOnSurvey(skilled), true);
  assert.equal(shouldRefundSurveyWhenNothingFound(skilled), true);
});
