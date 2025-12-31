// Seed heroes at town center (future differentiation can randomize slight offsets)
import type {Hero} from "../core/types/Hero.ts";

const seedHeroes: Hero[] = [
    {id: 'h1', name: 'Santa', avatar: 'santa', q: 0, r: 0, stats: {xp: 10, hp: 100, atk: 10, spd: 1}, facing: 'down',},
    {id: 'h2', name: 'Harm', avatar: 'boy', q: 0, r: 0, stats: {xp: 10, hp: 100, atk: 10, spd: 1}, facing: 'down'},
    {id: 'h3', name: 'Jess', avatar: 'girl', q: 0, r: 0, stats: {xp: 10, hp: 100, atk: 10, spd: 1}, facing: 'down'},
    {id: 'h4', name: 'Jacky', avatar: 'loophead', q: 0, r: 0, stats: {xp: 10, hp: 100, atk: 10, spd: 1}, facing: 'down'},
];

export const heroes = seedHeroes;

export function loadHeroes(newHeroes: Hero[]): void {
    heroes.length = 0;
    heroes.push(...newHeroes);
}

export function getHero(id: string): Hero | null {
    return heroes.find(h => h.id === id) || null;
}