import {heroes} from "../store/heroStore.ts";
import {moveCamera} from './camera.ts';
import {ensureTileExists, getTilesInRadius} from './world.ts';
import {handleHeroArrival} from '../shared/tasks/tasks';
import {sendMessage} from "./socket.ts";
import type {HeroAbilityUseMessage, MoveRequestMessage, StartTaskRequestMessage} from '../shared/protocol';
import {PathService} from "./PathService.ts";
import type {Hero, HeroPendingTaskIntent, HeroStats} from "./types/Hero.ts";
import type { ResourceType } from './types/Resource.ts';
import {addTextIndicator} from "./textIndicators.ts";
import {playPositionalSound} from "../store/soundStore.ts";
import { computePathTimings, isTileWalkable } from '../shared/game/navigation';
import { HERO_MOVEMENT_SPEED_ADJ } from '../shared/game/movementBalance';
import { SCOUT_RESOURCE_TASK_TYPE, shouldStopScoutResourceForMovement } from '../shared/game/scoutResources';
import type { HeroAbilityKey } from '../shared/heroes/heroAbilities.ts';

type AxialCoord = { q: number; r: number };

type StartHeroMovementOptions = {
    startAt?: number;
    startDelayMs?: number;
    stepDurations?: number[];
    cumulative?: number[];
    origin?: AxialCoord;
    requestId?: string;
    authoritative?: boolean;
    taskLocation?: AxialCoord;
    exploreTarget?: AxialCoord;
};

export function updateHeroMovements(nowMs: number = Date.now()) {

    for (const hero of heroes) {
        if (!hero.movement) continue;

        const m = hero.movement;
        const cumulative = m.cumulative;

        const elapsed = nowMs - m.startMs;
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

export function startTaskRequest(
    heroId: string,
    taskType: string,
    location: { q: number; r: number },
    exploreTarget?: { q: number; r: number },
) {
    const hero = heroes.find(h => h.id === heroId);
    if (hero && taskType === 'explore' && exploreTarget) {
        hero.pendingExploreTarget = { ...exploreTarget };
    }

    const msg: StartTaskRequestMessage = {
        type: 'task:request_start',
        heroId,
        task: taskType as any,
        location,
        exploreTarget,
    } as any;
    sendMessage(msg as any);
}

export function startHeroMovement(
    heroId: string,
    path: { q: number; r: number }[],
    target: { q: number; r: number },
    taskType?: string,
    options?: StartHeroMovementOptions
) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;

    const origin = options?.origin || { q: hero.q, r: hero.r };
    const normalizedPath = sanitizeMovementPath(path, origin);
    if (!normalizedPath.length) return; // nothing to do

    if (
        !hero.movement
        && options?.authoritative
        && hero.q === target.q
        && hero.r === target.r
        && hasMovementAlreadyElapsed(normalizedPath, origin, options)
    ) {
        return;
    }

    if (hero.movement && isSameMovementPlan(hero.movement, normalizedPath, target, origin, options?.requestId)) {
        reconcileMovement(hero, normalizedPath, target, taskType, origin, options);
        return;
    }

    // Server-authoritative corrections should replace stale local movement immediately.
    if (hero.movement && options?.authoritative) {
        actuallyStartHeroMovement(hero, normalizedPath, target, taskType, options);
        return;
    }

    // If hero currently moving, defer override to the next step boundary to avoid snapping
    if (hero.movement) {
        const m = hero.movement;
        const now = Date.now();
        let delay = 0;

        const elapsed = now - m.startMs;
        // Determine current in-step progress
        let completedSteps = 0;
        for (let i = 0; i < m.cumulative.length; i++) {
            if (elapsed >= m.cumulative[i]!) completedSteps = i + 1; else break;
        }
        const nextBoundary = m.cumulative[Math.min(completedSteps, m.cumulative.length - 1)] || 0;
        delay = Math.max(0, nextBoundary - elapsed);

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
            actuallyStartHeroMovement(h, normalizedPath, target, taskType, options);
            h.delayedMovementTimer = undefined;
        }, delay);
        return;
    }

    // If idle, start immediately
    actuallyStartHeroMovement(hero, normalizedPath, target, taskType, options);
}

