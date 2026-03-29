import type { Hero, HeroStats } from '../../core/types/Hero.ts';

export type StoryHeroId = 'h1' | 'h2' | 'h3' | 'h4';

export interface StoryHeroTemplate {
  id: StoryHeroId;
  name: string;
  role: string;
  avatar: string;
  stats: HeroStats;
}

const HERO_TEMPLATES: readonly StoryHeroTemplate[] = [
  {
    id: 'h1',
    name: 'Santa',
    role: 'Quartermaster',
    avatar: 'santa',
    stats: { xp: 10, hp: 100, atk: 10, spd: 1 },
  },
  {
    id: 'h2',
    name: 'Harm',
    role: 'Trailbreaker',
    avatar: 'boy',
    stats: { xp: 10, hp: 100, atk: 10, spd: 1 },
  },
  {
    id: 'h3',
    name: 'Jess',
    role: 'Surveyor',
    avatar: 'girl',
    stats: { xp: 10, hp: 100, atk: 10, spd: 1 },
  },
  {
    id: 'h4',
    name: 'Jacky',
    role: 'Rigger',
    avatar: 'loophead',
    stats: { xp: 10, hp: 100, atk: 10, spd: 1 },
  },
] as const;

export function listStoryHeroTemplates() {
  return HERO_TEMPLATES.slice();
}

export function getStoryHeroTemplate(heroId: string): StoryHeroTemplate | null {
  return HERO_TEMPLATES.find((hero) => hero.id === heroId) ?? null;
}

export function createHeroFromTemplate(
  heroId: string,
  position: { q: number; r: number } = { q: 0, r: 0 },
): Hero | null {
  const template = getStoryHeroTemplate(heroId);
  if (!template) {
    return null;
  }

  return {
    id: template.id,
    name: template.name,
    avatar: template.avatar,
    q: position.q,
    r: position.r,
    stats: { ...template.stats },
    facing: 'down',
  };
}
