import {heroes} from "../store/heroStore.ts";
import {moveCamera} from './camera.ts';
import {ensureTileExists, getTilesInRadius} from './world.ts';
import {TERRAIN_DEFS} from './terrainDefs.ts';
import {handleHeroArrival} from '../shared/tasks/tasks';
import {sendMessage} from "./socket.ts";
import type {MoveRequestMessage} from '../shared/protocol';
import {PathService} from "./PathService.ts";
import type {Tile} from "./types/Tile.ts";
import type {Hero, HeroStats} from "./types/Hero.ts";
import {addTextIndicator} from "./textIndicators.ts";
import {playPositionalSound} from "../store/soundStore.ts";

function isTileWalkable(tile: Tile): boolean {
    const variantDef = (tile.terrain && tile.variant)
        ? TERRAIN_DEFS[tile.terrain]?.variations?.find(v => v.key === tile.variant)
        : null;

    if (variantDef && typeof variantDef.walkable === 'boolean') {
        return variantDef.walkable;
    }

    return !!(tile.terrain && TERRAIN_DEFS[tile.terrain]?.walkable);
}

export function updateHeroMovements() {

    for (const hero of heroes) {
        if (!hero.movement) continue;

        const m = hero.movement;
        const cumulative = m.cumulative;

        const elapsed = Date.now() - m.startMs;
        // Determine number of COMPLETED steps (elapsed >= cumulative[i])
        let completedSteps = 0;
        for (let i = 0; i < cumulative.length; i++) {
            if (elapsed >= cumulative[i]!) completedSteps = i + 1;
            else break;
        }

        // Arrival if all steps completed
        if (completedSteps >= m.path.length) {
            // Move hero to final tile before arrival handling so path origin for any new movement is correct
            hero.q = m.target.q;
            hero.r = m.target.r;

            // Only clear movement if arrival did not start a new one
            if (hero.movement === m) {
                hero.movement = undefined;
            }

            continue;
        }

        const currentCoord = (completedSteps === 0) ? m.origin : m.path[completedSteps - 1]!;
        const nextCoord = m.path[completedSteps];
        if (nextCoord) {
            const nextTile = ensureTileExists(nextCoord.q, nextCoord.r);
            const isNextTarget = (nextCoord.q === m.target.q && nextCoord.r === m.target.r);
            if (nextTile.discovered && !isTileWalkable(nextTile) && !isNextTarget) {
                handleHeroArrival(hero, nextTile);
                hero.movement = undefined;
            }
        }
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
        }
    }
}

export function startHeroMovement(
    heroId: string,
    path: { q: number; r: number }[],
    target: { q: number; r: number },
    taskType?: string,
    options?: { startDelayMs?: number; stepDurations?: number[]; cumulative?: number[]; origin?: { q: number; r: number } }
) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;
    if (!path.length) return; // nothing to do

    // If already moving to the same target, ignore repeated requests
    if (hero.movement && hero.movement.target.q === target.q && hero.movement.target.r === target.r) {
        return;
    }

    // If hero currently moving, defer override to the next step boundary to avoid snapping
    if (hero.movement) {
        const m = hero.movement;
        const now = Date.now();
        let delay = 0;
        if (m.stepDurations && m.cumulative && m.stepDurations.length === m.path.length && m.cumulative.length === m.path.length) {
            const elapsed = now - m.startMs;
            // Determine current in-step progress
            let completedSteps = 0;
            for (let i = 0; i < m.cumulative.length; i++) {
                if (elapsed >= m.cumulative[i]!) completedSteps = i + 1; else break;
            }
            const nextBoundary = m.cumulative[Math.min(completedSteps, m.cumulative.length - 1)] || 0;
            delay = Math.max(0, nextBoundary - elapsed);
        } else {
            // Legacy uniform timing fallback
            const elapsed = now - m.startMs;
            const remainder = m.stepMs - (elapsed % m.stepMs);
            delay = Math.max(0, remainder);
        }
        if (hero.delayedMovementTimer) {
            clearTimeout(hero.delayedMovementTimer);
            hero.delayedMovementTimer = undefined;
        }
        hero.delayedMovementTimer = setTimeout(() => {
            // Ensure we still want to move and not already at target
            const h = heroes.find(hh => hh.id === heroId);
            if (!h) return;
            if (h.q === target.q && h.r === target.r) return;
            // Proceed to start movement from current tile at boundary
            actuallyStartHeroMovement(h, path, target, taskType, options);
            h.delayedMovementTimer = undefined;
        }, delay);
        return;
    }

    // If idle, start immediately
    actuallyStartHeroMovement(hero, path, target, taskType, options);
}

