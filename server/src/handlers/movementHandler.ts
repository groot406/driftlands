import type {Socket} from 'socket.io';
import {broadcast, serverMessageRouter} from '../messages/messageRouter';
import type {MoveRequestMessage, PathUpdateMessage} from '../../../src/shared/protocol';
import {getTile, tiles} from '../../../src/core/world';
import {TERRAIN_DEFS} from '../../../src/core/terrainDefs';
import {getHero, heroes} from "../../../src/store/heroStore";
import {type TaskType} from "../../../src/core/types/Task";
import {handleHeroArrival} from "../../../src/shared/tasks/tasks";
import type {Hero} from "../../../src/core/types/Hero.ts";
import {PathService} from "../../../src/core/PathService.ts";
import {detachHeroFromCurrentTask, updateActiveTasks} from "../../../src/store/taskStore.ts";

export class ServerMovementHandler {

    activeMovements: Map<string, {
        heroId: string;
        startedAt: number;
        target: { q: number; r: number };
        path: { q: number; r: number }[];
        stepDurations: number[];
        totalDuration: number;
        task?: TaskType
    }> = new Map();

    constructor() {
    }

    init(): void {
        serverMessageRouter.on('hero:move_request', this.handleMoveRequest.bind(this));
    }

    private handleMoveRequest(_socket: Socket, message: MoveRequestMessage): void {
        const {heroId, origin, target, path: clientPath} = message;

        // Basic validation of origin/target
        if (!origin || !target) return;

        // Validate current hero position matches origin
        const hero = getHero(heroId);

        if (!hero) {
            return;
        }

        if (Math.abs(hero.q - origin.q) > 1 || Math.abs(hero.r - origin.r) > 1) return;

        const targetTile = tiles.find(t => t.q === target.q && t.r === target.r);
        if (!targetTile) {
            return;
        }

        if (!this.isWalkable(target.q, target.r) && targetTile.discovered) return;

        let path: { q: number; r: number }[] = [];
        if (clientPath && Array.isArray(clientPath) && clientPath.length) {
            let valid = true;
            let prev = origin;
            for (const step of clientPath) {
                const dq = step.q - prev.q;
                const dr = step.r - prev.r;
                const isNeighbor = Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1; // axial adjacency rough check
                const isTarget = (step.q === target.q && step.r === target.r);
                if (!isNeighbor || (!isTarget && !this.isWalkable(step.q, step.r))) {
                    valid = false;
                    break;
                }
                prev = step;
            }
            if (valid && prev.q === target.q && prev.r === target.r) {
                path = clientPath.slice();
            }
        }

        if (!path.length) return; // no path

        // Compute timings; in future incorporate hero stats from authoritative state
        const {durations, cumulative} = this.computeDurations(path, origin, 1);

        detachHeroFromCurrentTask(hero);

        const startDelayMs = 50; // small delay for clients to align without time sync
        hero.movement = {
            path: path.slice(),
            origin,
            target,
            taskType: message.task,
            startMs: message.startAt,
            stepDurations: durations,
            cumulative,
        }
        hero.delayedMovementTimer = undefined;
        this.registerMovement(heroId, target, path, durations, startDelayMs, origin, Date.now(), message.task);

        // Broadcast to all clients
        const update: PathUpdateMessage = {
            type: 'hero:path_update',
            heroId,
            origin,
            path,
            target,
            startDelayMs,
            stepDurations: durations,
            cumulative,
            task: message.task,
        };
        broadcast(update);

        updateActiveTasks(heroes);
    }

    public moveHero(hero: Hero, target: { q: number, r: number }, task ?: TaskType) {
        const path = this.getPathService().findWalkablePath(hero.q, hero.r, target.q, target.r);

        if (!path || !path.length) {
            return;
        }

        const {durations, cumulative} = this.computeDurations(path, hero, 1);
        const origin = {q: hero.q, r: hero.r};
        const targetPosition = {q: target.q, r: target.r};

        detachHeroFromCurrentTask(hero);
        this.registerMovement(hero.id, targetPosition, path, durations, 50, origin, Date.now(), task);
        broadcast({
            type: 'hero:path_update',
            heroId: hero.id,
            origin,
            path,
            target: targetPosition,
            startDelayMs: 50,
            stepDurations: durations,
            cumulative,
            task,
        } as PathUpdateMessage)

        updateActiveTasks(heroes);
    }

    private isWalkable(q: number, r: number): boolean {
        const t = tiles.find(t => t.q === q && t.r === r);
        if (!t || !t.terrain) return false;
        const def = (TERRAIN_DEFS)[t.terrain];
        const variantDef = t?.variant ? def.variations?.find((v: any) => v.key === t?.variant) : null;
        if (variantDef && typeof variantDef.walkable === 'boolean') {
            return !!variantDef.walkable;
        }
        return !!(def && def.walkable);
    }

    computeDurations(path: { q: number; r: number }[], origin: { q: number; r: number }, speedAdj = 1): {
        durations: number[];
        cumulative: number[];
        avg: number
    } {
        const baseStepMs = 750;
        const durations: number[] = [];
        for (let i = 0; i < path.length; i++) {
            const fromCoord = (i === 0) ? origin : path[i - 1]!;
            const toCoord = path[i]!;
            const fromTile = tiles.find(t => t.q === fromCoord.q && t.r === fromCoord.r);
            const toTile = tiles.find(t => t.q === toCoord.q && t.r === toCoord.r);
            const fromDef = fromTile && fromTile.terrain ? (TERRAIN_DEFS as any)[fromTile.terrain] : null;
            const toDef = toTile && toTile.terrain ? (TERRAIN_DEFS as any)[toTile.terrain] : null;
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
        const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : baseStepMs;
        return {durations, cumulative, avg};
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
        startDelayMs: number,
        origin: { q: number, r: number },
        startAt: number,
        task?: TaskType,
    ): void {
        const totalDuration = durations.reduce((a, b) => a + b, 0);

        this.activeMovements.set(heroId, {
            heroId,
            startedAt: startAt,
            target,
            path,
            stepDurations: durations,
            totalDuration,
            task
        });

        const cumulative: number[] = [];
        for (let i = 0; i < durations.length; i++) {
            const prev = i === 0 ? 0 : (cumulative[i - 1] as number);
            const cur = durations[i] as number;
            cumulative[i] = prev + cur;
        }

        const heroLocal = getHero(heroId);
        if (!heroLocal) return;
        heroLocal.movement = {
            path: path.slice(),
            origin,
            target,
            taskType: task,
            startMs: startAt + startDelayMs,
            stepDurations: durations,
            cumulative: cumulative,
        }
    }

    public tick(_ctx?: any): void {
        const now = Date.now()

        // @ts-ignore
        for (const [heroId, movement] of this.activeMovements) {
            const hero = getHero(heroId);
            if (!hero) {
                continue;
            }

            const elapsedMs = now - movement.startedAt;
            // Update hero position along path based on elapsed time
            let accumulatedMs = 0;
            let stepIndex = 0;
            let stepDuration = movement.stepDurations[stepIndex] as number;
            while (stepIndex < movement.path.length && accumulatedMs + stepDuration < elapsedMs) {
                accumulatedMs += stepDuration;
                stepIndex++;
                stepDuration = movement.stepDurations[stepIndex] as number
            }

            if (stepIndex < movement.path.length) {
                const step = movement.path[stepIndex] as { q: number; r: number };
                hero.q = step.q;
                hero.r = step.r;
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
