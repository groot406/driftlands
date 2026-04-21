import type { Hero } from '../../core/types/Hero.ts';
import type { HeroAbilityUpdateMessage } from '../protocol.ts';
import { broadcastGameMessage as broadcast } from '../game/runtime.ts';
import { cloneHeroSkills, getHeroSkillPoints, getHeroSkillPointsEarned, grantHeroSkillPoint } from './heroSkills.ts';

export type HeroAbilityKey = 'boostProduction' | 'instantTask' | 'stabilizeTile' | 'surveyBoost';

export const HERO_ABILITY_MAX_CHARGES = 3;
export const HERO_ABILITY_CHARGE_PROGRESS_REQUIRED = 100;
export const HERO_ABILITY_TASK_PROGRESS_BURST = 1500;
export const HERO_ABILITY_STABILIZE_MS = 2 * 60_000;

export function getHeroAbilityCharges(hero: Pick<Hero, 'abilityCharges'>) {
  return Math.max(0, Math.min(HERO_ABILITY_MAX_CHARGES, Math.floor(hero.abilityCharges ?? 0)));
}

export function broadcastHeroAbilityState(hero: Hero) {
  broadcast({
    type: 'hero:ability_update',
    heroId: hero.id,
    abilityCharges: getHeroAbilityCharges(hero),
    xpChargeProgress: Math.max(0, hero.xpChargeProgress ?? 0),
    abilityChargesEarned: Math.max(0, hero.abilityChargesEarned ?? 0),
    skillPoints: getHeroSkillPoints(hero),
    skillPointsEarned: getHeroSkillPointsEarned(hero),
    skills: cloneHeroSkills(hero),
  } as HeroAbilityUpdateMessage);
}

export function addHeroAbilityProgress(hero: Hero, progress: number) {
  if (progress <= 0) {
    return false;
  }

  hero.xpChargeProgress = Math.max(0, hero.xpChargeProgress ?? 0) + progress;
  hero.abilityCharges = getHeroAbilityCharges(hero);
  hero.abilityChargesEarned = Math.max(0, hero.abilityChargesEarned ?? 0);
  hero.skillPoints = getHeroSkillPoints(hero);
  hero.skillPointsEarned = getHeroSkillPointsEarned(hero);
  hero.skills = cloneHeroSkills(hero);

  let changed = false;
  while (hero.xpChargeProgress >= HERO_ABILITY_CHARGE_PROGRESS_REQUIRED) {
    hero.xpChargeProgress -= HERO_ABILITY_CHARGE_PROGRESS_REQUIRED;
    hero.abilityCharges = Math.min(HERO_ABILITY_MAX_CHARGES, getHeroAbilityCharges(hero) + 1);
    hero.abilityChargesEarned += 1;
    grantHeroSkillPoint(hero);
    changed = true;
  }

  broadcastHeroAbilityState(hero);

  return changed;
}

export function spendHeroAbilityCharge(hero: Hero) {
  const charges = getHeroAbilityCharges(hero);
  if (charges <= 0) {
    return false;
  }

  hero.abilityCharges = charges - 1;
  broadcastHeroAbilityState(hero);
  return true;
}

export function refundHeroAbilityCharge(hero: Hero) {
  hero.abilityCharges = Math.min(HERO_ABILITY_MAX_CHARGES, getHeroAbilityCharges(hero) + 1);
  broadcastHeroAbilityState(hero);
}
