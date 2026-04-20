import type {Socket} from 'socket.io';
import {broadcast, serverMessageRouter} from '../messages/messageRouter';
import type {MoveRequestMessage, PathUpdateMessage} from '../../../src/shared/protocol';
import {handleHeroArrival} from "../../../src/shared/tasks/tasks";
import { ensureTileExists, getTile } from '../../../src/shared/game/world';
import { getHero, heroes } from "../../../src/shared/game/state/heroStore";
import { detachHeroFromCurrentTask, getTaskByTile, joinTask, startTask, updateActiveTasks } from "../../../src/shared/game/state/taskStore";
import { PathService } from "../../../src/shared/game/PathService";
import type {TaskType} from "../../../src/shared/game/types/Task";
import type {Hero} from "../../../src/shared/game/types/Hero";
import { computePathTimings, isTileScoutWalkable, isWalkablePosition } from '../../../src/shared/game/navigation';
import { HERO_MOVEMENT_SPEED_ADJ } from '../../../src/shared/game/movementBalance';
import { isAxialNeighbor } from '../../../src/shared/game/hex';
import { getTaskDefinition } from '../../../src/shared/tasks/taskRegistry';
import { isHeroAtTaskAccess } from '../../../src/shared/tasks/taskAccess';
import { canStartTaskDefinition } from '../../../src/shared/tasks/taskAvailability';
import { coopState } from '../state/coopState';
import { SCOUT_RESOURCE_TASK_TYPE } from '../../../src/shared/game/scoutResources';
import type { MoveHeroRuntimeOptions } from '../../../src/shared/game/runtime';

export class ServerMovementHandler {
    private initialized = false;

    activeMovements: Map<string, {
        heroId: string;
        origin: { q: number; r: number };
        startedAt: number;
        target: { q: number; r: number };
        path: { q: number; r: number }[];
        stepDurations: number[];
        totalDuration: number;
        task?: TaskType;
        exploreTarget?: { q: number; r: number };
    }> = new Map();

    constructor() {
    }

    init(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        serverMessageRouter.on('hero:move_request', this.handleMoveRequest.bind(this));
    }

    private canUseNonWalkableTaskTarget(
        hero: Hero,
        target: { q: number; r: number },
        task?: TaskType,
        taskLocation?: { q: number; r: number },
    ): boolean {
        if (!task) return false;

        const tile = getTileForTaskPosition(taskLocation ?? target, task);
        if (!tile) return false;

        const existing = getTaskByTile(tile.id, task);
        const def = getTaskDefinition(task);
        if (!canStartTaskDefinition(def, tile, hero)) {
            return false;
        }

        if (existing && !existing.completedMs) {
            return true;
        }
        return true;
    }

    private handleMoveRequest(socket: Socket, message: MoveRequestMessage): void {
        const {heroId, origin: requestedOrigin, target, path: clientPath} = message;

        // Basic validation of origin/target
        if (!requestedOrigin || !target) return;

        // Validate current hero position matches origin
        const hero = getHero(heroId);

        if (!hero) {
            return;
        }

        if (!coopState.canControlHero(socket.id, heroId)) {
            return;
        }

        coopState.touchHeroActivity(heroId);

        if (Math.abs(hero.q - requestedOrigin.q) > 1 || Math.abs(hero.r - requestedOrigin.r) > 1) return;

        // Always build the authoritative movement plan from the server's actual hero position.
        const origin = { q: hero.q, r: hero.r };

        const targetTile = getTileForTaskPosition(target, message.task);
        if (!targetTile) {
            return;
        }

        const logicalTaskTarget = message.taskLocation ?? target;
        const logicalTaskTile = getTileForTaskPosition(logicalTaskTarget, message.task);
        const isScoutMovement = message.task === SCOUT_RESOURCE_TASK_TYPE;
        const canUseTaskTarget = this.canUseNonWalkableTaskTarget(hero, target, message.task, logicalTaskTarget);
        const exploreTarget = normalizeExploreTarget(message.task, message.exploreTarget);
        if (!isMovementWalkablePosition(target.q, target.r, message.task) && !canUseTaskTarget && !isScoutMovement) return;

        let path: { q: number; r: number }[] = [];
        if (clientPath && Array.isArray(clientPath) && clientPath.length) {
            const sanitizedClientPath = sanitizePath(clientPath, origin);
            let valid = true;
            let prev = origin;
            for (const step of sanitizedClientPath) {
                const isNeighbor = isAxialNeighbor(prev, step);
                const isTarget = (step.q === target.q && step.r === target.r);
                if (!isNeighbor || (!isTarget && !isMovementWalkablePosition(step.q, step.r, message.task))) {
                    valid = false;
                    break;
                }
                prev = step;
            }
            if (valid && prev.q === target.q && prev.r === target.r) {
                path = sanitizedClientPath.slice();
            }
        }

        if (!path.length) {
            path = this.getPathService().findWalkablePath(origin.q, origin.r, target.q, target.r, getMovementPathOptions(message.task));
        }

        if (!path.length) return;

        const now = Date.now();
        const startAt = clampMovementStart(message.startAt, now);

        const {durations, cumulative} = computePathTimings(path, origin, HERO_MOVEMENT_SPEED_ADJ);

        hero.pendingTask = message.task
            ? { tileId: logicalTaskTile?.id ?? targetTile.id, taskType: message.task }
            : undefined;
        hero.pendingExploreTarget = exploreTarget;
        detachHeroFromCurrentTask(hero);
        hero.delayedMovementTimer = undefined;
        this.registerMovement(
            heroId,
            target,
            path,
            durations,
            origin,
            startAt,
            message.task,
            message.id,
            message.task ? (logicalTaskTile?.id ?? targetTile.id) : undefined,
            exploreTarget,
        );

        const startDelayMs = Math.max(0, startAt - now);

        // Broadcast to all clients
        const update: PathUpdateMessage = {
            type: 'hero:path_update',
            id: message.id,
            heroId,
            origin,
            path,
            target,
            startAt,
            startDelayMs,
            stepDurations: durations,
            cumulative,
            task: message.task,
            taskLocation: message.task ? logicalTaskTarget : undefined,
            exploreTarget,
        };
        broadcast(update);

        updateActiveTasks(heroes);
    }

