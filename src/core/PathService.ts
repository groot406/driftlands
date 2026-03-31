import {axialKey, tileIndex} from './world';
import {heroes} from '../store/heroStore';
import type {Tile} from "./types/Tile.ts";
import type {Hero} from "./types/Hero.ts";
import { axialDistanceCoords } from '../shared/game/hex';
import { getTileMoveCost, isEdgeBlocked, isTileWalkable } from '../shared/game/navigation';

export interface PathCoord {
    q: number;
    r: number;
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

    updatePath(selectedId: string | null, hoveredTile: Tile | null): PathCoord[] {
        if (!selectedId || !hoveredTile) return [];
        const hero = heroes.find(h => h.id === selectedId);
        if (!hero) return [];
        if (!this.isHeroIdle(hero)) return [];

        // Build cache key from hero id/coords and hovered coords
        const key = `${selectedId}:${hero.q},${hero.r}->${hoveredTile.q},${hoveredTile.r}:${hoveredTile.discovered ? hoveredTile.terrain ?? 'discovered' : 'undiscovered'}:${hoveredTile.variant ?? ''}`;
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
    public findWalkablePath(startQ: number, startR: number, goalQ: number, goalR: number): PathCoord[] {
        const directDistance = this.axialDistance(startQ, startR, goalQ, goalR);
        if (directDistance === 0) return [];
        const searchProfile = this.buildSearchProfile(directDistance);

        interface PathNode {
            q: number;
            r: number;
            g: number; // accumulated movement cost
            f: number; // g + heuristic
            parent?: PathNode
        }

        const costFor = (q: number, r: number): number => {
            return getTileMoveCost(tileIndex[axialKey(q, r)] ?? null);
        };

        const heuristic = (q: number, r: number): number => {
            // Admissible heuristic: axial distance * minimum per-step cost (>=0.1)
            return this.axialDistance(q, r, goalQ, goalR) * 0.1;
        };

        const open: PathNode[] = [];
        const openMap = new Map<string, PathNode>();
        const closed = new Set<string>();
        const startNode: PathNode = {q: startQ, r: startR, g: 0, f: heuristic(startQ, startR)};
        open.push(startNode);
        openMap.set(axialKey(startQ, startR), startNode);
        let iterations = 0;
        while (open.length && iterations < searchProfile.maxNodes) {
            iterations++;
            let bestIndex = 0;
            let best = open[0]!;
            for (let i = 1; i < open.length; i++) {
                if (open[i]!.f < best.f) {
                    best = open[i]!;
                    bestIndex = i;
                }
            }
            const current = best;
            open.splice(bestIndex, 1);
            openMap.delete(axialKey(current.q, current.r));
            closed.add(axialKey(current.q, current.r));
            if (current.q === goalQ && current.r === goalR) {
                const rev: PathCoord[] = [];
                let n: PathNode | undefined = current;
                while (n && !(n.q === startQ && n.r === startR)) {
                    rev.push({q: n.q, r: n.r});
                    n = n.parent;
                }
                rev.reverse();
                return rev;
            }
            for (let i = 0; i < this.AXIAL_DELTAS.length; i++) {
                const [dq, dr] = this.AXIAL_DELTAS[i]!;
                const side = this.SIDE_NAMES[i]!;
                const nq = current.q + dq;
                const nr = current.r + dr;
                const key = axialKey(nq, nr);
                if (closed.has(key)) continue;
                if (!this.isWithinSearchWindow(nq, nr, startQ, startR, goalQ, goalR, searchProfile.maxRange)) continue;

                const currTile = tileIndex[axialKey(current.q, current.r)];
                const nextTile = tileIndex[key];
                if (isEdgeBlocked(currTile, nextTile, side)) continue;
                if (!this.isWalkable(nq, nr) && !(nq === goalQ && nr === goalR)) continue;
                const stepCost = costFor(nq, nr);
                const tentativeG = current.g + stepCost;
                let node = openMap.get(key);
                if (!node) {
                    node = {
                        q: nq,
                        r: nr,
                        g: tentativeG,
                        f: tentativeG + heuristic(nq, nr),
                        parent: current
                    };
                    open.push(node);
                    openMap.set(key, node);
                } else if (tentativeG < node.g) {
                    node.g = tentativeG;
                    node.f = tentativeG + heuristic(nq, nr);
                    node.parent = current;
                }
            }
        }
        return [];
    }

    public axialDistance(aQ: number, aR: number, bQ: number, bR: number) {
        return axialDistanceCoords(aQ, aR, bQ, bR);
    }

    private isWalkable(q: number, r: number) {
        return isTileWalkable(tileIndex[axialKey(q, r)] ?? null);
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
}