function actuallyStartHeroMovement(
    hero: Hero,
    path: { q: number; r: number }[],
    target: { q: number; r: number },
    taskType?: string,
    options?: StartHeroMovementOptions
) {
    if (hero.delayedMovementTimer) {
        clearTimeout(hero.delayedMovementTimer);
        hero.delayedMovementTimer = undefined;
    }

    const originTile = ensureTileExists(hero.q, hero.r);
    const targetTile = ensureTileExists(target.q, target.r);
    const isScoutMovement = taskType === SCOUT_RESOURCE_TASK_TYPE;
    const service = new PathService();
    if (!isScoutMovement && !originTile.discovered && !targetTile.discovered) {
        return;
    }

    if (isScoutMovement && !originTile.discovered && !originTile.scouted && !targetTile.discovered && !targetTile.scouted) {
        // Closest discovered & walkable tile to hero's current position
        let allow = false;

        const neighbors = getTilesInRadius(originTile.q, originTile.r, 1);
        for (const neighborIdx in neighbors) {
            const neighbor = neighbors[neighborIdx];
            if (neighbor && (neighbor.discovered || neighbor.scouted)) {
                const p = service.findWalkablePath(neighbor.q, neighbor.r, target.q, target.r, { allowScouted: true });
                if (p.length > 0) {
                    allow = true;
                    break;
                }
            }
        }
        if (!allow) return;
    }

    const origin = options?.origin || { q: hero.q, r: hero.r };

    // If server provided timings, use them; else compute locally
    let stepDurations: number[] | undefined = options?.stepDurations && options.stepDurations.length === path.length ? options.stepDurations.slice() : undefined;
    let cumulative: number[] | undefined = options?.cumulative && options.cumulative.length === path.length ? options.cumulative.slice() : undefined;

    if (!stepDurations || !cumulative) {
        const timings = computePathTimings(path, origin, HERO_MOVEMENT_SPEED_ADJ);
        stepDurations = timings.durations;
        cumulative = timings.cumulative;
    }

    const startDelayMs = options?.startDelayMs || 0;
    const startMs = typeof options?.startAt === 'number'
        ? options.startAt
        : Date.now() + startDelayMs;

    syncPendingTask(hero, target, taskType, options);

    hero.movement = {
        path: path.slice(),
        origin,
        target,
        taskType,
        startMs,
        stepDurations,
        cumulative,
        requestId: options?.requestId,
        authoritative: options?.authoritative ?? false,
    };
}

export function requestHeroMovement(
    heroId: string,
    path: { q: number; r: number }[],
    target: { q: number; r: number },
    taskType?: string,
    taskLocation?: { q: number; r: number },
    exploreTarget?: { q: number; r: number },
) {
    const hero = heroes.find(h => h.id === heroId);
    if (!hero) return;

    const origin = { q: hero.q, r: hero.r };
    const normalizedPath = sanitizeMovementPath(path, origin);
    const stopsScouting = shouldStopScoutResourceForMovement(hero, taskType);
    if (stopsScouting) {
        hero.scoutResourceIntent = undefined;
        hero.pendingExploreTarget = undefined;
        if (hero.pendingTask?.taskType === SCOUT_RESOURCE_TASK_TYPE) {
            hero.pendingTask = undefined;
        }
    }

    // If there is no path (hero already at target), request immediate task start
    if (!normalizedPath.length) {
        if (stopsScouting && !taskType) {
            const startAt = Date.now();
            const requestId = createMovementRequestId(heroId);
            sendMessage({
                type: 'hero:move_request',
                id: requestId,
                heroId,
                origin,
                target,
                startAt,
                path: [],
            } as MoveRequestMessage);
            return;
        }
        if (taskType) startTaskRequest(heroId, taskType, taskLocation ?? target, exploreTarget);
        return;
    }

    const startAt = Date.now();
    const requestId = createMovementRequestId(heroId);

    const msg: MoveRequestMessage = {
        type: 'hero:move_request',
        id: requestId,
        heroId,
        origin,
        target,
        startAt,
        path: normalizedPath.slice(),
        task: taskType as any,
        taskLocation,
        exploreTarget,
    };
    sendMessage(msg as any);
}

