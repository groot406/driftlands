import type { Hero } from '../../core/types/Hero.ts';
import type { TaskType } from '../../core/types/Task.ts';

export type HeroSkillKey =
  | 'speed'
  | 'strength'
  | 'craft'
  | 'scouting'
  | 'survival'
  | 'teamwork';

export type HeroTaskSkillCategory = 'strength' | 'craft' | 'scouting' | 'survival';

export interface HeroSkillDefinition {
  key: HeroSkillKey;
  label: string;
  summary: string;
  maxLevel: number;
}

export const HERO_SKILL_MAX_LEVEL = 10;

export const HERO_SKILL_DEFINITIONS: readonly HeroSkillDefinition[] = [
  {
    key: 'speed',
    label: 'Speed',
    summary: 'Moves faster between tiles.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'strength',
    label: 'Strength',
    summary: 'Works faster on chopping, mining, digging, and heavy clearing.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'craft',
    label: 'Craft',
    summary: 'Builds roads, structures, bridges, tunnels, and upgrades faster.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'scouting',
    label: 'Scouting',
    summary: 'Explores and resource-scouts faster.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'survival',
    label: 'Survival',
    summary: 'Works faster on hunting, fishing, cooking, planting, and field care.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
  {
    key: 'teamwork',
    label: 'Teamwork',
    summary: 'Gains extra task speed when working with other heroes.',
    maxLevel: HERO_SKILL_MAX_LEVEL,
  },
] as const;

const TASK_SKILL_MULTIPLIER_PER_LEVEL = 0.05;
const MOVEMENT_SPEED_MULTIPLIER_PER_LEVEL = 0.04;
const TEAMWORK_MULTIPLIER_PER_LEVEL_PER_HELPER = 0.025;

const STRENGTH_TASKS = new Set<string>([
  'breakDirtRock',
  'chopWood',
  'clearRocks',
  'dig',
  'gatherDriftwood',
  'gatherSand',
  'gatherTimber',
  'mineOre',
  'removeTrunks',
]);

const SCOUTING_TASKS = new Set<string>([
  'activateRuins',
  'explore',
  'scoutResource',
]);

const SURVIVAL_TASKS = new Set<string>([
  'convertToGrass',
  'fishAtDock',
  'harvestGrain',
  'harvestGrapes',
  'harvestHops',
  'harvestWaterLilies',
  'hunt',
  'irregateDirtTask',
  'placeWaterLilies',
  'plantTrees',
  'seedGrain',
  'seedGrapes',
  'seedHops',
  'tillLand',
]);

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

export function getHeroMovementSpeedMultiplier(hero: Pick<Hero, 'skills'> | null | undefined) {
  return 1 + (getHeroSkillLevel(hero, 'speed') * MOVEMENT_SPEED_MULTIPLIER_PER_LEVEL);
}

export function getSkilledHeroMovementSpeedAdj(hero: Pick<Hero, 'skills'> | null | undefined, baseSpeedAdj: number) {
  return Math.max(0.1, baseSpeedAdj / getHeroMovementSpeedMultiplier(hero));
}

export function getHeroTaskSkillCategory(taskType: TaskType): HeroTaskSkillCategory | null {
  if (taskType.startsWith('build') || taskType.startsWith('upgrade') || taskType === 'dismantle') {
    return 'craft';
  }

  if (STRENGTH_TASKS.has(taskType)) {
    return 'strength';
  }

  if (SCOUTING_TASKS.has(taskType)) {
    return 'scouting';
  }

  if (SURVIVAL_TASKS.has(taskType)) {
    return 'survival';
  }

  return null;
}

export function getHeroTaskSpecialtyMultiplier(
  hero: Pick<Hero, 'skills'> | null | undefined,
  taskType: TaskType,
) {
  const category = getHeroTaskSkillCategory(taskType);
  if (!category) {
    return 1;
  }

  return 1 + (getHeroSkillLevel(hero, category) * TASK_SKILL_MULTIPLIER_PER_LEVEL);
}

export function getHeroTeamworkMultiplier(
  hero: Pick<Hero, 'skills'> | null | undefined,
  participantCount: number,
) {
  const helperCount = Math.max(0, Math.floor(participantCount) - 1);
  return 1 + (getHeroSkillLevel(hero, 'teamwork') * TEAMWORK_MULTIPLIER_PER_LEVEL_PER_HELPER * helperCount);
}

export function getHeroTaskRateMultiplier(
  hero: Pick<Hero, 'skills'> | null | undefined,
  taskType: TaskType,
  participantCount: number = 1,
) {
  return getHeroTaskSpecialtyMultiplier(hero, taskType) * getHeroTeamworkMultiplier(hero, participantCount);
}

export function applyHeroTaskRateMultiplier(
  baseRate: number,
  hero: Pick<Hero, 'skills'> | null | undefined,
  taskType: TaskType,
  participantCount: number = 1,
) {
  return baseRate * getHeroTaskRateMultiplier(hero, taskType, participantCount);
}
