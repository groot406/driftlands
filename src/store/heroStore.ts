import {reactive, ref} from 'vue';
import {moveCamera} from '../core/camera';
import santa from '../assets/heroes/santa.png';
import {discoverTile, ensureTileExists} from '../core/world';
import type { Tile } from '../core/world';
import { TERRAIN_DEFS } from '../core/terrainDefs';

export interface HeroStats {
    hp: number; // hit points
    atk: number; // attack power
    spd: number; // speed / initiative
}

export interface HeroMovementState {
    path: {q:number;r:number}[]; // sequence of tiles to traverse (excluding origin, including destination)
    origin: {q:number;r:number};
    target: {q:number;r:number};
    startMs: number; // performance.now() when movement started
    stepMs: number; // ms per tile step
}

export interface Hero {
    id: string;
    name: string;
    avatar: string; // asset path for sprite sheet
    q: number; // axial coordinate q
    r: number; // axial coordinate r
    stats: HeroStats;
    facing: 'up' | 'down' | 'left' | 'right'; // sprite facing direction
    movement?: HeroMovementState; // optional movement state if hero is walking
}

export const HERO_SPRITE = santa; // placeholder spritesheet for all heroes for now

// Seed heroes at town center (future differentiation can randomize slight offsets)
const seedHeroes: Hero[] = [
    {id: 'h1', name: 'Santa', avatar: HERO_SPRITE, q: 0, r: 0, stats: {hp: 120, atk: 18, spd: 1}, facing: 'down'},
    {id: 'h2', name: 'Brann', avatar: HERO_SPRITE, q: 2, r: 2, stats: {hp: 90, atk: 24, spd: 3}, facing: 'down'},
];

export const heroes = reactive<Hero[]>(seedHeroes);

const LS_KEY = 'driftlands_heroes_v1';

function persistHeroes() {
    try {
        const plain = heroes.map(h => ({...h, movement: h.movement ? {...h.movement} : undefined}));
        localStorage.setItem(LS_KEY, JSON.stringify({heroes: plain, ts: Date.now()}));
    } catch (e) {
        // ignore persistence errors
    }
}

function restoreHeroes() {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.heroes)) return;
        for (const saved of data.heroes) {
            const hero = heroes.find(h => h.id === saved.id);
            if (!hero) continue;
            hero.q = saved.q;
            hero.r = saved.r;
            hero.facing = saved.facing || hero.facing;
            if (saved.movement && Array.isArray(saved.movement.path) && saved.movement.path.length) {
                hero.movement = saved.movement;
            } else {
                hero.movement = undefined;
            }
        }
    } catch (e) {
        // ignore
    }
}

function isTileWalkable(tile: Tile): boolean {
    return !!(tile.terrain && TERRAIN_DEFS[tile.terrain]?.walkable);
}

// Advance heroes based on movement timing; called each frame before drawing.
export function updateHeroMovements(now: number) {
    for (const hero of heroes) {
        if (!hero.movement) continue;
        const m = hero.movement;
        const stepsAdvanced = Math.floor((now - m.startMs) / m.stepMs);
        if (stepsAdvanced >= m.path.length) {
            // Attempt to move onto final target tile
            const targetTile = ensureTileExists(m.target.q, m.target.r);
            if (!targetTile.discovered) discoverTile(targetTile);
            if (!isTileWalkable(targetTile)) {
                // Cancel movement: target not walkable after discovery; hero stays at previous position.
                hero.movement = undefined;
                persistHeroes();
                continue;
            }
            hero.q = m.target.q;
            hero.r = m.target.r;
            hero.movement = undefined;
            persistHeroes();
            continue;
        }
        if (stepsAdvanced < 0) continue; // not started yet (shouldn't happen)
        const currentCoord = m.path[stepsAdvanced];
        if (!currentCoord) continue; // safety
        if (hero.q !== currentCoord.q || hero.r !== currentCoord.r) {
            // Discover prospective step tile first
            const stepTile = ensureTileExists(currentCoord.q, currentCoord.r);
            if (!stepTile.discovered) discoverTile(stepTile);
            if (!isTileWalkable(stepTile)) {
                // Cancel movement; do not move onto unwalkable tile
                hero.movement = undefined;
                persistHeroes();
                continue;
            }
            // Update facing based on delta from previous position
            const prev = stepsAdvanced === 0 ? m.origin : m.path[stepsAdvanced - 1];
            const dq = prev ? (currentCoord.q - prev.q) : 0;
            const dr = prev ? (currentCoord.r - prev.r) : 0;
            let facing: Hero['facing'] = hero.facing;
            if (dr < 0) facing = 'up';
            else if (dr > 0) facing = 'down';
            else if (dq > 0) facing = 'right';
            else if (dq < 0) facing = 'left';
            hero.facing = facing;
            hero.q = currentCoord.q;
            hero.r = currentCoord.r;
            persistHeroes();
        }
    }
}

export function startHeroMovement(heroId: string, path: {q:number;r:number}[], target: {q:number;r:number}) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;
    if (!path.length) return; // nothing to do
    const baseStepMs = 550; // base duration per tile
    const stepMs = Math.max(150, baseStepMs - hero.stats.spd * 20); // faster with higher spd
    hero.movement = {
        path: path.slice(), // copy
        origin: {q: hero.q, r: hero.r},
        target,
        startMs: performance.now(),
        stepMs,
    };
    persistHeroes();
}

// Focus camera on hero
export function focusHero(hero: Hero) {
    moveCamera(hero.q, hero.r);
}

export const selectedHeroId = ref<string | null>(null);

export function selectHero(hero: Hero | null, focus: boolean = true) {
    if (hero) {
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

export function updateHeroFacing(id: string, facing: Hero['facing']) {
    const hero = heroes.find(h => h.id === id);
    if (hero) hero.facing = facing;
}

// Initialize persisted state, then immediately advance positions based on elapsed time since movement start
if (typeof window !== 'undefined') {
    restoreHeroes();
    updateHeroMovements(performance.now());
}

export function resetHeroes() {
    // Clear current heroes and localStorage save, then seed fresh starting heroes within initial discovered radius.
    try { localStorage.removeItem(LS_KEY); } catch {}
    // reset q and r to starting positions
    for(const hero of heroes) {
        hero.q = 0;
        hero.r = 0;
    }
    persistHeroes();
}
