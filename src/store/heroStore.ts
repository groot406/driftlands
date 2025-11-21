import {reactive, ref} from 'vue';
import {moveCamera} from '../core/camera';
import santa from '../assets/heroes/santa.png';

export interface HeroStats {
    hp: number; // hit points
    atk: number; // attack power
    spd: number; // speed / initiative
}

export interface Hero {
    id: string;
    name: string;
    avatar: string; // asset path for sprite sheet
    q: number; // axial coordinate q
    r: number; // axial coordinate r
    stats: HeroStats;
}

export const HERO_SPRITE = santa; // placeholder spritesheet for all heroes for now

// Seed heroes at town center (future differentiation can randomize slight offsets)
const seedHeroes: Hero[] = [
    {id: 'h1', name: 'Santa', avatar: HERO_SPRITE, q: 0, r: 0, stats: {hp: 120, atk: 18, spd: 10}},
    {id: 'h2', name: 'Brann', avatar: HERO_SPRITE, q: 2, r: 2, stats: {hp: 90, atk: 24, spd: 12}},
    // {id: 'h3', name: 'Cyra', avatar: HERO_SPRITE, q: 0, r: 1, stats: {hp: 75, atk: 16, spd: 15}},
    // {id: 'h4', name: 'Cyra', avatar: HERO_SPRITE, q: 1, r: 0, stats: {hp: 75, atk: 16, spd: 15}},
    // {id: 'h5', name: 'Cyra', avatar: HERO_SPRITE, q: 0, r: 1, stats: {hp: 75, atk: 16, spd: 15}},
    // {id: 'h6', name: 'Cyra', avatar: HERO_SPRITE, q: 1, r: 1, stats: {hp: 75, atk: 16, spd: 15}},
];

export const heroes = reactive<Hero[]>(seedHeroes);

export function focusHero(hero: Hero) {
    moveCamera(hero.q, hero.r);
}

export const selectedHeroId = ref<string | null>(null);

export function selectHero(hero: Hero | null, focus: boolean = true) {
    if (hero) {
        // if hero is already selected, deselect
        if (selectedHeroId.value === hero.id) {
            selectedHeroId.value = null;
            return;
        }

        selectedHeroId.value = hero.id;
        if (focus) focusHero(hero);
    } else {
        selectedHeroId.value = null;
    }
}

export function getSelectedHero(): Hero | null {
    return selectedHeroId.value ? (heroes.find(h => h.id === selectedHeroId.value) || null) : null;
}
