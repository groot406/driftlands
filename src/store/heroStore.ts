import {reactive, ref} from 'vue';
import {moveCamera} from '../core/camera';
import santa from '../assets/heroes/santa.png';
import boy from '../assets/heroes/boy.png';
import girl from '../assets/heroes/girl.png';
import loophead from '../assets/heroes/loophead.png';
import {getTilesInRadius, type ResourceType, type Tile} from '../core/world';
import {ensureTileExists} from '../core/world';
import {TERRAIN_DEFS} from '../core/terrainDefs';
import {handleHeroArrival} from '../core/tasks';
import {HexMapService} from "../core/HexMapService.ts";
import {playPositionalSound, removePositionalSound} from './soundStore';
import walkingSound from '../assets/sounds/walking.mp3';
import {taskStore} from './taskStore';

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
    carryingPayload?: { type: ResourceType; amount: number }; // new payload model for carried resources
    pendingChain?: { sourceTileId: string; taskType: string }; // defer auto-chain until after delivery
    returnPos?: { q: number; r: number }; // restore optional original position for return flows
    delayedMovementTimer?: ReturnType<typeof setTimeout>;
    currentOffset?: { x: number; y: number }; // store current pixel offset for rendering hero related things
    lastActivity?: 'idle' | 'walk' | 'attack'; // track last known activity for sound management
}

// Seed heroes at town center (future differentiation can randomize slight offsets)
const seedHeroes: Hero[] = [
    {id: 'h1', name: 'Santa',avatar: santa,q: 0,r: 0,stats: {xp: 0, hp: 100, atk: 10, spd: 1},facing: 'down',},
    {id: 'h2', name: 'Harm', avatar: boy, q: 0, r: 0, stats: {xp: 0, hp: 100, atk: 10, spd: 1}, facing: 'down'},
    {id: 'h3', name: 'Jess', avatar: girl, q: 0, r: 0, stats: {xp: 0, hp: 100, atk: 10, spd: 1}, facing: 'down'},
    {id: 'h4', name: 'Jacky', avatar: loophead, q: 0, r: 0, stats: {xp: 0, hp: 100, atk: 10, spd: 1}, facing: 'down'},
];

export const heroes = reactive<Hero[]>(seedHeroes);

const LEGACY_HERO_KEY = 'driftlands_heroes_v1';
let currentWorldId: string = 'default';

function heroKey(worldId: string) {
    return `driftlands_heroes_${worldId}_v1`;
}