    public moveHero(
        hero: Hero,
        target: { q: number, r: number },
        task ?: TaskType,
        taskLocation?: { q: number; r: number },
        options?: MoveHeroRuntimeOptions,
    ) {
        const targetTile = getTile(target);
        if (!targetTile) {
            return;
        }

        const logicalTaskTarget = taskLocation ?? target;
        const logicalTaskTile = getTile(logicalTaskTarget);
        const exploreTarget = task === 'explore' && hero.pendingExploreTarget
            ? { ...hero.pendingExploreTarget }
            : undefined;

        if (hero.q === target.q && hero.r === target.r) {
            if (task && logicalTaskTile && isHeroAtTaskAccess(hero, task, logicalTaskTile)) {
                const existing = getTaskByTile(logicalTaskTile.id, task);
                if (!existing) {
                    startTask(logicalTaskTile, task, hero);
                } else {
                    joinTask(existing.id, hero);
                }
                updateActiveTasks(heroes);
            }
            return;
        }

        const path = this.getPathService().findWalkablePath(hero.q, hero.r, target.q, target.r, getMovementPathOptions(task, options));

        if (!path || !path.length) {
            return;
        }

        const {durations, cumulative} = computePathTimings(path, hero, 1);
        const origin = {q: hero.q, r: hero.r};
        const targetPosition = {q: target.q, r: target.r};
        const startAt = Date.now();

        if (task) {
            hero.pendingTask = {
                tileId: logicalTaskTile?.id ?? targetTile.id,
                taskType: task,
            };
        }
        detachHeroFromCurrentTask(hero);
        this.registerMovement(
            hero.id,
            targetPosition,
            path,
            durations,
            origin,
            startAt,
            task,
            undefined,
            task ? (logicalTaskTile?.id ?? targetTile.id) : undefined,
            exploreTarget,
        );
        broadcast({
            type: 'hero:path_update',
            heroId: hero.id,
            origin,
            path,
            target: targetPosition,
            startAt,
            startDelayMs: 0,
            stepDurations: durations,
            cumulative,
            task,
            taskLocation: task ? logicalTaskTarget : undefined,
            exploreTarget,
        } as PathUpdateMessage)

        updateActiveTasks(heroes);
    }

    _service: PathService | null = null;

    private getPathService(): PathService {
        if (!this._service) this._service = new PathService();
        return this._service;
    }

