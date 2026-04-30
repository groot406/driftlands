// Seed heroes at town center (future differentiation can randomize slight offsets)
import type {Hero} from "../core/types/Hero.ts";
import { reactive } from 'vue';
import { createHeroFromTemplate, getStoryHeroTemplate } from '../shared/story/heroRoster.ts';
import { getInitialUnlockedStoryHeroIds } from '../shared/story/progressionState.ts';

const seedHeroes: Hero[] = [];

export const heroes = reactive<Hero[]>(seedHeroes);

function mergeHeroState(
    nextHero: Hero,
    previousHero?: Hero,
): Hero {
    return {
        ...previousHero,
        ...nextHero,
        movement: nextHero.movement,
        currentTaskId: nextHero.currentTaskId,
        pendingTask: nextHero.pendingTask,
        pendingExploreTarget: nextHero.pendingExploreTarget,
        scoutResourceIntent: nextHero.scoutResourceIntent,
        carryingPayload: nextHero.carryingPayload,
        pendingChain: nextHero.pendingChain,
        returnPos: nextHero.returnPos,
        delayedMovementTimer: undefined,
        currentOffset: previousHero?.currentOffset,
        lastActivity: previousHero?.lastActivity,
        lastSoundPosition: previousHero?.lastSoundPosition,
    };
}

export function loadHeroes(newHeroes: Hero[]): void {
    const previousById = new Map(heroes.map((hero) => [hero.id, hero]));
    heroes.length = 0;
    for (const nextHero of newHeroes) {
        heroes.push(mergeHeroState(nextHero, previousById.get(nextHero.id)));
    }
}

export function syncHeroRoster(heroIds: string[], spawn: { q: number; r: number } = { q: 0, r: 0 }): void {
    const previousById = new Map(heroes.map((hero) => [hero.id, hero]));
    const preservedCustomHeroes = heroes.filter((hero) => !getStoryHeroTemplate(hero.id));
    heroes.length = 0;

    for (const heroId of heroIds) {
        const previousHero = previousById.get(heroId);
        if (previousHero) {
            heroes.push(previousHero);
            continue;
        }

        const templateHero = createHeroFromTemplate(heroId, spawn);
        if (templateHero) {
            heroes.push(templateHero);
        }
    }

    for (const customHero of preservedCustomHeroes) {
        heroes.push(customHero);
    }
}

export function getHero(id: string): Hero | null {
    return heroes.find(h => h.id === id) || null;
}