function migrateLegacyIfNeeded(worldId: string) {
    try {
        const legacyRaw = localStorage.getItem(LEGACY_HERO_KEY);
        if (!legacyRaw) return;
        const targetKey = heroKey(worldId);
        if (localStorage.getItem(targetKey)) return; // already has world-specific save
        localStorage.setItem(targetKey, legacyRaw);
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
            carryingPayload: h.carryingPayload ? {...h.carryingPayload} : undefined,
            pendingChain: h.pendingChain ? {...h.pendingChain} : undefined,
            returnPos: h.returnPos ? {...h.returnPos} : undefined,
            stats: {...h.stats},
        }));
        localStorage.setItem(heroKey(currentWorldId), JSON.stringify({
            heroes: plain,
            ts: Date.now(),
            worldId: currentWorldId
        }));
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
            // restore currentTaskId safely (may be stale if task was removed; taskStore will reconcile)
            if (typeof saved.currentTaskId === 'string') {
                hero.currentTaskId = saved.currentTaskId;
            } else {
                hero.currentTaskId = undefined;
            }

            const savedHasPayload = saved.carryingPayload && typeof saved.carryingPayload.type === 'string' && typeof saved.carryingPayload.amount === 'number';
            if (savedHasPayload) {
                hero.carryingPayload = {type: saved.carryingPayload.type, amount: saved.carryingPayload.amount};
            } else {
                hero.carryingPayload = undefined;
            }

            if (saved.pendingChain && typeof saved.pendingChain.sourceTileId === 'string' && typeof saved.pendingChain.taskType === 'string') {
                hero.pendingChain = {
                    sourceTileId: saved.pendingChain.sourceTileId,
                    taskType: saved.pendingChain.taskType
                };
            } else {
                hero.pendingChain = undefined;
            }
            if (saved.returnPos && typeof saved.returnPos.q === 'number' && typeof saved.returnPos.r === 'number') {
                hero.returnPos = {q: saved.returnPos.q, r: saved.returnPos.r};
            } else {
                hero.returnPos = undefined;
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
                    updateHeroActivity(hero);
                }
                persistHeroes();
                continue;
            }
            // Current coord = last fully completed tile (origin if none yet)
            const currentCoord = (completedSteps === 0) ? m.origin : m.path[completedSteps - 1]!;
            const nextCoord = m.path[completedSteps]; // in-progress destination (not yet reached)

            // Validate destination walkability ahead of time
            if (nextCoord) {
                const nextTile = ensureTileExists(nextCoord.q, nextCoord.r);
                if (nextTile.discovered && !isTileWalkable(nextTile)) {
                    hero.movement = undefined;
                    updateHeroActivity(hero);
                    persistHeroes();
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
                updateHeroActivity(hero);
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
                updateHeroActivity(hero);
            }
            persistHeroes();
            continue;
        }
        if (stepsAdvanced < 0) continue; // not started yet

        const currentCoord = m.path[stepsAdvanced];
        if (!currentCoord) continue;
        if (hero.q !== currentCoord.q || hero.r !== currentCoord.r) {
            const stepTile = ensureTileExists(currentCoord.q, currentCoord.r);
            if (stepTile.discovered && !isTileWalkable(stepTile)) {
                hero.movement = undefined;
                updateHeroActivity(hero);
                persistHeroes();
                continue;
            }
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
            updateHeroActivity(hero);
            persistHeroes();
        }
    }
}

export function startHeroMovement(heroId: string, path: { q: number; r: number }[], target: {
    q: number;
    r: number
}, taskType?: string) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;
    if (!path.length) return; // nothing to do

    if(hero.delayedMovementTimer) {
        clearTimeout(hero.delayedMovementTimer);
        hero.delayedMovementTimer = undefined;
    }

    if (hero.movement) {
        const m = hero.movement;
        if (m.target.q === target.q && m.target.r === target.r) {
            return; // already en route
        }
        if (m.stepDurations && m.cumulative) {
            const elapsed = performance.now() - m.startMs;
            if (elapsed < m.stepDurations[0]! * 0.5) return; // early in first step
        }
        // Update activity when overriding movement
        updateHeroActivity(hero);
    }
    const originTile = ensureTileExists(hero.q, hero.r);
    const targetTile = ensureTileExists(target.q, target.r);
    const service = new HexMapService();
    if (!originTile.discovered && !targetTile.discovered) {
        // Closest discovered & walkable tile to hero's current position
        let allow = false;

        const neighbors = getTilesInRadius(originTile.q, originTile.r, 1);
        for (const neighborIdx in neighbors) {
            const neighbor = neighbors[neighborIdx];
            if (neighbor && neighbor.discovered && neighbor.terrain && TERRAIN_DEFS[neighbor.terrain]?.walkable) {
                const path = service.findWalkablePath(neighbor.q, neighbor.r, target.q, target.r);
                if (path.length > 0) {
                    allow = true
                    break;
                }
            }
        }
        if (!allow) return;
    }
    const baseStepMs = 750;
    const speedAdj = Math.max(0.5, 1 - hero.stats.spd * 0.04);
    const durations: number[] = [];
    for (let i = 0; i < path.length; i++) {
        const fromCoord = (i === 0) ? {q: hero.q, r: hero.r} : path[i - 1]!;
        const toCoord = path[i]!;
        const fromTile = ensureTileExists(fromCoord.q, fromCoord.r);
        const toTile = ensureTileExists(toCoord.q, toCoord.r);
        const fromDef = fromTile.terrain ? (TERRAIN_DEFS as any)[fromTile.terrain] : null;
        const toDef = toTile.terrain ? (TERRAIN_DEFS as any)[toTile.terrain] : null;
        const fromCost = fromDef && typeof fromDef.moveCost === 'number' ? fromDef.moveCost : 1;
        const toCost = toDef && typeof toDef.moveCost === 'number' ? toDef.moveCost : 1;
        const edgeCost = 0.5 * fromCost + 0.5 * toCost;
        durations.push(Math.min(Math.max(120, baseStepMs * edgeCost * speedAdj), 5000));
    }
    const cumulative: number[] = [];
    let acc = 0;
    for (const d of durations) {
        acc += d;
        cumulative.push(acc);
    }
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    hero.movement = {
        path: path.slice(),
        origin: {q: hero.q, r: hero.r},
        target,
        taskType,
        startMs: performance.now(),
        stepMs: avg,
        stepDurations: durations,
        cumulative,
    };

    // Update activity and manage walking sound
    updateHeroActivity(hero);

    persistHeroes();
}

