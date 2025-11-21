import {reactive} from 'vue';
import {moveCamera} from '../core/camera';

export interface HeroStats {
    hp: number; // hit points
    atk: number; // attack power
    spd: number; // speed / initiative
}

export interface Hero {
    id: string;
    name: string;
    avatar: string; // could be emoji or asset path
    q: number; // axial coordinate q
    r: number; // axial coordinate r
    stats: HeroStats;
}

// Seed heroes near starting area. In future this can be loaded / generated.
const seedHeroes: Hero[] = [
    {id: 'h1', name: 'Astra', avatar: '🛡️', q: 0, r: 0, stats: {hp: 120, atk: 18, spd: 10}},
    {id: 'h2', name: 'Brann', avatar: '⚔️', q: 2, r: -1, stats: {hp: 90, atk: 24, spd: 12}},
    {id: 'h3', name: 'Cyra', avatar: '🧪', q: -3, r: 2, stats: {hp: 75, atk: 16, spd: 15}},
];

export const heroes = reactive<Hero[]>(seedHeroes);

export function focusHero(hero: Hero) {
    moveCamera(hero.q, hero.r);
}

// Helper to get a hero by id (future use)
export function getHero(id: string): Hero | undefined {
    return heroes.find(h => h.id === id);
}

