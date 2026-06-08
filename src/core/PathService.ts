import {axialKey, getWorldRenderVersion, tileIndex} from './world';
import type {Tile} from "./types/Tile.ts";
import type {Hero} from "./types/Hero.ts";
import { axialDistanceCoords } from '../shared/game/hex';
import { getTileMoveCost, isEdgeBlocked, isTileScoutWalkable, isTileWalkable } from '../shared/game/navigation';
import { isTileControlled, isTileControlledBySettlement } from '../shared/game/state/settlementSupportStore';
import { canSettlementUseOpenBorderTransit } from '../shared/game/military';

export interface PathCoord {
    q: number;
    r: number;
}

export interface PathFindOptions {
    allowScouted?: boolean;
    allowOpenBorders?: boolean;
    settlementId?: string | null;
    telemetrySource?: string;
}

export interface PathTelemetryEvent {
    source?: string;
    cacheLayer?: string;
    durationMs: number;
    start: PathCoord;
    goal: PathCoord;
    directDistance: number;
    pathLength: number;
    iterations: number;
    maxNodes: number;
    maxRange: number;
    found: boolean;
    allowScouted?: boolean;
    allowOpenBorders?: boolean;
    settlementRestricted?: boolean;
    cacheHit?: boolean;
    cacheSize?: number;
    cacheEpoch?: number;
    cacheWorldVersion?: number;
    cacheResetReason?: PathCacheResetReason;
    cacheEvictions?: number;
}

interface PathNode {
    key: string;
    q: number;
    r: number;
    g: number;
    f: number;
}

interface CachedPathEntry {
    path: PathCoord[];
}

type PathCacheResetReason = 'manual' | 'world_version' | 'epoch' | 'world_version_and_epoch';

class MinHeap<T> {
    private items: T[] = [];
    private readonly compare: (a: T, b: T) => number;

    constructor(compare: (a: T, b: T) => number) {
        this.compare = compare;
    }

    get size() {
        return this.items.length;
    }

    push(value: T) {
        this.items.push(value);
        this.bubbleUp(this.items.length - 1);
    }

    pop(): T | undefined {
        if (this.items.length === 0) return undefined;
        const top = this.items[0]!;
        const tail = this.items.pop()!;
        if (this.items.length > 0) {
            this.items[0] = tail;
            this.bubbleDown(0);
        }
        return top;
    }

    private bubbleUp(index: number) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compare(this.items[index]!, this.items[parentIndex]!) >= 0) break;
            [this.items[index], this.items[parentIndex]] = [this.items[parentIndex]!, this.items[index]!];
            index = parentIndex;
        }
    }

    private bubbleDown(index: number) {
        const { length } = this.items;
        while (true) {
            const left = (index * 2) + 1;
            const right = left + 1;
            let smallest = index;

            if (left < length && this.compare(this.items[left]!, this.items[smallest]!) < 0) {
                smallest = left;
            }
            if (right < length && this.compare(this.items[right]!, this.items[smallest]!) < 0) {
                smallest = right;
            }
            if (smallest === index) break;

            [this.items[index], this.items[smallest]] = [this.items[smallest]!, this.items[index]!];
            index = smallest;
        }
    }
}

const BASE_NODE_BUDGET = 7000;
const MAX_NODE_BUDGET = 45000;
const MIN_DETOUR_MARGIN = 12;
const MAX_DETOUR_MARGIN = 42;
const PATH_CACHE_MAX_ENTRIES = 512;
let pathTelemetry: ((event: PathTelemetryEvent) => void) | null = null;
let pathCacheEpoch = 0;
const pathCache = new Map<string, CachedPathEntry>();
let pathCacheWorldVersion = getWorldRenderVersion();
let pathCacheEpochSnapshot = pathCacheEpoch;
let pendingPathCacheResetReason: PathCacheResetReason | null = null;

export function configurePathTelemetry(callback: ((event: PathTelemetryEvent) => void) | null) {
    pathTelemetry = callback;
}

export function invalidatePathCaches() {
    pathCacheEpoch++;
    pathCache.clear();
    pathCacheWorldVersion = getWorldRenderVersion();
    pathCacheEpochSnapshot = pathCacheEpoch;
    pendingPathCacheResetReason = 'manual';
}