function actuallyStartHeroMovement(
    hero: Hero,
    path: { q: number; r: number }[],
    target: { q: number; r: number },
    taskType?: string,
    options?: { startDelayMs?: number; stepDurations?: number[]; cumulative?: number[]; origin?: { q: number; r: number } }
) {
    void taskType; // suppress unused parameter warning
    if (hero.delayedMovementTimer) {
        clearTimeout(hero.delayedMovementTimer);
        hero.delayedMovementTimer = undefined;
    }

    const originTile = ensureTileExists(hero.q, hero.r);
    const targetTile = ensureTileExists(target.q, target.r);
    const service = new PathService();
    if (!originTile.discovered && !targetTile.discovered) {
        // Closest discovered & walkable tile to hero's current position
        let allow = false;

        const neighbors = getTilesInRadius(originTile.q, originTile.r, 1);
        for (const neighborIdx in neighbors) {
            const neighbor = neighbors[neighborIdx];
            if (neighbor && neighbor.discovered && neighbor.terrain && TERRAIN_DEFS[neighbor.terrain]?.walkable) {
                const p = service.findWalkablePath(neighbor.q, neighbor.r, target.q, target.r);
                if (p.length > 0) {
                    allow = true;
                    break;
                }
            }
        }
        if (!allow) return;
    }

    // If server provided timings, use them; else compute locally
    let stepDurations: number[] | undefined = options?.stepDurations && options.stepDurations.length === path.length ? options.stepDurations.slice() : undefined;
    let cumulative: number[] | undefined = options?.cumulative && options.cumulative.length === path.length ? options.cumulative.slice() : undefined;

    if (!stepDurations || !cumulative) {
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
        const cum: number[] = [];
        let acc = 0;
        for (const d of durations) { acc += d; cum.push(acc); }
        stepDurations = durations;
        cumulative = cum;
    }

    const startDelayMs = options?.startDelayMs || 0;
    const origin = options?.origin || { q: hero.q, r: hero.r };

    hero.movement = {
        path: path.slice(),
        origin,
        target,
        taskType,
        startMs: Date.now() + startDelayMs,
        stepDurations,
        cumulative,
    } as any;
}

export function requestHeroMovement(
    heroId: string,
    path: { q: number; r: number }[],
    target: { q: number; r: number },
    taskType?: string
) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;
    const msg: MoveRequestMessage = {
        type: 'hero:move_request',
        heroId,
        origin: {q: hero.q, r: hero.r},
        target,
        startAt: Date.now(),
        path: path.slice(),
        task: taskType as any,
    } as any;
    sendMessage(msg as any);
}

export function focusHero(hero: Hero) {
    moveCamera(hero.q, hero.r);
}

export function updateHeroFacing(id: string, facing: Hero['facing']) {
    const hero = heroes.find(h => h.id === id);
    if (hero) hero.facing = facing;
}
export function rewardStat(hero: Hero, stat: keyof Hero['stats'], amount: number) {
    hero.stats[stat] += amount;

    setTimeout(() => {
        addTextIndicator(hero, `+${amount}`, STAT_COLOR_MAP[stat], 1800);
    }, Math.random() * 300);

    playPositionalSound(
        hero.id + ':stat_up',
        'success.mp3',
        hero.q,
        hero.r,
        { baseVolume: 0.35 }
    )
}

const STAT_COLOR_MAP: Record<keyof HeroStats, string> = {
    xp: '#FFD700', // Gold for XP
    hp: '#FF4500', // OrangeRed for HP
    atk: '#1E90FF', // DodgerBlue for ATK
    spd: '#32CD32', // LimeGreen for SPD
}
