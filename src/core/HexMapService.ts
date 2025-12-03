import type {Tile} from './world';
import {axialKey, getTilesInRadius, tileIndex} from './world';
import {
    animateCamera,
    axialToPixel,
    camera,
    HEX_SIZE,
    HEX_SPACE,
    hexDistance,
    pixelToAxial,
    updateCameraRadius,
    centerCamera,
    moveCamera
} from './camera';
import {type Hero, heroes, selectedHeroId} from '../store/heroStore';
import {TERRAIN_DEFS} from './terrainDefs';
import {heroAnimationSet, heroAnimName, resolveActivity, shouldFlip} from './heroSprite';
import {taskStore} from '../store/taskStore';
import type {TaskInstance} from './tasks';
import { worldOuterRadius, type ResourceType } from './world';
import {getTextIndicators} from "./textIndicators.ts";

// Tile assets (importing here to keep service encapsulated)
// Remove individual static imports for each tile image
// Dynamically import all png files in assets/tiles
const tileImageModules = import.meta.glob('../assets/tiles/*.png', { eager: true });
// Build runtime map from filename (without extension) to URL
function buildTileSources(): Record<string, string> {
    const sources: Record<string, string> = {};
    for (const path in tileImageModules) {
        const mod: any = tileImageModules[path];
        const url: string = mod.default || mod;
        const nameMatch = path.match(/([^/]+)\.png$/);
        if (!nameMatch) continue;
        const key = nameMatch[1]!;
        sources[key] = url;
    }
    return sources;
}

interface PathCoord {
    q: number;
    r: number
}

interface DrawOptions {
    hoveredTile: Tile | null;
    hoveredHero: Hero | null;
    taskMenuTile: Tile | null;
    pathCoords: PathCoord[];
    clusterBoundaryTiles?: Tile[]; // boundary tiles of same-terrain cluster for menu highlighting
    clusterTileIds?: Set<string>; // all tile ids in cluster to suppress interior edges
}


export class HexMapService {

    // Config constants (exposed for potential external tuning later)
    readonly TILE_DRAW_SIZE = (HEX_SIZE * 2) - HEX_SPACE;
    readonly heroFrameSize = heroAnimationSet.size;
    // Removed fixed heroFrames/speed/row in favor of animation definitions
    readonly heroZoom = 2;
    readonly HERO_OFFSET_SPACING = 14;

    readonly heroShadowOpacity = 0.6; // base opacity before fade scaling
    readonly heroShadowWidthFactor = 0.6; // relative to heroFrameSize * zoom
    readonly heroShadowHeightFactor = 0.20; // relative to heroFrameSize * zoom
    readonly heroShadowYOffset = 0.13; // move shadow up relative to tile center (in heroFrameSize units)

    private _canvas: HTMLCanvasElement | null = null;
    private _container: HTMLDivElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _layerCanvas: HTMLCanvasElement | null = null;
    private _layerCtx: CanvasRenderingContext2D | null = null;
    private _dpr = window.devicePixelRatio || 1;

    private _images: Record<string, HTMLImageElement> = {};
    private _maskedImages: Record<string, HTMLCanvasElement> = {};
    private _imagesLoaded = false;
    private _heroImages: Record<string, HTMLImageElement> = {};
    private _heroImagesLoaded = false;

    private _heroLayouts: Map<string, Record<string, { x: number; y: number }>> = new Map();

    private _heroMasksByRow: Record<string, Record<number, Uint8Array[]>> = {};
    private _heroEdgePixelsByRow: Record<string, Record<number, { x: number; y: number }[][]>> = {};

    private _heroAnimStart = performance.now();
    private _lastHeroFrame = 0;

    private _tileAnimStart = performance.now();

    //stores heroes in the exact draw layering order (top drawn first, bottom drawn last)
    private _sortedHeroes: Hero[] = [];