export function recordPathCacheTelemetry(event: {
    source?: string;
    cacheLayer: string;
    start: PathCoord;
    goal: PathCoord;
    pathLength: number;
    found?: boolean;
    allowScouted?: boolean;
    allowOpenBorders?: boolean;
    settlementRestricted?: boolean;
    cacheHit: boolean;
}) {
    if (!pathTelemetry) {
        return;
    }

    pathTelemetry({
        source: event.source,
        cacheLayer: event.cacheLayer,
        durationMs: 0,
        start: { q: event.start.q, r: event.start.r },
        goal: { q: event.goal.q, r: event.goal.r },
        directDistance: axialDistanceCoords(event.start.q, event.start.r, event.goal.q, event.goal.r),
        pathLength: event.pathLength,
        iterations: 0,
        maxNodes: 0,
        maxRange: 0,
        found: event.found ?? event.pathLength > 0,
        allowScouted: event.allowScouted,
        allowOpenBorders: event.allowOpenBorders,
        settlementRestricted: event.settlementRestricted,
        cacheHit: event.cacheHit,
        cacheSize: pathCache.size,
        cacheEpoch: pathCacheEpoch,
        cacheWorldVersion: pathCacheWorldVersion,
        cacheEvictions: 0,
    });
}

export class PathService {
    // Pathfinding statics
    private readonly AXIAL_DELTAS: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
    private readonly SIDE_NAMES: Array<'a'|'b'|'c'|'d'|'e'|'f'> = ['a','b','c','d','e','f'];

    // Path preview memoization
    private _lastPathKey: string = '';
    private _lastPath: { q: number; r: number }[] = [];

    updatePath(hero: Hero | null, hoveredTile: Tile | null): PathCoord[] {
        if (!hero || !hoveredTile) return [];
        if (!this.isHeroIdle(hero)) return [];

        // Build cache key from hero id/coords and hovered coords
        const key = `${hero.id}:${hero.q},${hero.r}->${hoveredTile.q},${hoveredTile.r}:${hoveredTile.discovered ? hoveredTile.terrain ?? 'discovered' : 'undiscovered'}:${hoveredTile.variant ?? ''}`;
        if (this._lastPathKey === key) {
            return this._lastPath;
        }

        if (hoveredTile.discovered && !this.isWalkable(hoveredTile.q, hoveredTile.r)) return [];
        const computed = this.findWalkablePath(hero.q, hero.r, hoveredTile.q, hoveredTile.r, {
            telemetrySource: 'path_preview',
        });
        this._lastPathKey = key;
        this._lastPath = computed;
        return computed;
    }

