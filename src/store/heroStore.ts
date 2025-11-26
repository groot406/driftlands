import {reactive, ref} from 'vue';
import {hexDistance, moveCamera} from '../core/camera';
import santa from '../assets/heroes/santa.png';
import boy from '../assets/heroes/boy.png';
import girl from '../assets/heroes/girl.png';
import loophead from '../assets/heroes/loophead.png';
import type {Tile} from '../core/world';
import {ensureTileExists} from '../core/world';
import {TERRAIN_DEFS} from '../core/terrainDefs';
import {handleHeroArrival} from '../core/tasks';
import { resumePendingChainsFor } from '../core/tasks';

export interface HeroStats {
    xp: number; // experience points
    hp: number; // hit points
    atk: number; // attack power
    spd: number; // speed / initiative
}

export type HeroStat = keyof HeroStats;

export interface HeroMovementState {
    path: { q: number; r: number }[]; // sequence of tiles to traverse (excluding origin, including destination)
    origin: { q: number; r: number };
    target: { q: number; r: number };
    taskType?: string; // optional task type to start upon arrival
    startMs: number; // performance.now() when movement started
    stepMs: number; // legacy uniform ms per tile (kept for backward compatibility / interpolation fallback)
    stepDurations?: number[]; // per-step durations (same length as path)
    cumulative?: number[]; // cumulative end times relative to startMs for each step
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
    currentTaskId?: string; // id of currently assigned active task (if any)
    prevPos?: { q: number; r: number }; // previous tile before starting current task (for retrace on invalid discovery)
    carryingResources?: boolean; // indicator hero is carrying wood to warehouse (legacy)
    carryingResourcesCount?: number; // number of wood deliveries completed (legacy cumulative deliveries)
    carryingPayload?: { type: 'wood' | string; amount: number }; // new payload model for carried resources
    pendingChain?: { sourceTileId: string; taskType: string }; // defer auto-chain until after delivery
    returnPos?: { q: number; r: number }; // restore optional original position for return flows
}

// Seed heroes at town center (future differentiation can randomize slight offsets)
const seedHeroes: Hero[] = [
    {
        id: 'h1',
        name: 'Santa',
        avatar: santa,
        q: 0,
        r: 0,
        stats: {xp: 0, hp: 100, atk: 18, spd: 1},
        facing: 'down',
        currentTaskId: undefined
    },
    {id: 'h2', name: 'Harm', avatar: boy, q: 0, r: 0, stats: {xp: 25, hp: 180, atk: 24, spd: 3}, facing: 'down'},
    {id: 'h3', name: 'Jess', avatar: girl, q: 0, r: 0, stats: {xp: 25, hp: 180, atk: 24, spd: 3}, facing: 'down'},
    {id: 'h4', name: 'Jacky', avatar: loophead, q: 0, r: 0, stats: {xp: 25, hp: 180, atk: 24, spd: 3}, facing: 'down'},
];

export const heroes = reactive<Hero[]>(seedHeroes);

const LEGACY_HERO_KEY = 'driftlands_heroes_v1';
let currentWorldId: string = 'default';
function heroKey(worldId: string) { return `driftlands_heroes_${worldId}_v1`; }

function migrateLegacyIfNeeded(worldId: string) {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_HERO_KEY);
    if (!legacyRaw) return;
    const targetKey = heroKey(worldId);
    if (localStorage.getItem(targetKey)) return; // already has world-specific save
    localStorage.setItem(targetKey, legacyRaw);
    // Optionally keep legacy to allow fallback; remove if we want one-time migration
    // localStorage.removeItem(LEGACY_HERO_KEY);
  } catch {
  }
}

export function setCurrentWorldId(worldId: string) {
  currentWorldId = worldId || 'default';
  migrateLegacyIfNeeded(currentWorldId);
  restoreHeroes();
}

function persistHeroes() {
    try {
        const plain = heroes.map(h => ({
            ...h,
            movement: h.movement ? {...h.movement} : undefined,
            currentTaskId: h.currentTaskId,
            prevPos: h.prevPos ? {...h.prevPos} : undefined,
            carryingResources: h.carryingResources || false,
            carryingResourcesCount: h.carryingResourcesCount || 0,
            carryingPayload: h.carryingPayload ? { ...h.carryingPayload } : undefined,
            pendingChain: h.pendingChain ? { ...h.pendingChain } : undefined,
            returnPos: h.returnPos ? { ...h.returnPos } : undefined,
            stats: { ...h.stats },
        }));
        localStorage.setItem(heroKey(currentWorldId), JSON.stringify({heroes: plain, ts: Date.now(), worldId: currentWorldId}));
    } catch (e) {
        // ignore persistence errors
    }
}

export {persistHeroes}; // export for task completion side-effects

