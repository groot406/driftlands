import type { Hero } from '../../core/types/Hero.ts';

export type HeroSkillKey =
  | 'production_boost'
  | 'task_rush'
  | 'stabilizing_method'
  | 'survey_method';

export interface HeroSkillDefinition {
  key: HeroSkillKey;
  label: string;
  summary: string;
  maxLevel: number;
}

export const HERO_SKILL_MAX_LEVEL = 3;

export const HERO_SKILL_DEFINITIONS: readonly HeroSkillDefinition[] = [
  {
    key: 'production_boost',
    label: 'Production Boost',
    summary: 'Improves Boost with stronger and longer production surges.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'task_rush',
    label: 'Task Rush',
    summary: 'Improves Rush with larger task progress bursts.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'stabilizing_method',
    label: 'Stabilizing Method',
    summary: 'Improves Hold with longer stabilization and condition repair.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'survey_method',
    label: 'Survey Method',
    summary: 'Improves Survey with wider reveal and smarter charge use.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
] as const;

const SKILL_KEYS = new Set<HeroSkillKey>(HERO_SKILL_DEFINITIONS.map((skill) => skill.key));

export function isHeroSkillKey(value: string): value is HeroSkillKey {
  return SKILL_KEYS.has(value as HeroSkillKey);
}

export function getHeroSkillLevel(hero: Pick<Hero, 'skills'> | null | undefined, skill: HeroSkillKey) {
  return Math.max(0, Math.min(HERO_SKILL_MAX_LEVEL, Math.floor(hero?.skills?.[skill] ?? 0)));
}

export function getHeroSkillPoints(hero: Pick<Hero, 'skillPoints'> | null | undefined) {
  return Math.max(0, Math.floor(hero?.skillPoints ?? 0));
}

export function getHeroSkillPointsEarned(hero: Pick<Hero, 'skillPointsEarned'> | null | undefined) {
  return Math.max(0, Math.floor(hero?.skillPointsEarned ?? 0));
}

export function cloneHeroSkills(hero: Pick<Hero, 'skills'> | null | undefined) {
  return { ...(hero?.skills ?? {}) };
}

export function grantHeroSkillPoint(hero: Hero, amount: number = 1) {
  if (amount <= 0) {
    return false;
  }

  hero.skillPoints = getHeroSkillPoints(hero) + amount;
  hero.skillPointsEarned = getHeroSkillPointsEarned(hero) + amount;
  hero.skills = cloneHeroSkills(hero);
  return true;
}

export function selectHeroSkill(hero: Hero, skill: HeroSkillKey) {
  if (getHeroSkillPoints(hero) <= 0) {
    return false;
  }

  const currentLevel = getHeroSkillLevel(hero, skill);
  if (currentLevel >= HERO_SKILL_MAX_LEVEL) {
    return false;
  }

  hero.skills = cloneHeroSkills(hero);
  hero.skills[skill] = currentLevel + 1;
  hero.skillPoints = getHeroSkillPoints(hero) - 1;
  hero.skillPointsEarned = getHeroSkillPointsEarned(hero);
  return true;
}

export function getProductionBoostConfig(hero: Pick<Hero, 'skills'> | null | undefined) {
  const level = getHeroSkillLevel(hero, 'production_boost');
  return {
    multiplier: level >= 1 ? 1.75 : 1.5,
    cycles: level >= 2 ? 2 : 1,
    inputReduction: level >= 3 ? 1 : 0,
  };
}

export function getTaskRushBurstAmount(baseAmount: number, hero: Pick<Hero, 'skills'> | null | undefined) {
  const level = getHeroSkillLevel(hero, 'task_rush');
  const multiplier = level >= 2 ? 1.5 : level >= 1 ? 1.25 : 1;
  return Math.round(baseAmount * multiplier);
}

export function shouldRefundTaskRushOnCompletion(hero: Pick<Hero, 'skills'> | null | undefined) {
  return getHeroSkillLevel(hero, 'task_rush') >= 3;
}

export function getStabilizeDurationMs(baseDurationMs: number, hero: Pick<Hero, 'skills'> | null | undefined) {
  const level = getHeroSkillLevel(hero, 'stabilizing_method');
  if (level >= 2) return 4 * 60_000;
  if (level >= 1) return 3 * 60_000;
  return baseDurationMs;
}

export function shouldRepairOnStabilize(hero: Pick<Hero, 'skills'> | null | undefined) {
  return getHeroSkillLevel(hero, 'stabilizing_method') >= 3;
}

export function shouldRevealAdjacentOnSurvey(hero: Pick<Hero, 'skills'> | null | undefined) {
  return getHeroSkillLevel(hero, 'survey_method') >= 2;
}

export function shouldRefundSurveyWhenNothingFound(hero: Pick<Hero, 'skills'> | null | undefined) {
  return getHeroSkillLevel(hero, 'survey_method') >= 3;
}