    private registerMovement(
        heroId: string,
        target: { q: number; r: number },
        path: { q: number; r: number }[],
        durations: number[],
        origin: { q: number, r: number },
        startAt: number,
        task?: TaskType,
        requestId?: string,
        pendingTaskTileId?: string,
        exploreTarget?: { q: number; r: number },
    ): void {
        const totalDuration = durations.reduce((a, b) => a + b, 0);

        this.activeMovements.set(heroId, {
            heroId,
            origin,
            startedAt: startAt,
            target,
            path,
            stepDurations: durations,
            totalDuration,
            task,
            exploreTarget,
        });

        const cumulative: number[] = [];
        for (let i = 0; i < durations.length; i++) {
            const prev = i === 0 ? 0 : (cumulative[i - 1] as number);
            const cur = durations[i] as number;
            cumulative[i] = prev + cur;
        }

        const heroLocal = getHero(heroId);
        if (!heroLocal) return;
        if (task && pendingTaskTileId) {
            heroLocal.pendingTask = {
                tileId: pendingTaskTileId,
                taskType: task,
            };
        }
        heroLocal.pendingExploreTarget = task === 'explore' && exploreTarget
            ? { ...exploreTarget }
            : undefined;
        heroLocal.movement = {
            path: path.slice(),
            origin,
            target,
            taskType: task,
            startMs: startAt,
            stepDurations: durations,
            cumulative: cumulative,
            requestId,
            authoritative: true,
        }
    }

    public tick(now: number = Date.now()): void {

        // @ts-ignore
        for (const [heroId, movement] of this.activeMovements) {
            const hero = getHero(heroId);
            if (!hero) {
                continue;
            }

            const elapsedMs = now - movement.startedAt;
            if (elapsedMs < 0) {
                hero.q = movement.origin.q;
                hero.r = movement.origin.r;
                continue;
            }

            // Update hero position along path based on elapsed time
            let accumulatedMs = 0;
            let completedSteps = 0;
            while (completedSteps < movement.path.length) {
                const stepDuration = movement.stepDurations[completedSteps];
                if (typeof stepDuration !== 'number') break;
                const stepEnd = accumulatedMs + stepDuration;
                if (elapsedMs < stepEnd) break;
                accumulatedMs = stepEnd;
                completedSteps++;
            }

            if (completedSteps < movement.path.length) {
                const currentCoord = completedSteps === 0
                    ? movement.origin
                    : movement.path[completedSteps - 1]!;
                hero.q = currentCoord.q;
                hero.r = currentCoord.r;
            } else {
                hero.q = movement.target.q;
                hero.r = movement.target.r;
            }

            if (elapsedMs >= movement.totalDuration) {
                const tile = getTile(movement.target)

                if(!tile) {
                    continue;
                }

                this.activeMovements.delete(heroId);
                handleHeroArrival(hero, tile);
            }
        }

        // Loop over all heroes and remove movement if their movement has ended
        for (const hero of heroes) {
            if (this.activeMovements.has(hero.id)) {
                continue;
            }

            hero.movement = undefined;
        }
    }


    private static _instance: ServerMovementHandler;

    static getInstance(): ServerMovementHandler {
        if (!ServerMovementHandler._instance) {
            ServerMovementHandler._instance = new ServerMovementHandler();
        }
        return ServerMovementHandler._instance;
    }
}

function clampMovementStart(startAt: number | undefined, now: number) {
    if (typeof startAt !== 'number' || Number.isNaN(startAt)) {
        return now;
    }

    return Math.max(now - 2000, Math.min(startAt, now + 250));
}

function sanitizePath(path: Array<{ q: number; r: number }>, origin: { q: number; r: number }) {
    const normalized: Array<{ q: number; r: number }> = [];
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

function normalizeExploreTarget(task: TaskType | undefined, target: { q: number; r: number } | undefined) {
    if (task !== 'explore' || !target) {
        return undefined;
    }

    if (!Number.isFinite(target.q) || !Number.isFinite(target.r)) {
        return undefined;
    }

    return {
        q: Math.trunc(target.q),
        r: Math.trunc(target.r),
    };
}

function getMovementPathOptions(task: TaskType | undefined, options?: MoveHeroRuntimeOptions) {
    return task === SCOUT_RESOURCE_TASK_TYPE || options?.allowScouted
        ? { allowScouted: true }
        : {};
}

function isMovementWalkablePosition(q: number, r: number, task: TaskType | undefined) {
    if (task === SCOUT_RESOURCE_TASK_TYPE) {
        return isTileScoutWalkable(getTile({ q, r }));
    }

    return isWalkablePosition(q, r);
}

function getTileForTaskPosition(position: { q: number; r: number }, task: TaskType | undefined) {
    if (!Number.isFinite(position.q) || !Number.isFinite(position.r)) {
        return null;
    }

    if (task === 'explore' || task === SCOUT_RESOURCE_TASK_TYPE) {
        return ensureTileExists(Math.trunc(position.q), Math.trunc(position.r));
    }

    return getTile(position);
}