    // Pathfinding statics
    private readonly AXIAL_DELTAS: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];

    // Asset sources
    private readonly tileImgSources: Record<string, string> = buildTileSources();

    async init(canvasEl: HTMLCanvasElement, containerEl: HTMLDivElement) {
        this._canvas = canvasEl;
        this._container = containerEl;
        this._dpr = window.devicePixelRatio || 1;
        this.setupCanvas();
        await this.loadTileImages();
        await this.ensureHeroAssets();
        this.resize();
        animateCamera();
    }

    destroy() {
        this._canvas = null;
        this._container = null;
        this._ctx = null;
        this._layerCanvas = null;
        this._layerCtx = null;
        this._heroLayouts.clear();
    }

    resize() {
        if (!this._canvas || !this._container) return;
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        this._dpr = window.devicePixelRatio || 1;
        this._canvas.width = w * this._dpr;
        this._canvas.height = h * this._dpr;
        this._canvas.style.width = w + 'px';
        this._canvas.style.height = h + 'px';
        this._ctx = this._canvas.getContext('2d');
        if (this._ctx) this._ctx.imageSmoothingEnabled = false;
        if (!this._layerCanvas) this._layerCanvas = document.createElement('canvas');
        this._layerCanvas.width = this._canvas.width;
        this._layerCanvas.height = this._canvas.height;
        this._layerCtx = this._layerCanvas.getContext('2d');
        if (this._layerCtx) this._layerCtx.imageSmoothingEnabled = false;
        this.adaptiveCameraRadius();
        // recenter camera if entire world comfortably fits inside current camera radius.
        this.recenterIfWorldFits();
        // Ensure current target is clamped after potential radius change.
        moveCamera(camera.targetQ, camera.targetR);
    }

    draw(opts: DrawOptions) {
        if (!this._ctx || !this._canvas) return;
        if (!this._imagesLoaded) return;

        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);


        // Motion blur tuning: only engage at higher pixel speeds
        const pixelSpeed = camera.speed * (HEX_SIZE * 0.9);
        const SPEED_THRESHOLD = 260; // px/sec required before any blur (was effectively ~100 earlier)
        const MAX_SPEED_FOR_SCALING = 1400; // px/sec where blur reaches cap

        if (!this._layerCtx || pixelSpeed <= SPEED_THRESHOLD) {
            // Below threshold: ensure previous filter cleared so slight movements don't keep old blur
            if (this._canvas.style.filter) this._canvas.style.filter = 'none';
            this.drawTilesAndActors(ctx, opts);
            return;
        }

        // Compute blur strength with smoother scaling above threshold
        const speedRange = Math.max(0, Math.min(MAX_SPEED_FOR_SCALING, pixelSpeed) - SPEED_THRESHOLD);
        // Map speedRange 0..(MAX_SPEED_FOR_SCALING-SPEED_THRESHOLD) -> 0..1
        const norm = speedRange / (MAX_SPEED_FOR_SCALING - SPEED_THRESHOLD);
        // Start with a small base blur and increase towards cap (2px .. 12px)
        let blurStrength = 2 + norm * 10; // 2 -> 12
        blurStrength = Math.min(12, Math.max(0, blurStrength));
        const brightness = 1 - Math.min(0.15, (blurStrength - 2) * 0.02); // dim only as blur grows beyond base

        this._layerCtx.clearRect(0, 0, this._layerCanvas!.width, this._layerCanvas!.height);
        this.drawTilesAndActors(this._layerCtx, opts);
        ctx.drawImage(this._layerCanvas!, 0, 0);
        this._canvas.style.filter = `blur(${blurStrength.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
    }

    updatePath(selectedId: string | null, hoveredTile: Tile | null): PathCoord[] {
        if (!selectedId || !hoveredTile) return [];
        const hero = heroes.find(h => h.id === selectedId);
        if (!hero) return [];

        // Only allow path preview if hero is idle
        if (!this.isHeroIdle(hero)) return [];

        if (hoveredTile.discovered && !this.isWalkable(hoveredTile.q, hoveredTile.r)) return [];
        return this.findWalkablePath(hero.q, hero.r, hoveredTile.q, hoveredTile.r);
    }

    // expose pathfinding for external movement start
    public findWalkablePath(startQ: number, startR: number, goalQ: number, goalR: number, maxNodes = 9999): PathCoord[] {
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
            for (const [dq, dr] of this.AXIAL_DELTAS) {
                const nq = current.q + dq;
                const nr = current.r + dr;
                const key = axialKey(nq, nr);
                if (closed.has(key)) continue;
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

    pickTile(screenX: number, screenY: number): Tile | null {
        if (!this._canvas) return null;
        const rect = this._canvas.getBoundingClientRect();
        const sx = screenX - rect.left;
        const sy = screenY - rect.top;
        const {worldX, worldY} = this.screenToWorld(sx, sy);
        const {q, r} = pixelToAxial(worldX, worldY);
        const results = getTilesInRadius(q, r, 0);
        return results.length ? results[0]! : null;
    }

    pickHero(screenX: number, screenY: number): Hero | null {
        if (!this._canvas) return null;
        const rect = this._canvas.getBoundingClientRect();
        const sx = screenX - rect.left;
        const sy = screenY - rect.top;
        // Iterate in reverse of draw order so visually top hero is picked first
        const layer = this._sortedHeroes.length ? this._sortedHeroes : heroes;
        for (let i = layer.length - 1; i >= 0; i--) {
            const h = layer[i]!;
            const {x, y} = this.worldToScreen(h.q, h.r);
            const layout = this._heroLayouts.get(axialKey(h.q, h.r)) || {};
            const pos = layout[h.id] || {x: 0, y: 0};
            const left = x - (this.heroFrameSize * this.heroZoom) / 2 + pos.x - (this.heroFrameSize / 2);
            const top = y - (this.heroFrameSize * 2) + (this.heroFrameSize / 2) + pos.y;
            const w = this.heroFrameSize * this.heroZoom;
            const hH = this.heroFrameSize * this.heroZoom;
            if (sx < left || sx > left + w || sy < top || sy > top + hH) continue;
            const localX = Math.floor((sx - left) / this.heroZoom);
            const localY = Math.floor((sy - top) / this.heroZoom);
            if (localX < 0 || localX >= this.heroFrameSize || localY < 0 || localY >= this.heroFrameSize) continue;
            const frameIndex = this._lastHeroFrame;
            const facingRowMap: Record<string, number> = {right: 2, left: 2, up: 5, down: 8};
            const row = facingRowMap[h.facing] ?? 8;
            const rowMasks = this._heroMasksByRow[h.avatar]?.[row];
            const mask = rowMasks ? rowMasks[Math.min(frameIndex, rowMasks.length - 1)] : null;
            if (!mask) continue;
            if (mask[localY * this.heroFrameSize + localX]) return h;
        }
        return null;
    }

    // ---------------- Private helpers ----------------
    private setupCanvas() {
        if (!this._canvas) return;
        this._ctx = this._canvas.getContext('2d');
        if (this._ctx) this._ctx.imageSmoothingEnabled = false;
    }

    private computeFade(dist: number, inner: number, radius: number) {
        const span = Math.max(3, (radius - inner));
        let fade = 1 - Math.max(0, (dist - inner) / span);
        fade = Math.min(1, Math.max(0, fade));
        return fade;
    }

    private getCanvasCenter() {
        if (!this._canvas) return {cx: 0, cy: 0};
        return {cx: this._canvas.width / this._dpr / 2, cy: this._canvas.height / this._dpr / 2};
    }

    private screenToWorld(x: number, y: number) {
        const camPx = axialToPixel(camera.q, camera.r);
        const {cx, cy} = this.getCanvasCenter();
        const worldX = x - (cx - camPx.x);
        const worldY = y - (cy - camPx.y);
        return {worldX, worldY};
    }

    private drawHexPath(ctx: CanvasRenderingContext2D, x: number, y: number) {
        const w = this.TILE_DRAW_SIZE;
        const h = this.TILE_DRAW_SIZE;
        ctx.moveTo(x + 0.5 * w - HEX_SIZE, y - HEX_SIZE);
        ctx.lineTo(x + w - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
        ctx.lineTo(x + w - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
        ctx.lineTo(x + 0.5 * w - HEX_SIZE, y + h - HEX_SIZE);
        ctx.lineTo(x - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
        ctx.lineTo(x - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
        ctx.closePath();
    }

    private worldToScreen(q: number, r: number) {
        const camPx = axialToPixel(camera.q, camera.r);
        const {cx, cy} = this.getCanvasCenter();
        const tilePx = axialToPixel(q, r);
        return {x: tilePx.x - camPx.x + cx, y: tilePx.y - camPx.y + cy};
    }

    private drawHexHighlight(ctx: CanvasRenderingContext2D, q: number, r: number, fill: string | null, stroke: string | null, opacity: number) {
        const {x, y} = axialToPixel(q, r);
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        this.drawHexPath(ctx, x, y);
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    private drawTilesAndActors(ctx: CanvasRenderingContext2D, opts: DrawOptions) {
        if (!this._canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const {cx, cy} = this.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;
        ctx.save();
        ctx.scale(this._dpr, this._dpr);
        ctx.translate(translateX, translateY);

        const overlayRecords: Array<{ img: HTMLImageElement; x: number; y: number; q: number; r: number; opacity: number }> = [];
        this.drawTiles(ctx, overlayRecords);

        // Determine if selected hero is idle (gate path and selected highlight)
        const selectedHero = selectedHeroId.value ? heroes.find(h => h.id === selectedHeroId.value) || null : null;
        const selectedHeroIdle = selectedHero ? this.isHeroIdle(selectedHero) : false;
        const selectedHeroWalking = selectedHero ? this.isHeroWalking(selectedHero) : false;

        // Path highlight only when selected hero idle
        if ((selectedHeroIdle || selectedHeroWalking) && opts.pathCoords.length) {
            const first = opts.pathCoords[0];
            if (selectedHero && first && (first.q !== selectedHero.q || first.r !== selectedHero.r)) {
                opts.pathCoords.unshift({q: selectedHero.q, r: selectedHero.r});
            }

            for (const pc of opts.pathCoords) {
                const dist = hexDistance(camera, pc);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                if (hexDistance(camera, pc) > camera.radius + 1) continue;
                const last = pc === opts.pathCoords[opts.pathCoords.length - 1];
                this.drawHexHighlight(ctx, pc.q, pc.r,
                    last ? 'rgba(216,244,255,0.0)' : 'rgba(250,253,255,0.0)',
                    last ? '#dbedff' : '#daf0ff',
                    opacity);
            }
        } else if (selectedHero && selectedHero.movement) {
            // Movement in progress: show remaining planned path & target tile
            const m = selectedHero.movement;
            // Find current index within path (hero.q/r should be some path entry or origin before first step)
            let currentIndex = m.path.findIndex(p => p.q === selectedHero.q && p.r === selectedHero.r);
            if (currentIndex < 0) {
                // If hero at origin before first step, treat as -1 so we show full path
                if (selectedHero.q === m.origin.q && selectedHero.r === m.origin.r) currentIndex = -1;
            }
            const remaining = m.path.slice(Math.max(0, currentIndex + 1));
            if (remaining.length) {
                for (let i = 0; i < remaining.length; i++) {
                    const pc = remaining[i]!;
                    if (hexDistance(camera, pc) > camera.radius + 1) continue;
                    const dist = hexDistance(camera, pc);
                    const opacity = (() => {
                        const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                        return f * f;
                    })();
                    const isLast = i === remaining.length - 1; // destination/target
                    // Slightly different color scheme for active movement path
                    this.drawHexHighlight(ctx, pc.q, pc.r,
                        isLast ? 'rgba(132,196,255,0.0)' : 'rgba(132,196,255,0.0)',
                        isLast ? '#6fb8ff' : '#9fd8ff',
                        opacity);
                }
            } else {
                // No remaining steps but movement object exists (edge case right before arrival): highlight target explicitly if in radius
                const tgt = m.target;
                if (hexDistance(camera, tgt) <= camera.radius + 1) {
                    const dist = hexDistance(camera, tgt);
                    const opacity = (() => {
                        const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                        return f * f;
                    })();
                    this.drawHexHighlight(ctx, tgt.q, tgt.r, 'rgba(132,196,255,0.0)', '#9fd8ff', opacity);
                }
            }
        }

        // Hover highlight
        if (opts.hoveredTile) {
            const ht = opts.hoveredTile;
            if (hexDistance(camera, ht) <= camera.radius + 1) {
                const dist = hexDistance(camera, ht);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                this.drawHexHighlight(ctx, ht.q, ht.r, 'rgba(255, 227, 122, 0)', '#d0b23d', opacity);
            }
        }

        // Existing task menu tile highlight retained; add cluster border if provided
        if (opts.taskMenuTile && opts.clusterBoundaryTiles && opts.clusterBoundaryTiles.length) {
            const clusterSet = opts.clusterTileIds || new Set<string>();
            // Draw only outer edges (outline) for the cluster
            for (const bt of opts.clusterBoundaryTiles) {
                if (hexDistance(camera, bt) > camera.radius + 1) continue;
                const dist = hexDistance(camera, bt);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                // Compute corners for this hex
                const {x: cx, y: cy} = axialToPixel(bt.q, bt.r);
                const w = this.TILE_DRAW_SIZE;
                const h = this.TILE_DRAW_SIZE;
                const corners: Array<[number, number]> = [
                    [cx + 0.5 * w - HEX_SIZE, cy - HEX_SIZE], // 0 top
                    [cx + w - HEX_SIZE, cy + 0.25 * h - HEX_SIZE], // 1 upper-right
                    [cx + w - HEX_SIZE, cy + 0.75 * h - HEX_SIZE], // 2 lower-right
                    [cx + 0.5 * w - HEX_SIZE, cy + h - HEX_SIZE], // 3 bottom
                    [cx - HEX_SIZE, cy + 0.75 * h - HEX_SIZE], // 4 lower-left
                    [cx - HEX_SIZE, cy + 0.25 * h - HEX_SIZE], // 5 upper-left
                ];
                const nm = bt.neighbors;
                const SIDE_ORDER = ['a','b','c','d','e','f'] as const;
                for (let i = 0; i < SIDE_ORDER.length; i++) {
                    const side = SIDE_ORDER[i]!;
                    const nTile = nm ? nm[side] : null;
                    const outside = !nTile || !nTile.discovered || !nTile.terrain || !clusterSet.has(nTile.id);
                    if (!outside) continue; // skip interior edge
                    // Rotate edge mapping one step CCW: use previous corner -> current corner
                    const p1 = corners[(i + 5) % 6];
                    const p2 = corners[i];
                    if (!p1 || !p2) continue;
                    ctx.save();
                    ctx.globalAlpha = opacity;
                    ctx.beginPath();
                    ctx.moveTo(p1[0], p1[1]);
                    ctx.lineTo(p2[0], p2[1]);
                    ctx.strokeStyle = 'rgba(255,201,77,0.95)';
                    ctx.lineWidth = 3;
                    ctx.lineJoin = 'round';
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // Hover highlight
        if (opts.taskMenuTile) {
            const ht = opts.taskMenuTile;
            if (hexDistance(camera, ht) <= camera.radius + 1) {
                const dist = hexDistance(camera, ht);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                this.drawHexHighlight(ctx, ht.q, ht.r, 'rgba(163,255,61,0.00)', '#91fa31', opacity);
            }
        }

        // Heroes & overlays combined layering
        this.drawHeroes(ctx, opts.hoveredHero, overlayRecords);
        this.drawTextIndicators(ctx);
        this.drawTaskIndicators(ctx);
        ctx.restore();
    }

    private drawTiles(ctx: CanvasRenderingContext2D, overlayRecords: Array<{ img: HTMLImageElement; x: number; y: number; q: number; r: number; opacity: number }>) {
        const cq = Math.round(camera.q);
        const cr = Math.round(camera.r);
        const tiles = getTilesInRadius(cq, cr, camera.radius);
        const now = performance.now();

        for (const t of tiles) {
            const dist = hexDistance(camera, t);
            const opacity = (() => {
                const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                return f * f;
            })();

            if (t.discovered) {
                this.drawTile(t, now, ctx, opacity);
            } else {
                this.drawUndiscoveredTile(ctx, opacity, t);
            }

            const {x, y} = axialToPixel(t.q, t.r);

            // collect optional overlay second layer (only for discovered tiles)
            if (t.discovered) {
                const overlayKey = this.getTileOverlayKey(t);
                if (overlayKey) {
                    const ovImg = this._images[overlayKey];
                    if (ovImg) {
                        const off = this.getTileOverlayOffset(t);
                        // store axial coords for later layering sort (r,q)
                        overlayRecords.push({ img: ovImg, x: x - HEX_SIZE + off.x, y: y - HEX_SIZE + off.y, q: t.q, r: t.r, opacity });
                    }
                }
            }

            // active task highlight overlay (after drawing base tile)
            const activeTasksForTile = taskStore.tasksByTile[t.id];
            if (activeTasksForTile) {
                // If any active task instances are still incomplete, draw a subtle pulsating border
                let chosenTask: TaskInstance | null = null; // for progress bar
                for (const taskId of Object.values(activeTasksForTile)) {
                    const inst = taskStore.taskIndex[taskId];
                    if (inst && !inst.completedMs) {

                        // select task with highest progress ratio (tie break earliest createdMs)
                        const ratio = inst.requiredXp > 0 ? (inst.progressXp / inst.requiredXp) : 0;
                        if (!chosenTask) {
                            chosenTask = inst;
                        } else {
                            const chosenRatio = chosenTask.requiredXp > 0 ? (chosenTask.progressXp / chosenTask.requiredXp) : 0;
                            if (ratio > chosenRatio || (Math.abs(ratio - chosenRatio) < 0.0001 && inst.createdMs < chosenTask.createdMs)) {
                                chosenTask = inst;
                            }
                        }
                    }
                }

                if (chosenTask) {
                    const pulse = (Math.sin(performance.now() / 400) + 1) / 2; // 0..1
                    this.drawHexHighlight(ctx, t.q, t.r, null,'rgba(0, 225, 255, 1)',  opacity * (0.5 + 0.4 * pulse));

                    if (chosenTask && opacity > 0.05) {
                        if(chosenTask.active) {
                            const progressRatioRaw = chosenTask.requiredXp > 0 ? (chosenTask.progressXp / chosenTask.requiredXp) : 0;
                            this.drawProgressBar(ctx, t, Math.min(1, Math.max(0, progressRatioRaw)), 'rgba(255,223,12,0.9)', opacity)
                        } else {
                            // Progress is total required resources vs. collected resources
                            const totalRequired = chosenTask.requiredResources?.reduce((sum, req) => sum + req.amount, 0) || 0;
                            const totalCollected = chosenTask.collectedResources?.reduce((sum, col) => sum + col.amount, 0) || 0;
                            const progressRatioRaw = totalRequired > 0 ? (totalCollected / totalRequired) : 0;
                            this.drawProgressBar(ctx, t, Math.min(1, Math.max(0, progressRatioRaw)), 'rgba(129,134,154,0.9)', opacity)
                        }
                    }
                }
            }
        }
    }

    private drawProgressBar(ctx: CanvasRenderingContext2D, t: Tile, progressRatio: number, fillStyle: string, opacity: number) {
        // Tile bounds
        const {x, y} = axialToPixel(t.q, t.r);
        const tileLeft = x - HEX_SIZE;
        const tileTop = y - HEX_SIZE;
        const tileWidth = this.TILE_DRAW_SIZE;
        const tileHeight = this.TILE_DRAW_SIZE;
        // Bar dimensions
        const barWidth = Math.round(tileWidth * 0.55);
        const barHeight = 7; // small bar
        const marginBottom = 8; // space from bottom edge
        let barX = x - barWidth / 2; // center
        const barY = tileTop + tileHeight - marginBottom - barHeight;
        // Clamp horizontally within tile
        const minX = tileLeft + 4;
        const maxX = tileLeft + tileWidth - barWidth - 4;
        if (barX < minX) barX = minX;
        if (barX > maxX) barX = maxX;

        ctx.save();
        ctx.globalAlpha = opacity; // integrate camera fade
        // Background with rounded corners
        const radius = 16;
        this.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
        ctx.fillStyle = 'rgba(8,24,36,0.55)';
        ctx.fill();
        // Border
        ctx.strokeStyle = fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Fill portion (rounded left, full rounding if complete)
        const filled = Math.max(1, Math.round(barWidth * progressRatio)); // ensure at least 1px if >0
        if (progressRatio > 0) {
            ctx.fillStyle = fillStyle;
            if (progressRatio >= 0.999) {
                this.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
            } else {
                this.drawLeftRoundedRect(ctx, barX, barY, filled, barHeight, radius);
            }
            ctx.fill();
        }
        ctx.restore();
    }

    private drawTaskIndicators(ctx: CanvasRenderingContext2D) {
        const cq = Math.round(camera.q);
        const cr = Math.round(camera.r);
        const tiles = getTilesInRadius(cq, cr, camera.radius);

        for (const t of tiles) {
            const dist = hexDistance(camera, t);
            const opacity = (() => {
                const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                return f * f;
            })();

            const activeTasksForTile = taskStore.tasksByTile[t.id];
            if (activeTasksForTile) {
                for (const taskId of Object.values(activeTasksForTile)) {
                    const inst = taskStore.taskIndex[taskId];
                    if (inst && !inst.completedMs) {
                        this.drawResourceIndicator(ctx, t, inst, opacity);
                    }
                }
            }
        }
    }

    private drawResourceIndicator(ctx: CanvasRenderingContext2D, t: Tile, task: TaskInstance, opacity: number) {
        if (!task.requiredResources || task.requiredResources.length === 0) return;

        const {x, y} = axialToPixel(t.q, t.r);

        // Check which resources still need to be collected
        const pendingResources = task.requiredResources.filter(required => {
            const collected = task.collectedResources?.find(c => c.type === required.type)?.amount || 0;
            return collected < required.amount;
        });

        if (pendingResources.length === 0) return; // All resources collected

        // Build display text
        const resourceTexts = pendingResources.map(required => {
            const collected = task.collectedResources?.find(c => c.type === required.type)?.amount || 0;
            const icon = this.RESOURCE_ICON_MAP[required.type] ?? '?';
            return `${icon} ${collected}/${required.amount}`;
        });

        const text = resourceTexts.join('  ');

        // Draw the text above the tile
        ctx.save();

        // Add a rounded rectangle background with some padding
        const paddingX = 10;
        const paddingY = 6;
        const textMetrics = ctx.measureText(text);
        const rectWidth = textMetrics.width + paddingX * 2;
        const rectHeight = 12 + paddingY * 2; // Approximate height for 9px font

        ctx.globalAlpha = opacity * 0.6;
        this.drawRoundedRect(ctx, x - rectWidth / 2, y - HEX_SIZE - rectHeight + 7, rectWidth, rectHeight, 6);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.font = '8px \'Press Start 2P\', \'VT323\', \'Courier New\', monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        ctx.fillStyle = '#fff6d7aa';
        ctx.fillText(text, x, y - HEX_SIZE);

        ctx.restore();
    }

    private drawTile(t: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number) {
        const {x, y} = axialToPixel(t.q, t.r);
        const key = this.getTileImageKey(t);
        const baseImg = this._images[key ?? 'plains'];
        if (!baseImg) return;
        // Determine animation frame if terrain has frames
        const def: any = (TERRAIN_DEFS as any)[key ?? 'plains'];
        let masked: HTMLCanvasElement | null | undefined = null;
        const frames = (def?.frames && def.frames >= 2) ? def.frames : 0;
        if (!frames) {
            masked = this._maskedImages[key ?? 'plains'];
        } else {
            const frameTime = (def.frameTime && def.frameTime > 0) ? def.frameTime : 250;
            const elapsed = now - this._tileAnimStart;
            const frameIndex = Math.floor(elapsed / frameTime) % frames;
            // Build per-frame masked canvas lazily (cache by key+frameIndex)
            const cacheKey = key + '__f' + frameIndex;
            let frameCanvas = this._maskedImages[cacheKey];
            if (!frameCanvas) {
                const frameWidth = baseImg.width / frames;
                const sx = frameIndex * frameWidth;
                const c = document.createElement('canvas');
                c.width = this.TILE_DRAW_SIZE;
                c.height = this.TILE_DRAW_SIZE;
                const g = c.getContext('2d')!;
                // Clip to hex shape then draw specific frame portion
                g.save();
                g.beginPath();
                const w = this.TILE_DRAW_SIZE;
                const h = this.TILE_DRAW_SIZE;
                g.moveTo(0.5 * w, 0);
                g.lineTo(w, 0.25 * h);
                g.lineTo(w, 0.75 * h);
                g.lineTo(0.5 * w, h);
                g.lineTo(0, 0.75 * h);
                g.lineTo(0, 0.25 * h);
                g.closePath();
                g.clip();
                g.drawImage(baseImg, sx, 0, frameWidth, baseImg.height, 0, 0, w, h);
                g.restore();
                this._maskedImages[cacheKey] = c;
                frameCanvas = c;
            }
            masked = frameCanvas;
        }

        ctx.globalAlpha = opacity;
        if (masked) {
            ctx.drawImage(masked, x - HEX_SIZE, y - HEX_SIZE);
        }
    }

    private drawUndiscoveredTile(ctx: CanvasRenderingContext2D, opacity: number, t: Tile) {
        const {x, y} = axialToPixel(t.q, t.r);
        ctx.globalAlpha = opacity * 0.8;
        ctx.fillStyle = '#3a4662';
        ctx.beginPath();
        const w = this.TILE_DRAW_SIZE;
        const h = this.TILE_DRAW_SIZE;
        ctx.moveTo(x + 0.5 * w - HEX_SIZE, y - HEX_SIZE);
        ctx.lineTo(x + w - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
        ctx.lineTo(x + w - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
        ctx.lineTo(x + 0.5 * w - HEX_SIZE, y + h - HEX_SIZE);
        ctx.lineTo(x - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
        ctx.lineTo(x - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
        ctx.closePath();
        ctx.fill();
        const centerDist = this.axialDistance(0, 0, t.q, t.r);
        ctx.globalAlpha = opacity * 0.95;
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255, ' + opacity + ')';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.translate(0, 0);
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 2;
        ctx.globalAlpha = 0.5 * opacity;
        ctx.fillText(String(centerDist), x - 2, y - 2);
        ctx.restore();
    }

    private drawHeroes(ctx: CanvasRenderingContext2D, hoveredHero: Hero | null, overlayRecords: Array<{ img: HTMLImageElement; x: number; y: number; q: number; r: number; opacity: number }> = []) {
        // If hero assets not yet loaded, just draw overlays and return
        if (!this._heroImagesLoaded) {
            for (const ov of overlayRecords) {
                ctx.globalAlpha = ov.opacity;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(ov.img, ov.x, ov.y, this.TILE_DRAW_SIZE, this.TILE_DRAW_SIZE);
            }
            ctx.globalAlpha = 1;
            return;
        }

        const radius = camera.radius + 1;
        // Rebuild layout map (group heroes by tile first)
        const map = new Map<string, Hero[]>();
        for (const h of heroes) {
            const key = axialKey(h.q, h.r);
            let list = map.get(key);
            if (!list) {
                list = [];
                map.set(key, list);
            }
            list.push(h);
        }
        this._heroLayouts = new Map();
        for (const [k, list] of map) this._heroLayouts.set(k, this.computeTileHeroOffsets(list));

        const now = performance.now();

        // Build hero render records
        // Note: Hero activities are updated by the movement system, not here in the draw loop
        const renderRecords: Array<{
            hero: Hero;
            dist: number;
            img: HTMLImageElement;
            pos: { x: number; y: number };
            interp: { x: number; y: number };
            destX: number;
            destY: number;
            opacity: number;
            activity: string;
            animRow: number;
            frameIndex: number;
        }> = [];

        for (const h of heroes) {
            const dist = hexDistance(camera, h);
            if (dist > radius) continue;
            const img = this._heroImages[h.avatar];
            if (!img) continue;
            const layout = this._heroLayouts.get(axialKey(h.q, h.r)) || {};
            const pos = layout[h.id] || {x: 0, y: 0};
            const opacity = this.computeFade(dist, camera.innerRadius, camera.radius);
            const interp = this.getHeroInterpolatedPixelPosition(h, now);
            const x = interp.x;
            const y = interp.y;
            const destX = x - (this.heroFrameSize * this.heroZoom) / 2 + pos.x - (this.heroFrameSize / 2);
            const destY = y - (this.heroFrameSize * 2) + (this.heroFrameSize / 2) + pos.y;
            let remaining = h.movement ? h.movement.path.length : 0;
            let activity = resolveActivity(remaining);
            if (!h.movement && h.currentTaskId) {
                const inst = taskStore.taskIndex[h.currentTaskId];
                if (inst && inst.active && !inst.completedMs) activity = 'attack';
            }
            const animName = heroAnimName(activity, h.facing);
            const anim = heroAnimationSet.get(animName) || heroAnimationSet.get('idleDown')!;
            const elapsed = now - this._heroAnimStart;
            const frames = anim.frames;
            const frameDuration = anim.frameDuration;
            const cycle = frames * frameDuration + (anim.cooldown || 0);
            const inCycle = elapsed % cycle;
            const frameIndex = (frames <= 1) ? 0 : (inCycle >= frames * frameDuration ? frames - 1 : Math.floor(inCycle / frameDuration));
            this._lastHeroFrame = frameIndex; // keep updated (last processed frame suffices for picking accuracy)
            renderRecords.push({
                hero: h,
                dist,
                img,
                pos,
                interp,
                destX,
                destY,
                opacity,
                activity,
                animRow: anim.row,
                frameIndex
            });
        }

        // Merge overlays and heroes using axial coordinate ordering (r then q ascending).
        type LayerRec = { kind: 'overlay'; ov: { img: HTMLImageElement; x: number; y: number; q: number; r: number; opacity: number } } | { kind: 'hero'; rec: typeof renderRecords[number] };
        const layers: LayerRec[] = [];
        for (const ov of overlayRecords) layers.push({ kind: 'overlay', ov });
        for (const rr of renderRecords) layers.push({ kind: 'hero', rec: rr });
        layers.sort((a, b) => {
            const ar = a.kind === 'overlay' ? a.ov.r : tileIndex[axialKey(a.rec.hero.q, a.rec.hero.r)] ? a.rec.hero.r+1 : a.rec.destY; // hero.r available
            const br = b.kind === 'overlay' ? b.ov.r : tileIndex[axialKey(b.rec.hero.q, b.rec.hero.r)] ? b.rec.hero.r : b.rec.destY;
            if (ar !== br) return ar - br; // smaller r ("lower" coord) first
            const aq = a.kind === 'overlay' ? a.ov.q : a.rec.hero.q;
            const bq = b.kind === 'overlay' ? b.ov.q : b.rec.hero.q;
            if (aq !== bq) return aq - bq; // then q
            // Tie-break: if same tile, draw overlay before hero so hero remains on top (overlay NOT above hero on same tile)
            if (a.kind !== b.kind) return a.kind === 'overlay' ? -1 : 1;
            if (a.kind === 'hero' && b.kind === 'hero') return a.rec.hero.id.localeCompare(b.rec.hero.id);
            return 0;
        });
        this._sortedHeroes = layers.filter(l => l.kind === 'hero').map(l => (l as any).rec.hero);
        for (const layer of layers) {
            if (layer.kind === 'overlay') {
                const {ov} = layer;
                ctx.globalAlpha = ov.opacity;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(ov.img, ov.x, ov.y, this.TILE_DRAW_SIZE, this.TILE_DRAW_SIZE);
                continue;
            }
            const { hero: h, img, pos, interp, destX, destY, opacity, frameIndex, animRow } = layer.rec;
            const x = interp.x;
            const y = interp.y;
            // Shadow first
            ctx.save();
            const shadowScale = this.heroZoom;
            const shadowW = this.heroFrameSize * shadowScale * this.heroShadowWidthFactor;
            const shadowH = this.heroFrameSize * shadowScale * this.heroShadowHeightFactor;
            const baseX = x + pos.x - 15;
            const baseY = y + pos.y + this.heroFrameSize * this.heroShadowYOffset;
            ctx.globalAlpha = opacity * this.heroShadowOpacity;
            ctx.translate(baseX, baseY);
            ctx.beginPath();
            ctx.ellipse(0, 0, shadowW / 2.8, shadowH / 2.2, 0, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(0, 0, shadowH * 0.05, 0, 0, shadowW / 2);
            grad.addColorStop(0, 'rgba(0,0,0,0.8)');
            grad.addColorStop(0.8, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();

            ctx.globalAlpha = opacity;
            ctx.imageSmoothingEnabled = false;
            const frameSize = this.heroFrameSize;
            let sx = frameIndex * frameSize;
            const sy = animRow * frameSize;
            if (shouldFlip(h.facing)) {
                ctx.save();
                ctx.translate(destX + frameSize * this.heroZoom, destY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, frameSize * this.heroZoom, frameSize * this.heroZoom);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy, frameSize, frameSize, destX, destY, frameSize * this.heroZoom, frameSize * this.heroZoom);
            }

            const selected = (selectedHeroId.value === h.id);
            const hovered = hoveredHero && hoveredHero.id === h.id;
            if ((selected || hovered)) {
                const edgeFrames = this._heroEdgePixelsByRow[h.avatar]?.[animRow];
                const edgePixels = edgeFrames ? edgeFrames[frameIndex] : undefined;
                if (edgePixels && edgePixels.length) {
                    ctx.save();
                    ctx.globalAlpha = opacity;
                    if (shouldFlip(h.facing)) {
                        ctx.translate(destX + frameSize * this.heroZoom, destY);
                        ctx.scale(-1, 1);
                    } else {
                        ctx.translate(destX, destY);
                    }
                    ctx.scale(this.heroZoom, this.heroZoom);
                    ctx.fillStyle = selected ? '#c5cbcc' : '#ffffff';
                    ctx.shadowColor = selected ? 'rgba(63,83,94,0.9)' : 'rgba(255,255,255,0.6)';
                    ctx.shadowBlur = selected ? 12 : 8;
                    for (const p of edgePixels) ctx.fillRect(p.x, p.y, 1, 1);
                    ctx.restore();
                }
            }
            // payload carry indicator
            if (h.carryingPayload) {
                ctx.save();
                ctx.globalAlpha = opacity;
                const iconY = destY; // above head
                const iconX = destX + (this.heroFrameSize * this.heroZoom) / 2;
                ctx.beginPath();
                ctx.arc(iconX, iconY, 14, 0, Math.PI * 2);
                ctx.fillStyle = h.carryingPayload.amount > 0 ?  'rgba(29,29,33,0.95)' : 'rgba(122,122,122,0.55)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = h.carryingPayload.amount > 0 ? 'rgba(70,70,70,0.9)' : 'rgba(75,0,0,0.85)';
                ctx.stroke();
                ctx.font = '700 16px system-ui';
                ctx.fillStyle = '#fff6d7';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.RESOURCE_ICON_MAP[h.carryingPayload.type], iconX, iconY + 1);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    }

    RESOURCE_ICON_MAP: Record<ResourceType, string> = {
        wood: '🪵',
        ore: '⛏️',
        stone: '🪨',
        food: '🍎',
        crystal: '🔮',
        artifact: '🗿',
        water: '💧',
        grain: '🌾',
    };

    private getTileOverlayKey(t: Tile): string | null {
        if (!t.terrain) return null;
        const def: any = (TERRAIN_DEFS as any)[t.terrain];
        let overlayKey: string | undefined = def?.overlayAssetKey;
        if (t.variant && def?.variations) {
            const vDef = def.variations.find((v: any) => v.key === t.variant);
            if (vDef?.overlayAssetKey) overlayKey = vDef.overlayAssetKey;
            if(vDef?.overlayAssetKey === false) overlayKey = undefined;
        }
        if (!overlayKey) return null;
        return this.tileImgSources[overlayKey] ? overlayKey : null;
    }

    private getTileOverlayOffset(t: Tile): { x: number; y: number } {
        if (!t.terrain) return {x:0,y:0};
        const def: any = (TERRAIN_DEFS as any)[t.terrain];
        let offset = def?.overlayOffset || {x:0,y:0};
        if (t.variant && def?.variations) {
            const vDef = def.variations.find((v: any) => v.key === t.variant);
            if (vDef?.overlayOffset) offset = vDef.overlayOffset;
        }
        return offset || {x:0,y:0};
    }

    private async loadTileImages() {
        // Pre-mask all static images; if animated frames needed later, handled per draw.
        const canvasCache: Record<string, HTMLCanvasElement> = {};
        for (const [key, src] of Object.entries(this.tileImgSources)) {
            const img = new Image();
            img.src = src;
            await img.decode().catch(() => {});
            this._images[key] = img;
            // Build masked hex canvas
            const c = document.createElement('canvas');
            c.width = this.TILE_DRAW_SIZE;
            c.height = this.TILE_DRAW_SIZE;
            const g = c.getContext('2d')!;
            g.save();
            g.beginPath();
            const w = this.TILE_DRAW_SIZE;
            const h = this.TILE_DRAW_SIZE;
            g.moveTo(0.5 * w, 0);
            g.lineTo(w, 0.25 * h);
            g.lineTo(w, 0.75 * h);
            g.lineTo(0.5 * w, h);
            g.lineTo(0, 0.75 * h);
            g.lineTo(0, 0.25 * h);
            g.closePath();
            g.clip();
            g.drawImage(img, 0, 0, w, h);
            g.restore();
            canvasCache[key] = c;
        }
        this._maskedImages = canvasCache;
        this._imagesLoaded = true;
    }

    private buildHeroMasks(img: HTMLImageElement, avatar: string) {
        if (!this._heroMasksByRow[avatar]) this._heroMasksByRow[avatar] = {};
        if (!this._heroEdgePixelsByRow[avatar]) this._heroEdgePixelsByRow[avatar] = {};
        const processedRows = new Set<number>();
        for (const anim of heroAnimationSet.list()) {
            const row = anim.row;
            if (processedRows.has(row)) continue;
            processedRows.add(row);
            const frames = anim.frames;
            const masks: Uint8Array[] = [];
            const edges: { x: number; y: number }[][] = [];
            for (let f = 0; f < frames; f++) {
                const sx = f * this.heroFrameSize;
                const sy = row * this.heroFrameSize;
                const c = document.createElement('canvas');
                c.width = this.heroFrameSize;
                c.height = this.heroFrameSize;
                const g = c.getContext('2d')!;
                g.drawImage(img, sx, sy, this.heroFrameSize, this.heroFrameSize, 0, 0, this.heroFrameSize, this.heroFrameSize);
                const data = g.getImageData(0, 0, this.heroFrameSize, this.heroFrameSize);
                const mask = new Uint8Array(this.heroFrameSize * this.heroFrameSize);
                const edgeList: { x: number; y: number }[] = [];
                for (let y = 0; y < this.heroFrameSize; y++) {
                    for (let x = 0; x < this.heroFrameSize; x++) {
                        const idx = (y * this.heroFrameSize + x) * 4;
                        const alpha = data.data[idx + 3]!;
                        if (alpha > 20) mask[y * this.heroFrameSize + x] = 1;
                    }
                }
                for (let y = 0; y < this.heroFrameSize; y++) {
                    for (let x = 0; x < this.heroFrameSize; x++) {
                        if (!mask[y * this.heroFrameSize + x]) continue;
                        let edge = false;
                        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
                        for (const [dx, dy] of dirs) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || nx >= this.heroFrameSize || ny < 0 || ny >= this.heroFrameSize || !mask[ny * this.heroFrameSize + nx]) {
                                edge = true;
                                break;
                            }
                        }
                        if (edge) edgeList.push({x, y});
                    }
                }
                masks.push(mask);
                edges.push(edgeList);
            }
            this._heroMasksByRow[avatar][row] = masks;
            this._heroEdgePixelsByRow[avatar][row] = edges;
        }
    }

    private drawTextIndicators(ctx: CanvasRenderingContext2D) {
        for (const ind of getTextIndicators()) {
            const dist = hexDistance(camera, {q: ind.position.q, r: ind.position.r});
            if (dist > camera.radius + 1) continue;

            const {x, y} = axialToPixel(ind.position.q, ind.position.r);
            const progress = Math.min(1, (performance.now() - ind.created) / ind.duration);
            const floatY = y - HEX_SIZE - 10 - (progress * 28); // float up
            const alpha = 1 - progress;

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = "12px 'Press Start 2P', 'VT323', 'Courier New', monospace";
            ctx.fillStyle = ind.color || '#ffe066';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#222';
            ctx.shadowBlur = 4;
            ctx.fillText(ind.text, x + (ind.position?.currentOffset?.x ?? 0) - 16, floatY + (ind.position?.currentOffset?.y ?? 0));
            ctx.restore();
        }
    }

    private async ensureHeroAssets() {
        const unique = Array.from(new Set(heroes.map(h => h.avatar)));
        const promises = unique.map(src => new Promise<void>(resolve => {
            if (this._heroImages[src]) {
                this.buildHeroMasks(this._heroImages[src], src);
                resolve();
                return;
            }
            const img = new Image();
            img.onload = () => {
                this._heroImages[src] = img;
                this.buildHeroMasks(img, src);
                resolve();
            };
            img.src = src;
        }));
        await Promise.all(promises);
        this._heroImagesLoaded = true;
    }

    private adaptiveCameraRadius() {
        if (!this._container) return;
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        const diag = Math.min(w, h);
        const tilePixelSpan = HEX_SIZE * 2;
        const targetRadius = Math.max(8, Math.min(64, Math.round(diag / tilePixelSpan * 1.25)));
        const inner = Math.max(3, Math.round(targetRadius * 0.33));
        updateCameraRadius(targetRadius, inner);
    }

    // Recenter camera when world smaller than view radius so map stays centered on resize.
    private recenterIfWorldFits() {
        // Margin so we don't over-recenter for worlds just barely smaller than radius.
        const margin = 3;
        if (camera.radius >= worldOuterRadius.value + margin) {
            centerCamera();
        }
    }

    private axialDistance(aQ: number, aR: number, bQ: number, bR: number) {
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

    private isHeroWalking(hero: Hero): boolean {
        return !!hero.movement;
    }

    private getHeroInterpolatedPixelPosition(hero: Hero, now: number) {
        if (!hero.movement) return axialToPixel(hero.q, hero.r);
        const m = hero.movement;
        const elapsed = now - m.startMs;
        if (elapsed < 0) return axialToPixel(hero.q, hero.r);

        // If variable durations available use them
        if (m.stepDurations && m.cumulative && m.stepDurations.length === m.path.length && m.cumulative.length === m.path.length) {
            const total = m.cumulative[m.cumulative.length - 1]!;
            if (elapsed >= total) return axialToPixel(hero.q, hero.r); // movement effectively done
            // Find current step index (first cumulative > elapsed)
            let stepIndex = 0;
            while (stepIndex < m.cumulative.length && elapsed >= m.cumulative[stepIndex]!) stepIndex++;
            if (stepIndex >= m.path.length) return axialToPixel(hero.q, hero.r);
            const prevEnd = stepIndex === 0 ? 0 : m.cumulative[stepIndex - 1]!;
            const stepElapsed = elapsed - prevEnd;
            const stepDuration = m.stepDurations[stepIndex]! || m.stepMs;
            const progress = Math.min(1, Math.max(0, stepElapsed / stepDuration));
            const from = stepIndex === 0 ? m.origin : m.path[stepIndex - 1];
            const to = m.path[stepIndex];
            if (!from || !to) return axialToPixel(hero.q, hero.r);
            const fromPx = axialToPixel(from.q, from.r);
            const toPx = axialToPixel(to.q, to.r);

            return {x: fromPx.x + (toPx.x - fromPx.x) * progress, y: fromPx.y + (toPx.y - fromPx.y) * progress};
        }

        // Fallback legacy uniform timing
        const stepIndex = Math.floor(elapsed / m.stepMs);
        if (stepIndex >= m.path.length) {
            return axialToPixel(hero.q, hero.r);
        }
        const stepElapsed = elapsed - stepIndex * m.stepMs;
        const progress = Math.min(1, Math.max(0, stepElapsed / m.stepMs));
        const from = stepIndex === 0 ? m.origin : m.path[stepIndex - 1];
        const to = m.path[stepIndex];
        if (!from || !to) return axialToPixel(hero.q, hero.r);
        const fromPx = axialToPixel(from.q, from.r);
        const toPx = axialToPixel(to.q, to.r);
        return {
            x: fromPx.x + (toPx.x - fromPx.x) * progress,
            y: fromPx.y + (toPx.y - fromPx.y) * progress,
        };
    }

    // Helper: draw rounded rectangle (all corners)
    private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // Helper: draw rounded rectangle only on left side (used for partial progress fill)
    private drawLeftRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    private computeTileHeroOffsets(list: Hero[]): Record<string, { x: number; y: number }> {
        const mutliplayerTileOffset = this.computeMultiplayerTileHeroOffsets(list);
        // Apply tile (variant) heroOffset if defined
        const result: Record<string, { x: number; y: number }> = {};
        for (const h of list) {
            const t = tileIndex[axialKey(h.q, h.r)];
            let variantOffset: { x: number; y: number } | null = null;
            if (t && t.terrain) {
                const def: any = (TERRAIN_DEFS as any)[t.terrain];
                if (t.variant && def?.variations) {
                    const vDef = def.variations.find((v: any) => v.key === t.variant);
                    if (vDef?.heroOffset) variantOffset = vDef.heroOffset;
                }
                if (!variantOffset && def?.heroOffset) variantOffset = def.heroOffset;
            }
            const multiOffset = mutliplayerTileOffset[h.id] || {x: 0, y: 0};
            let offset = {
                x: multiOffset.x + (variantOffset ? variantOffset.x : 0),
                y: multiOffset.y + (variantOffset ? variantOffset.y : 0),
            }
            result[h.id] = offset;
            h.currentOffset = offset;
        }
        return result;
    }

    private computeMultiplayerTileHeroOffsets(list: Hero[]): Record<string, { x: number; y: number }> {
        const result: Record<string, { x: number; y: number }> = {};
        const count = list.length;
        if (count === 0) return result;
        if (count === 1) { result[list[0]!.id] = {x: 12, y: 0}; return result; }
        if (count === 2) { result[list[0]!.id] = {x: -5, y: 0}; result[list[1]!.id] = {x: 32, y: 0}; return result; }
        if (count === 3) { result[list[0]!.id] = {x: -5, y: -2}; result[list[1]!.id] = {x: 12, y: 8}; result[list[2]!.id] = {x: 32, y: -2}; return result; }
        if (count === 4) { result[list[0]!.id] = {x: 12, y: -10}; result[list[1]!.id] = {x: -7, y: 4}; result[list[2]!.id] = {x: 32, y: 4}; result[list[3]!.id] = {x: 12, y: 18}; return result; }
        if (count === 5) { result[list[0]!.id] = {x: 16, y: -10}; result[list[1]!.id] = {x: -7, y: 4}; result[list[2]!.id] = {x: 32, y: 4}; result[list[3]!.id] = {x: 10, y: 8}; result[list[4]!.id] = {x: 16, y: 22}; return result; }
        if (count === 6) { result[list[0]!.id] = {x: 16, y: -12}; result[list[1]!.id] = {x: -10, y: 0}; result[list[2]!.id] = {x: 38, y: 0}; result[list[3]!.id] = {x: 0, y: 12}; result[list[4]!.id] = {x: 28, y: 16}; result[list[5]!.id] = {x: 16, y: 28}; return result; }
        const span = count - 1;
        for (let i = 0; i < count; i++) {
            const offset = (i - span / 2) * this.HERO_OFFSET_SPACING;
            result[list[i]!.id] = {x: offset, y: 0};
        }
        return result;
    }

    // RESTORED: original tile image key resolution (variant overrides base)
    private getTileImageKey(t: Tile): string | null {
        if (!t.terrain) return null;
        const def: any = (TERRAIN_DEFS as any)[t.terrain];
        if (t.variant) {
            const variantDef = def?.variations?.find((v: any) => v.key === t.variant);
            const vk = variantDef?.assetKey || t.variant;
            if (this.tileImgSources[vk]) return vk;
        }
        const baseKey = def?.assetKey || t.terrain;
        return this.tileImgSources[baseKey] ? baseKey : null;
    }
}