function restoreHeroes() {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(heroKey(currentWorldId));
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
                const stats = saved.stats as Partial<HeroStats>;
                if ('xp' in stats && typeof stats.xp === 'number') hero.stats.xp = stats.xp;
                if ('hp' in stats && typeof stats.hp === 'number') hero.stats.hp = stats.hp;
                if ('atk' in stats && typeof stats.atk === 'number') hero.stats.atk = stats.atk;
                if ('spd' in stats && typeof stats.spd === 'number') hero.stats.spd = stats.spd;
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
                    // Attempt to resume any pending chain since arrival is completed
                    resumePendingChainsFor(hero);
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
                // Try to resume pending chain when not moving
                resumePendingChainsFor(hero);
            }
            // restore currentTaskId safely (may be stale if task was removed; taskStore will reconcile)
            if (typeof saved.currentTaskId === 'string') {
                hero.currentTaskId = saved.currentTaskId;
            } else {
                hero.currentTaskId = undefined;
            }
            // restore previous position snapshot if present
            if (saved.prevPos && typeof saved.prevPos.q === 'number' && typeof saved.prevPos.r === 'number') {
                hero.prevPos = {q: saved.prevPos.q, r: saved.prevPos.r};
            } else {
                hero.prevPos = undefined;
            }

            // Legacy restore of carrying state: only set carryingResources if actively carrying (payload or explicit flag), not from delivery count
            // Previous logic incorrectly set carryingResources from carryingResourcesCount (total delivered), causing false positives after reload.
            const savedHasPayload = saved.carryingPayload && typeof saved.carryingPayload.type === 'string' && typeof saved.carryingPayload.amount === 'number';
            if (savedHasPayload) {
                hero.carryingPayload = { type: saved.carryingPayload.type, amount: saved.carryingPayload.amount };
            } else {
                hero.carryingPayload = undefined;
            }
            hero.carryingResources = !!saved.carryingResources || !!hero.carryingPayload; // derive from actual payload or persisted flag
            if (typeof saved.carryingResourcesCount === 'number') hero.carryingResourcesCount = saved.carryingResourcesCount; // keep historical deliveries
            // If flag set but no payload, clear to avoid blocking tasks
            if (hero.carryingResources && !hero.carryingPayload) {
                hero.carryingResources = false;
            }
            if (saved.pendingChain && typeof saved.pendingChain.sourceTileId === 'string' && typeof saved.pendingChain.taskType === 'string') {
                hero.pendingChain = { sourceTileId: saved.pendingChain.sourceTileId, taskType: saved.pendingChain.taskType };
            } else {
                hero.pendingChain = undefined;
            }
            // After restoring pendingChain, attempt resume if safe
            resumePendingChainsFor(hero);
            if (saved.returnPos && typeof saved.returnPos.q === 'number' && typeof saved.returnPos.r === 'number') {
                hero.returnPos = { q: saved.returnPos.q, r: saved.returnPos.r };
            } else {
                hero.returnPos = undefined;
            }
        }
    } catch (e) {
        // ignore
    }
}

// Remove immediate restore on module load; worldId must be set first.
// if (typeof window !== 'undefined') {
//    restoreHeroes();
//    updateHeroMovements(performance.now());
// }

function isTileWalkable(tile: Tile): boolean {
    return !!(tile.terrain && TERRAIN_DEFS[tile.terrain]?.walkable);
}