export function requestHeroScoutResource(heroId: string, resourceType: ResourceType) {
    const hero = heroes.find(h => h.id === heroId);
    if (hero) {
        hero.scoutResourceIntent = { resourceType };
        hero.pendingExploreTarget = undefined;
    }

    sendMessage({
        type: 'hero:scout_resource_request',
        heroId,
        resourceType,
        timestamp: Date.now(),
    });
}

export function requestHeroAbilityUse(
    heroId: string,
    ability: HeroAbilityKey,
    target: { tileId?: string; taskId?: string } = {},
) {
    const message: HeroAbilityUseMessage = {
        type: 'hero:ability_use',
        heroId,
        ability,
        tileId: target.tileId,
        taskId: target.taskId,
        timestamp: Date.now(),
    };

    sendMessage(message);
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

function createMovementRequestId(heroId: string) {
    return `${heroId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function isSameMovementPlan(
    movement: NonNullable<Hero['movement']>,
    path: AxialCoord[],
    target: AxialCoord,
    origin: AxialCoord,
    requestId?: string
) {
    if (requestId && movement.requestId === requestId) return true;
    return sameCoord(movement.origin, origin)
        && sameCoord(movement.target, target)
        && samePath(movement.path, path);
}

function reconcileMovement(
    hero: Hero,
    path: AxialCoord[],
    target: AxialCoord,
    taskType: string | undefined,
    origin: AxialCoord,
    options?: StartHeroMovementOptions
) {
    const movement = hero.movement;
    if (!movement) return;

    movement.path = path.slice();
    movement.origin = origin;
    movement.target = target;
    movement.taskType = taskType;
    syncPendingTask(hero, target, taskType, options);

    if (options?.stepDurations && options.stepDurations.length === path.length) {
        movement.stepDurations = options.stepDurations.slice();
    }

    if (options?.cumulative && options.cumulative.length === path.length) {
        movement.cumulative = options.cumulative.slice();
    }

    if (typeof options?.startAt === 'number') {
        movement.startMs = options.startAt;
    } else if (typeof options?.startDelayMs === 'number') {
        movement.startMs = Date.now() + options.startDelayMs;
    }

    if (options?.requestId) {
        movement.requestId = options.requestId;
    }

    if (typeof options?.authoritative === 'boolean') {
        movement.authoritative = options.authoritative;
    }
}

function sameCoord(a: AxialCoord, b: AxialCoord) {
    return a.q === b.q && a.r === b.r;
}

function samePath(a: AxialCoord[], b: AxialCoord[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!sameCoord(a[i]!, b[i]!)) return false;
    }
    return true;
}

function hasMovementAlreadyElapsed(path: AxialCoord[], origin: AxialCoord, options?: StartHeroMovementOptions) {
    const totalDuration = options?.cumulative?.[options.cumulative.length - 1]
        ?? options?.stepDurations?.reduce((sum, duration) => sum + duration, 0)
        ?? computePathTimings(path, origin, HERO_MOVEMENT_SPEED_ADJ).totalDuration;
    const startMs = typeof options?.startAt === 'number'
        ? options.startAt
        : Date.now() + (options?.startDelayMs || 0);
    return Date.now() >= startMs + totalDuration;
}

function syncPendingTask(
    hero: Hero,
    target: AxialCoord,
    taskType: string | undefined,
    options?: StartHeroMovementOptions,
) {
    if (taskType) {
        const logicalTarget = options?.taskLocation ?? target;
        hero.pendingTask = {
            tileId: ensureTileExists(logicalTarget.q, logicalTarget.r).id,
            taskType,
        } as HeroPendingTaskIntent;
        hero.pendingExploreTarget = taskType === 'explore' && options?.exploreTarget
            ? { ...options.exploreTarget }
            : undefined;
        return;
    }

    hero.pendingExploreTarget = undefined;
    if (!options?.authoritative) {
        hero.pendingTask = undefined;
    }
}

function sanitizeMovementPath(path: AxialCoord[], origin: AxialCoord) {
    const normalized: AxialCoord[] = [];
    let previous = origin;

    for (const step of path) {
        if (step.q === previous.q && step.r === previous.r) {
            continue;
        }

        normalized.push(step);
        previous = step;
    }

    return normalized;
}