    // expose pathfinding for external movement start
    public findWalkablePath(startQ: number, startR: number, goalQ: number, goalR: number, options: PathFindOptions = {}): PathCoord[] {
        const directDistance = this.axialDistance(startQ, startR, goalQ, goalR);
        if (directDistance === 0) {
            this.recordPathTelemetry(Date.now(), options, startQ, startR, goalQ, goalR, directDistance, 0, 0, 0, 0, false);
            return [];
        }
        const cacheResetReason = this.resetPathCacheIfStale();
        const cacheKey = this.getPathCacheKey(startQ, startR, goalQ, goalR, options);
        const cached = pathCache.get(cacheKey);
        if (cached) {
            if (this.isCachedPathStillUsable(cached.path, startQ, startR, goalQ, goalR, options)) {
                pathCache.delete(cacheKey);
                pathCache.set(cacheKey, cached);
                this.recordPathTelemetry(Date.now(), options, startQ, startR, goalQ, goalR, directDistance, cached.path.length, 0, 0, 0, true, {
                    cacheResetReason,
                });
                return this.clonePath(cached.path);
            }
            pathCache.delete(cacheKey);
        }

        const searchProfile = this.buildSearchProfile(directDistance);
        const startedAt = Date.now();
        let iterations = 0;
        let result: PathCoord[] = [];
        let cacheEvictions = 0;

        const costFor = (q: number, r: number): number => {
            return getTileMoveCost(tileIndex[axialKey(q, r)] ?? null);
        };

        const heuristic = (q: number, r: number): number => {
            // Admissible heuristic: axial distance * minimum per-step cost (>=0.1)
            return this.axialDistance(q, r, goalQ, goalR) * 0.1;
        };

        const open = new MinHeap<PathNode>((a, b) => {
            if (a.f !== b.f) return a.f - b.f;
            return a.g - b.g;
        });
        const bestCosts = new Map<string, number>();
        const parents = new Map<string, string | null>();
        const coords = new Map<string, PathCoord>();
        const closed = new Set<string>();
        const startKey = axialKey(startQ, startR);
        const startNode: PathNode = { key: startKey, q: startQ, r: startR, g: 0, f: heuristic(startQ, startR) };
        open.push(startNode);
        bestCosts.set(startKey, 0);
        parents.set(startKey, null);
        coords.set(startKey, { q: startQ, r: startR });
        try {
            while (open.size && iterations < searchProfile.maxNodes) {
                iterations++;
                const current = open.pop()!;
                const bestKnownCost = bestCosts.get(current.key);
                if (bestKnownCost === undefined || current.g !== bestKnownCost || closed.has(current.key)) {
                    continue;
                }

                if (current.q === goalQ && current.r === goalR) {
                    result = this.reconstructPath(current.key, startKey, parents, coords);
                    return result;
                }

                closed.add(current.key);
                const currTile = tileIndex[current.key];
                for (let i = 0; i < this.AXIAL_DELTAS.length; i++) {
                    const [dq, dr] = this.AXIAL_DELTAS[i]!;
                    const side = this.SIDE_NAMES[i]!;
                    const nq = current.q + dq;
                    const nr = current.r + dr;
                    const key = axialKey(nq, nr);
                    if (closed.has(key)) continue;
                    if (!this.isWithinSearchWindow(nq, nr, startQ, startR, goalQ, goalR, searchProfile.maxRange)) continue;

                    const nextTile = tileIndex[key];
                    if (isEdgeBlocked(currTile, nextTile, side)) continue;
                    if (!this.isWalkable(nq, nr, options) && !(nq === goalQ && nr === goalR)) continue;
                    const stepCost = costFor(nq, nr);
                    const tentativeG = current.g + stepCost;
                    if (tentativeG >= (bestCosts.get(key) ?? Number.POSITIVE_INFINITY)) continue;

                    bestCosts.set(key, tentativeG);
                    parents.set(key, current.key);
                    coords.set(key, { q: nq, r: nr });
                    open.push({
                        key,
                        q: nq,
                        r: nr,
                        g: tentativeG,
                        f: tentativeG + heuristic(nq, nr),
                    });
                }
            }
            return result;
        } finally {
            cacheEvictions = this.storePathCache(cacheKey, result);
            this.recordPathTelemetry(
                startedAt,
                options,
                startQ,
                startR,
                goalQ,
                goalR,
                directDistance,
                result.length,
                iterations,
                searchProfile.maxNodes,
                searchProfile.maxRange,
                false,
                {
                    cacheResetReason,
                    cacheEvictions,
                },
            );
        }
    }

    public axialDistance(aQ: number, aR: number, bQ: number, bR: number) {
        return axialDistanceCoords(aQ, aR, bQ, bR);
    }

    private isWalkable(q: number, r: number, options: PathFindOptions = {}) {
        const tile = tileIndex[axialKey(q, r)] ?? null;
        if (
            options.settlementId
            && isTileControlled(tile)
            && !isTileControlledBySettlement(tile, options.settlementId)
            && !(options.allowOpenBorders && canSettlementUseOpenBorderTransit(tile, options.settlementId, tileIndex))
        ) {
            return false;
        }

        return options.allowScouted
            ? isTileScoutWalkable(tile)
            : isTileWalkable(tile);
    }

    private isHeroIdle(hero: Hero): boolean {
        if (hero.movement) return false;
        return true;
    }

    private buildSearchProfile(directDistance: number) {
        const detourMargin = Math.max(
            MIN_DETOUR_MARGIN,
            Math.min(MAX_DETOUR_MARGIN, Math.ceil(directDistance * 0.45))
        );
        const maxRange = directDistance + detourMargin;
        const corridorArea = 1 + (3 * maxRange * (maxRange + 1));
        const maxNodes = Math.max(
            BASE_NODE_BUDGET,
            Math.min(MAX_NODE_BUDGET, Math.round(corridorArea * 0.55))
        );

        return {
            maxRange,
            maxNodes,
        };
    }

    private isWithinSearchWindow(
        q: number,
        r: number,
        startQ: number,
        startR: number,
        goalQ: number,
        goalR: number,
        maxRange: number,
    ) {
        return this.axialDistance(startQ, startR, q, r) <= maxRange
            && this.axialDistance(goalQ, goalR, q, r) <= maxRange;
    }

    private reconstructPath(
        goalKey: string,
        startKey: string,
        parents: Map<string, string | null>,
        coords: Map<string, PathCoord>,
    ) {
        const reversed: PathCoord[] = [];
        let currentKey: string | null = goalKey;

        while (currentKey && currentKey !== startKey) {
            const coord = coords.get(currentKey);
            if (!coord) return [];
            reversed.push({ q: coord.q, r: coord.r });
            currentKey = parents.get(currentKey) ?? null;
        }

        reversed.reverse();
        return reversed;
    }