export function focusHero(hero: Hero) {
    moveCamera(hero.q, hero.r);
}

export const selectedHeroId = ref<string | null>(null);

export function selectHero(hero: Hero | null, focus: boolean = true) {
    if (hero) {
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
        // Stop any walking sounds
        stopWalkingSound(hero);
        hero.q = 0;
        hero.r = 0;
        hero.facing = 'down';
        hero.movement = undefined;
        hero.currentTaskId = undefined;
        // Reset wood-carry state
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

// Walking sound management
function getWalkingSoundId(heroId: string): string {
    return `walking-${heroId}`;
}

function startWalkingSound(hero: Hero) {
    const soundId = getWalkingSoundId(hero.id);
    playPositionalSound(soundId, walkingSound, hero.q, hero.r, {
        baseVolume: 1,
        maxDistance: 8,
        loop: true
    });
}

function stopWalkingSound(hero: Hero) {
    const soundId = getWalkingSoundId(hero.id);
    removePositionalSound(soundId);
}

function updateWalkingSoundPosition(hero: Hero) {
    if (!hero.movement) return;
    const soundId = getWalkingSoundId(hero.id);
    // Remove and restart the sound at new position to update its location
    removePositionalSound(soundId);
    playPositionalSound(soundId, walkingSound, hero.q, hero.r, {
        baseVolume: 1,
        maxDistance: 12,
        loop: true
    });
}

// Determine current hero activity (same logic as HexMapService rendering)
function determineHeroActivity(hero: Hero): 'idle' | 'walk' | 'attack' {
    let remaining = hero.movement ? hero.movement.path.length : 0;
    let activity: 'idle' | 'walk' | 'attack' = remaining > 0 ? 'walk' : 'idle';

    // Check if hero has an active task - this overrides walk activity
    if (hero.currentTaskId) {
        const taskInstance = taskStore.taskIndex[hero.currentTaskId];
        if (taskInstance && taskInstance.active && !taskInstance.completedMs) {
            activity = 'attack';
        }
    }

    return activity;
}

// Update hero activity and manage walking sounds accordingly
function updateHeroActivity(hero: Hero) {
    const currentActivity = determineHeroActivity(hero);
    const previousActivity = hero.lastActivity;
    const previousPosition = {q: hero.q, r: hero.r};

    // Update the activity
    hero.lastActivity = currentActivity;

    // Manage walking sound based on activity change
    if (currentActivity === 'walk' && previousActivity !== 'walk') {
        // Started walking
        startWalkingSound(hero);
    } else if (currentActivity !== 'walk' && previousActivity === 'walk') {
        // Stopped walking
        stopWalkingSound(hero);
    } else if (currentActivity === 'walk' && previousActivity === 'walk') {
        // Continue walking - update position
        if(previousPosition.q !== hero.q || previousPosition.r !== hero.r) {
            updateWalkingSoundPosition(hero);
        }
    }
}

// Update all heroes' activities - should be called periodically to catch task state changes
export function updateAllHeroActivities() {
    for (const hero of heroes) {
        updateHeroActivity(hero);
    }
}