// Advance heroes based on movement timing; called each frame before drawing.
export function updateHeroMovements(now: number) {
    for (const hero of heroes) {
        if (!hero.movement) continue;
        const m = hero.movement;
        const durations = m.stepDurations;
        const cumulative = m.cumulative;
        if (durations && cumulative && durations.length === m.path.length && cumulative.length === m.path.length) {
            const elapsed = now - m.startMs;
            // Determine number of COMPLETED steps (elapsed >= cumulative[i])
            let completedSteps = 0;
            for (let i = 0; i < cumulative.length; i++) {
                if (elapsed >= cumulative[i]!) completedSteps = i + 1; else break;
            }
            // Arrival if all steps completed
            if (completedSteps >= m.path.length) {
                const targetTile = ensureTileExists(m.target.q, m.target.r);
                // Move hero to final tile before arrival handling so path origin for any new movement is correct
                hero.q = m.target.q;
                hero.r = m.target.r;
                const originalMovement = m;
                handleHeroArrival(hero, targetTile);
                // Only clear movement if arrival did not start a new one
                if (hero.movement === originalMovement) {
                    hero.movement = undefined;
                }
                persistHeroes();
                continue;
            }
            // Current coord = last fully completed tile (origin if none yet)
            const currentCoord = (completedSteps === 0) ? m.origin : m.path[completedSteps - 1]!;
            const nextCoord = m.path[completedSteps]; // in-progress destination (not yet reached)
            hero.prevPos = currentCoord;
            // Validate destination walkability ahead of time
            if (nextCoord) {
                const nextTile = ensureTileExists(nextCoord.q, nextCoord.r);
                if (nextTile.discovered && !isTileWalkable(nextTile)) {
                    hero.movement = undefined;
                    persistHeroes();
                    continue;
                }
            }
            // Facing toward next tile if exists
            if (nextCoord) {
                const dq = nextCoord.q - currentCoord.q;
                const dr = nextCoord.r - currentCoord.r;
                let facing: Hero['facing'] = hero.facing;
                if (dr < 0) facing = 'up';
                else if (dr > 0) facing = 'down';
                else if (dq > 0) facing = 'right';
                else if (dq < 0) facing = 'left';
                hero.facing = facing;
            }
            // Update hero position only when a full step finished
            if (hero.q !== currentCoord.q || hero.r !== currentCoord.r) {
                hero.q = currentCoord.q;
                hero.r = currentCoord.r;
                persistHeroes();
            }
            continue;
        }
        // Fallback legacy uniform timing
        const stepsAdvanced = Math.floor((now - m.startMs) / m.stepMs);
        if (stepsAdvanced >= m.path.length) {
            const targetTile = ensureTileExists(m.target.q, m.target.r);
            hero.q = m.target.q;
            hero.r = m.target.r;
            const originalMovement = m;
            handleHeroArrival(hero, targetTile);
            if (hero.movement === originalMovement) {
                hero.movement = undefined;
            }
            persistHeroes();
            continue;
        }
        if (stepsAdvanced < 0) continue; // not started yet
        const prevCoord = (stepsAdvanced === 0) ? m.origin : m.path[stepsAdvanced - 1]!;
        hero.prevPos = prevCoord;
        const currentCoord = m.path[stepsAdvanced];
        if (!currentCoord) continue;
        if (hero.q !== currentCoord.q || hero.r !== currentCoord.r) {
            const stepTile = ensureTileExists(currentCoord.q, currentCoord.r);
            if (stepTile.discovered && !isTileWalkable(stepTile)) {
                hero.movement = undefined;
                persistHeroes();
                continue;
            }
            const dq = currentCoord.q - prevCoord.q;
            const dr = currentCoord.r - prevCoord.r;
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

export function startHeroMovement(heroId: string, path: { q: number; r: number }[], target: { q: number; r: number }, taskType?: string) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;
    if (!path.length) return; // nothing to do
    if (hero.movement) {
        const m = hero.movement;
        if (m.target.q === target.q && m.target.r === target.r) {
            return; // already en route
        }
        if (m.stepDurations && m.cumulative) {
            const elapsed = performance.now() - m.startMs;
            if (elapsed < m.stepDurations[0]! * 0.5) return; // early in first step
        }
    }
    const originTile = ensureTileExists(hero.q, hero.r);
    const targetTile = ensureTileExists(target.q, target.r);
    if (!originTile.discovered && !targetTile.discovered) {
        const prev = hero.prevPos;
        const allow = prev && hexDistance(prev, target) === 1;
        if (!allow) return;
    }
    const baseStepMs = 550;
    const speedAdj = Math.max(0.5, 1 - hero.stats.spd * 0.04);
    const durations: number[] = [];
    for (let i = 0; i < path.length; i++) {
        const fromCoord = (i === 0) ? { q: hero.q, r: hero.r } : path[i - 1]!;
        const toCoord = path[i]!;
        const fromTile = ensureTileExists(fromCoord.q, fromCoord.r);
        const toTile = ensureTileExists(toCoord.q, toCoord.r);
        const fromDef = fromTile.terrain ? (TERRAIN_DEFS as any)[fromTile.terrain] : null;
        const toDef = toTile.terrain ? (TERRAIN_DEFS as any)[toTile.terrain] : null;
        const fromCost = fromDef && typeof fromDef.moveCost === 'number' ? fromDef.moveCost : 1;
        const toCost = toDef && typeof toDef.moveCost === 'number' ? toDef.moveCost : 1;
        const edgeCost = 0.5 * fromCost + 0.5 * toCost;
        durations.push(Math.max(120, baseStepMs * edgeCost * speedAdj));
    }
    const cumulative: number[] = [];
    let acc = 0;
    for (const d of durations) { acc += d; cumulative.push(acc); }
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    hero.movement = {
        path: path.slice(),
        origin: { q: hero.q, r: hero.r },
        target,
        taskType,
        startMs: performance.now(),
        stepMs: avg,
        stepDurations: durations,
        cumulative,
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

export function resetHeroes() {
    try {
        localStorage.removeItem(heroKey(currentWorldId));
    } catch {
    }
    for (const hero of heroes) {
        hero.q = 0;
        hero.r = 0;
        hero.facing = 'down';
        hero.movement = undefined;
        hero.currentTaskId = undefined;
        hero.prevPos = undefined;
        // Reset wood-carry state
        hero.carryingResources = false;
        hero.carryingPayload = undefined;
        hero.returnPos = undefined;
        // Restore baseline stats from seeds to clear progression
        const seed = seedHeroes.find(s => s.id === hero.id);
        if (seed) {
            hero.stats.xp = seed.stats.xp;
            hero.stats.hp = seed.stats.hp;
            hero.stats.atk = seed.stats.atk;
            hero.stats.spd = seed.stats.spd;
        } else {
            // Fallback: zero progression and keep reasonable defaults
            hero.stats.xp = 0;
        }
    }
    persistHeroes();
}

export function ensureHeroSelected(focus: boolean = true) {
    const current = selectedHeroId.value ? heroes.find(h => h.id === selectedHeroId.value) : null;
    const hero = current || heroes[0] || null;
    if (hero) {
        selectedHeroId.value = hero.id;
        if (focus) focusHero(hero);
    }
}