    private getPathCacheKey(startQ: number, startR: number, goalQ: number, goalR: number, options: PathFindOptions) {
        return [
            startQ,
            startR,
            goalQ,
            goalR,
            options.allowScouted ? 1 : 0,
            options.allowOpenBorders ? 1 : 0,
            options.settlementId ?? '',
        ].join(':');
    }

    private resetPathCacheIfStale(): PathCacheResetReason | null {
        const worldVersion = getWorldRenderVersion();
        if (pathCacheWorldVersion === worldVersion && pathCacheEpochSnapshot === pathCacheEpoch) {
            return null;
        }

        const worldChanged = pathCacheWorldVersion !== worldVersion;
        const epochChanged = pathCacheEpochSnapshot !== pathCacheEpoch;
        const reason = worldChanged && epochChanged
            ? 'world_version_and_epoch'
            : worldChanged
                ? 'world_version'
                : 'epoch';
        pathCache.clear();
        pathCacheWorldVersion = worldVersion;
        pathCacheEpochSnapshot = pathCacheEpoch;
        return reason;
    }

    private storePathCache(key: string, path: PathCoord[]) {
        if (!path.length) {
            return 0;
        }
        this.resetPathCacheIfStale();
        pathCache.set(key, { path: this.clonePath(path) });
        let evictions = 0;
        while (pathCache.size > PATH_CACHE_MAX_ENTRIES) {
            const oldest = pathCache.keys().next().value;
            if (oldest === undefined) break;
            pathCache.delete(oldest);
            evictions++;
        }
        return evictions;
    }

    private isCachedPathStillUsable(
        path: PathCoord[],
        startQ: number,
        startR: number,
        goalQ: number,
        goalR: number,
        options: PathFindOptions,
    ) {
        if (!path.length) {
            return false;
        }

        let prev = { q: startQ, r: startR };
        for (const step of path) {
            const side = this.getNeighborSide(prev.q, prev.r, step.q, step.r);
            if (!side) {
                return false;
            }

            const prevTile = tileIndex[axialKey(prev.q, prev.r)] ?? null;
            const stepTile = tileIndex[axialKey(step.q, step.r)] ?? null;
            if (isEdgeBlocked(prevTile, stepTile, side)) {
                return false;
            }

            const isGoal = step.q === goalQ && step.r === goalR;
            if (!isGoal && !this.isWalkable(step.q, step.r, options)) {
                return false;
            }
            prev = step;
        }

        return prev.q === goalQ && prev.r === goalR;
    }

    private getNeighborSide(fromQ: number, fromR: number, toQ: number, toR: number) {
        for (let i = 0; i < this.AXIAL_DELTAS.length; i++) {
            const [dq, dr] = this.AXIAL_DELTAS[i]!;
            if (fromQ + dq === toQ && fromR + dr === toR) {
                return this.SIDE_NAMES[i]!;
            }
        }
        return null;
    }

    private clonePath(path: PathCoord[]) {
        return path.map((step) => ({ q: step.q, r: step.r }));
    }

    private recordPathTelemetry(
        startedAt: number,
        options: PathFindOptions,
        startQ: number,
        startR: number,
        goalQ: number,
        goalR: number,
        directDistance: number,
        pathLength: number,
        iterations: number,
        maxNodes: number,
        maxRange: number,
        cacheHit: boolean,
        cacheDetails: {
            cacheResetReason?: PathCacheResetReason | null;
            cacheEvictions?: number;
        } = {},
    ) {
        const cacheResetReason = cacheDetails.cacheResetReason ?? pendingPathCacheResetReason ?? undefined;
        pendingPathCacheResetReason = null;
        if (!pathTelemetry) {
            return;
        }
        pathTelemetry({
            source: options.telemetrySource,
            cacheLayer: 'path_service',
            durationMs: Date.now() - startedAt,
            start: { q: startQ, r: startR },
            goal: { q: goalQ, r: goalR },
            directDistance,
            pathLength,
            iterations,
            maxNodes,
            maxRange,
            found: pathLength > 0,
            allowScouted: options.allowScouted,
            allowOpenBorders: options.allowOpenBorders,
            settlementRestricted: !!options.settlementId,
            cacheHit,
            cacheSize: pathCache.size,
            cacheEpoch: pathCacheEpoch,
            cacheWorldVersion: pathCacheWorldVersion,
            cacheResetReason,
            cacheEvictions: cacheDetails.cacheEvictions ?? 0,
        });
    }
}
