import {reactive, ref} from 'vue';
import {moveCamera} from '../core/camera';
import santa from '../assets/heroes/santa.png';
import {ensureTileExists} from '../core/world';
import type { Tile } from '../core/world';
import { TERRAIN_DEFS } from '../core/terrainDefs';
import { handleHeroArrival } from '../core/tasks';

export interface HeroStats {
    xp: number; // experience points
    hp: number; // hit points
    atk: number; // attack power
    spd: number; // speed / initiative
}

export type HeroStat = keyof HeroStats;

export interface HeroMovementState {
    path: {q:number;r:number}[]; // sequence of tiles to traverse (excluding origin, including destination)
    origin: {q:number;r:number};
    target: {q:number;r:number};
    taskType?: string; // optional task type to start upon arrival
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
    {id: 'h1', name: 'Santa', avatar: HERO_SPRITE, q: 0, r: 0, stats: {xp: 0, hp: 100, atk: 18, spd: 1}, facing: 'down'},
    // {id: 'h2', name: 'Brann', avatar: HERO_SPRITE, q: 2, r: 2, stats: {xp: 25, hp: 180, atk: 24, spd: 3}, facing: 'down'},
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
            if (saved.stats) {
                // Restore individual stat fields to preserve reactivity
                const stats = saved.stats;
                if (typeof stats.xp === 'number') hero.stats.xp = stats.xp;
                if (typeof stats.hp === 'number') hero.stats.hp = stats.hp;
                if (typeof stats.atk === 'number') hero.stats.atk = stats.atk;
                if (typeof stats.spd === 'number') hero.stats.spd = stats.spd;
            }
            if (saved.movement && Array.isArray(saved.movement.path) && saved.movement.path.length) {
                // Reconstruct movement with rebased startMs so elapsed time is non-negative.
                const m: HeroMovementState = {
                    path: saved.movement.path.slice(),
                    origin: saved.movement.origin,
                    target: saved.movement.target,
                    startMs: performance.now(), // temporary, will adjust below
                    stepMs: saved.movement.stepMs || 550,
                };
                // If hero already at target, discard movement
                if (hero.q === m.target.q && hero.r === m.target.r) {
                    hero.movement = undefined;
                    continue;
                }
                // Determine progress index based on current hero position within path.
                let progressIndex = m.path.findIndex(p => p.q === hero.q && p.r === hero.r);
                if (progressIndex < 0) {
                    // If hero at origin treat as not yet started.
                    progressIndex = (hero.q === m.origin.q && hero.r === m.origin.r) ? 0 : 0;
                } else {
                    // Hero already on path[progressIndex]; do not advance further.
                }
                // Rebase startMs so that (now - startMs) / stepMs ~= progressIndex completed.
                const nowPerf = performance.now();
                m.startMs = nowPerf - progressIndex * m.stepMs;
                hero.movement = m;
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
            // Instead of discovering immediately, invoke arrival handler (which starts explore task if needed)
            handleHeroArrival(hero, targetTile);

            hero.q = m.target.q;
            hero.r = m.target.r;
            hero.movement = undefined;
            persistHeroes();
            continue;
        }
        if (stepsAdvanced < 0) continue; // not started yet (shouldn't happen after rebase)
        const currentCoord = m.path[stepsAdvanced];
        if (!currentCoord) continue; // safety
        if (hero.q !== currentCoord.q || hero.r !== currentCoord.r) {
            // Discover prospective step tile first (keep existing traversal discovery behavior)
            const stepTile = ensureTileExists(currentCoord.q, currentCoord.r);

            if (stepTile.discovered && !isTileWalkable(stepTile)) {
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

export function startHeroMovement(heroId: string, path: {q:number;r:number}[], target: {q:number;r:number}, taskType?: string) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;
    if (!path.length) return; // nothing to do
    const baseStepMs = 550; // base duration per tile
    const stepMs = Math.max(150, baseStepMs - hero.stats.spd * 20); // faster with higher spd
    hero.movement = {
        path: path.slice(), // copy
        origin: {q: hero.q, r: hero.r},
        target,
        taskType,
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
    try { localStorage.removeItem(LS_KEY); } catch {}
    for(const hero of heroes) {
        hero.q = 0;
        hero.r = 0;
        hero.facing = 'down';
        hero.movement = undefined;
        // Reset stats to seed values if available
        const seed = seedHeroes.find(s => s.id === hero.id);
        if (seed) {
            hero.stats.xp = seed.stats.xp;
            hero.stats.hp = seed.stats.hp;
            hero.stats.atk = seed.stats.atk;
            hero.stats.spd = seed.stats.spd;
        }
    }
    persistHeroes();
}

export function ensureHeroSelected(focus: boolean) {
    if (!selectedHeroId.value && heroes.length) {
        selectedHeroId.value = heroes[0].id;
    }

    if (focus) {
        const hero = getSelectedHero();
        if (hero) focusHero(hero);
    }
}
