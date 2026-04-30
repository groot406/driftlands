import {axialKey, tileIndex} from './world';
import type {Tile} from "./types/Tile.ts";
import type {Hero} from "./types/Hero.ts";
import { axialDistanceCoords } from '../shared/game/hex';
import { getTileMoveCost, isEdgeBlocked, isTileScoutWalkable, isTileWalkable } from '../shared/game/navigation';
import { isTileControlled, isTileControlledBySettlement } from '../shared/game/state/settlementSupportStore';

export interface PathCoord {
    q: number;
    r: number;
}

export interface PathFindOptions {
    allowScouted?: boolean;
    settlementId?: string | null;
}

interface PathNode {
    key: string;
    q: number;
    r: number;
    g: number;
    f: number;
}

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
        const computed = this.findWalkablePath(hero.q, hero.r, hoveredTile.q, hoveredTile.r);
        this._lastPathKey = key;
        this._lastPath = computed;
        return computed;
    }

    // expose pathfinding for external movement start
    public findWalkablePath(startQ: number, startR: number, goalQ: number, goalR: number, options: PathFindOptions = {}): PathCoord[] {
        const directDistance = this.axialDistance(startQ, startR, goalQ, goalR);
        if (directDistance === 0) return [];
        const searchProfile = this.buildSearchProfile(directDistance);

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
        let iterations = 0;
        while (open.size && iterations < searchProfile.maxNodes) {
            iterations++;
            const current = open.pop()!;
            const bestKnownCost = bestCosts.get(current.key);
            if (bestKnownCost === undefined || current.g !== bestKnownCost || closed.has(current.key)) {
                continue;
            }

            if (current.q === goalQ && current.r === goalR) {
                return this.reconstructPath(current.key, startKey, parents, coords);
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
        return [];
    }

    public axialDistance(aQ: number, aR: number, bQ: number, bR: number) {
        return axialDistanceCoords(aQ, aR, bQ, bR);
    }

    private isWalkable(q: number, r: number, options: PathFindOptions = {}) {
        const tile = tileIndex[axialKey(q, r)] ?? null;
        if (options.settlementId && isTileControlled(tile) && !isTileControlledBySettlement(tile, options.settlementId)) {
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
}
