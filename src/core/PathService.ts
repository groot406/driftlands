import {axialKey, tileIndex} from './world';
import {heroes} from '../store/heroStore';
import {TERRAIN_DEFS} from './terrainDefs';
import {taskStore} from '../store/taskStore';
import type {Tile} from "./types/Tile.ts";
import type {Hero} from "./types/Hero.ts";

export interface PathCoord {
    q: number;
    r: number;
}

const maxNodes = 5000;

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

        // Distance guard: skip if far beyond reachable distance for preview
        const maxDist = this.estimateMaxReachableDistance(maxNodes);
        const dist = this.axialDistance(hero.q, hero.r, hoveredTile.q, hoveredTile.r);
        if (dist > maxDist) return [];

        // Build cache key from hero id/coords and hovered coords
        const key = `${selectedId}:${hero.q},${hero.r}->${hoveredTile.q},${hoveredTile.r}`;
        if (this._lastPathKey === key && this._lastPath.length) {
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
        // Early exit: if target is clearly beyond reachable distance under node cap
        const maxDist = this.estimateMaxReachableDistance(maxNodes);
        const dist = this.axialDistance(startQ, startR, goalQ, goalR);
        if (dist > maxDist) return [];

        interface PathNode {
            q: number;
            r: number;
            g: number; // accumulated movement cost
            f: number; // g + heuristic
            parent?: PathNode
        }

        const costFor = (q: number, r: number): number => {
            const t = tileIndex[axialKey(q, r)];
            if (!t || !t.terrain) return 1;
            const def = (TERRAIN_DEFS as any)[t.terrain];
            const mc = def && typeof def.moveCost === 'number' ? def.moveCost : 1;
            return Math.max(0.1, mc); // enforce sane lower bound
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
        while (open.length && iterations < maxNodes) {
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

                const currTile = tileIndex[axialKey(current.q, current.r)];
                const nextTile = tileIndex[key];

                const curTileTerrainDef = currTile && currTile.terrain ? (TERRAIN_DEFS as any)[currTile.terrain] : null;
                const nextTileTerrainDef = nextTile && nextTile.terrain ? (TERRAIN_DEFS as any)[nextTile.terrain] : null;

                const curTileVariant = curTileTerrainDef && currTile?.variant ? curTileTerrainDef.variations?.find((v: any) => v.key === currTile?.variant) : null;
                const nextTileVariant = nextTileTerrainDef && nextTile?.variant ? nextTileTerrainDef.variations?.find((v: any) => v.key === nextTile?.variant) : null;

                const curFenceEdges = curTileVariant && curTileVariant.fencedEdges ? curTileVariant.fencedEdges : (curTileTerrainDef && curTileTerrainDef.fencedEdges ? curTileTerrainDef.fencedEdges : {});
                const nextFenceEdges = nextTileVariant && nextTileVariant.fencedEdges ? nextTileVariant.fencedEdges : (nextTileTerrainDef && nextTileTerrainDef.fencedEdges ? nextTileTerrainDef.fencedEdges : {});

                const opp: Record<'a'|'b'|'c'|'d'|'e'|'f', 'a'|'b'|'c'|'d'|'e'|'f'> = { a: 'd', b: 'e', c: 'f', d: 'a', e: 'b', f: 'c' };

                const isFenced = !!(
                    (currTile && curFenceEdges && curFenceEdges[side]) ||
                    (nextTile && nextFenceEdges && nextFenceEdges[opp[side]])
                );

                if (isFenced) continue;
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
        const dq = Math.abs(aQ - bQ);
        const dr = Math.abs(aR - bR);
        const ds = Math.abs((-aQ - aR) - (-bQ - bR));
        return Math.max(dq, dr, ds);
    }

    private isWalkable(q: number, r: number) {
        const t = tileIndex[axialKey(q, r)];
        if (!t) return false;
        if (!t.terrain) return false;
        const def = (TERRAIN_DEFS as any)[t.terrain];
        // Variant-level walkable override
        if (t.variant && def?.variations) {
            const vDef = def.variations.find((v: any) => v.key === t.variant);
            if (vDef && typeof vDef.walkable === 'boolean') return vDef.walkable;
        }
        return !!(def && def.walkable);
    }

    private isHeroIdle(hero: Hero): boolean {
        if (hero.movement) return false;
        if (hero.currentTaskId) {
            const inst = taskStore.taskIndex[hero.currentTaskId];
            if (inst && inst.active && !inst.completedMs) return false;
        }
        return true;
    }

    // Estimate maximum axial distance reachable given node cap for hex grid (~3d(d+1) nodes up to ring d)
    private estimateMaxReachableDistance(maxNodes: number): number {
        // Solve 3d(d+1) <= maxNodes -> d ≈ (sqrt(12*maxNodes + 3) - 3) / 6
        const approx = (Math.sqrt(12 * Math.max(0, maxNodes) + 3) - 3) / 6;
        return Math.max(0, Math.floor(approx));
    }
}
