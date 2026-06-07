import { getStorageFreeCapacity, getStorageUsedCapacity, storageInventories } from '../../../store/resourceStore';
import { heroes } from '../../../store/heroStore';
import { selectedHeroId } from '../../../store/uiStore';
import { taskStore } from '../../../store/taskStore';
import { formatStorageAmount, getStorageCapacity, getStorageKindLabel } from '../../../shared/game/storage';
import { getScoutScanProgress } from '../../../shared/game/scoutResources';
import { canUseWarehouseAtTile, getStorageKindForTile } from '../../../shared/buildings/storage';
import { camera, axialToPixel, hexDistance } from '../../camera';
import type { Hero } from '../../types/Hero';
import type { ResourceType } from '../../types/Resource';
import type { TaskInstance } from '../../types/Task';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext } from '../RenderPassContext';
import { GROWTH_HYBRID_STYLE } from '../visualStyle';

const SCOUTED_TILE_STYLE = {
    stroke: 'rgba(203, 213, 225, 0.46)',
    foundStroke: 'rgba(125, 211, 252, 0.82)',
};

export function getBuildingHealthBar(tile: Tile | null | undefined): { percent: number } | null {
    const maxDurability = tile?.towerDurabilityMax ?? 0;
    if (maxDurability <= 0) {
        return null;
    }

    const currentDurability = Math.max(0, Math.min(maxDurability, tile?.towerDurability ?? maxDurability));
    const isDamaged = currentDurability < maxDurability;
    const isUnderAttack = !!tile?.towerAttackerSettlementId || (tile?.towerCaptureProgress ?? 0) > 0;
    if (!isDamaged && !isUnderAttack) {
        return null;
    }

    return {
        percent: Math.max(0, Math.min(100, Math.round((currentDurability / maxDurability) * 100))),
    };
}

interface CameraCompositeStateLike {
    offsetX: number;
    offsetY: number;
    roll: number;
    zoom: number;
}

interface DrawOptionsLike {
    hoveredTile: Tile | null;
    taskMenuTile: Tile | null;
    pathCoords: Array<{ q: number; r: number }>;
    clusterBoundaryTiles?: Tile[];
    clusterTileIds?: Set<string>;
    globalReachBoundary?: Array<{ q: number; r: number }>;
    globalReachTileIds?: Set<string>;
    globalReachColor?: string;
    globalReachDashed?: boolean;
    settlementReachOutlines?: Array<{
        boundary: Array<{ q: number; r: number }>;
        tileIds: Set<string>;
        color?: string | null;
        isOwn?: boolean;
        dashed?: boolean;
    }>;
    storyHintTiles?: Tile[];
    showSupportOverlay?: boolean;
    hoveredTileInReach?: boolean;
}

interface RenderFrameLike {
    cameraFx: CameraCompositeStateLike;
    effectNowMs: number;
    movementNowMs: number;
    visibleTiles: Tile[];
    surfaceContent?: {
        overlayUnderlay?: boolean;
        overlayTop: boolean;
    };
}

interface OverlayRendererDependencies {
    canvas: HTMLCanvasElement | null;
    dpr: number;
    hexSize: number;
    tileDrawSize: number;
    heroFrameSize: number;
    resourceIconMap: Record<string, string>;
    storageIndicatorAlphaByTileId: Map<string, number>;
    getCanvasCenter(): { cx: number; cy: number };
    applyWorldTransform(
        ctx: CanvasRenderingContext2D,
        translateX: number,
        translateY: number,
        cameraFx: CameraCompositeStateLike,
    ): void;
    computeFade(dist: number, inner: number, radius: number): number;
    getTileOpacity(dist: number, applyCameraFade: boolean): number;
    drawHexHighlight(
        ctx: CanvasRenderingContext2D,
        q: number,
        r: number,
        fill: string | null,
        stroke: string | null,
        opacity: number,
    ): void;
    drawSupportOverlay(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        applyCameraFade: boolean,
        showSupportOverlay: boolean,
    ): void;
    drawGameplayWorldImpacts(
        ctx: CanvasRenderingContext2D,
        nowMs: number,
        applyCameraFade: boolean,
    ): void;
    hasGameplayWorldImpacts(nowMs: number): boolean;
    drawGrowthTileMotion(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        nowMs: number,
    ): void;
    hasGrowthTileMotion(
        tiles: Tile[],
        nowMs: number,
    ): boolean;
    drawReachOutline(
        ctx: CanvasRenderingContext2D,
        boundary: Array<{ q: number; r: number }>,
        reachSet: Set<string>,
        alpha: number,
        hovered?: boolean,
        color?: string | null,
        options?: { dashed?: boolean },
    ): void;
    drawRoundedRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ): void;
    projectWorldToScreenPixels(
        worldX: number,
        worldY: number,
        cameraFx: CameraCompositeStateLike,
    ): { x: number; y: number };
    isHeroIdle(hero: Hero, now: number): boolean;
    isHeroWalking(hero: Hero, now: number): boolean;
}

interface TileOverlayActivity {
    leadingTask: TaskInstance | null;
    scoutProgress: number | null;
}

interface TileTaskState {
    incompleteTasks: TaskInstance[];
    leadingTask: TaskInstance | null;
}

interface OverlayFrameSummary {
    activeTilesByEffectNow: Tile[];
    buildingHealthTiles: Tile[];
    progressTilesByMovementNow: Tile[];
    taskIndicatorTiles: Tile[];
    storageIndicatorTiles: Tile[];
}

export class OverlayRenderer {
    private hadUnderlayContent = false;
    private hadTopContent = false;
    private cachedFrame: RenderFrameLike | null = null;
    private cachedSummaryFrame: RenderFrameLike | null = null;
    private cachedSummaryOptions: DrawOptionsLike | null = null;
    private cachedSummaryDeps: OverlayRendererDependencies | null = null;
    private cachedSummary: OverlayFrameSummary | null = null;
    private tileActivityCache = new Map<string, TileOverlayActivity>();
    private tileTaskCache = new Map<string, TileTaskState>();
    private scoutProgressByNowMsCache = new Map<number, Map<string, number>>();
    private topOverlayCacheKey = '';

    renderLayers(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        this.prepareFrameCaches(frame);
        const summary = this.getFrameSummary(frame, opts, deps);
        this.drawUnderlay(context, frame, opts, deps, summary);
        this.drawTop(context, frame, opts, deps, summary);
    }

    drawDepthEdgeHighlights(
        ctx: CanvasRenderingContext2D,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        this.prepareFrameCaches(frame);
        const summary = this.getFrameSummary(frame, opts, deps);
        this.drawPathTopHighlights(ctx, frame, opts, deps);
        this.drawStoryHintHighlights(ctx, opts.storyHintTiles ?? [], frame.effectNowMs, deps, false);
        this.drawScoutedTopHighlights(ctx, frame.visibleTiles, opts, deps);
        this.drawInteractiveTopHighlights(ctx, frame, opts, deps);
        this.drawActiveTaskHighlights(ctx, summary.activeTilesByEffectNow, frame.effectNowMs, deps);
    }

    private drawUnderlay(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
        summary: OverlayFrameSummary,
    ) {
        const underlay = context.overlayUnderlaySurface;
        if (!underlay || !deps.canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        if (!this.hasUnderlayContent(frame, opts, deps, summary)) {
            if (this.hadUnderlayContent) {
                underlay.ctx.clearRect(0, 0, underlay.canvas.width, underlay.canvas.height);
            }
            this.hadUnderlayContent = false;
            if (frame.surfaceContent) {
                frame.surfaceContent.overlayUnderlay = false;
            }
            return;
        }

        this.hadUnderlayContent = true;
        if (frame.surfaceContent) {
            frame.surfaceContent.overlayUnderlay = true;
        }

        underlay.ctx.clearRect(0, 0, underlay.canvas.width, underlay.canvas.height);
        underlay.ctx.save();
        underlay.ctx.scale(deps.dpr, deps.dpr);
        deps.applyWorldTransform(underlay.ctx, translateX, translateY, frame.cameraFx);

        deps.drawGameplayWorldImpacts(underlay.ctx, frame.effectNowMs, false);
        deps.drawSupportOverlay(underlay.ctx, frame.visibleTiles, false, opts.showSupportOverlay === true);
        deps.drawGrowthTileMotion(underlay.ctx, frame.visibleTiles, frame.effectNowMs);
        this.drawActiveTaskHighlights(underlay.ctx, summary.activeTilesByEffectNow, frame.effectNowMs, deps);
        this.drawStoryHintHighlights(underlay.ctx, opts.storyHintTiles ?? [], frame.effectNowMs, deps);

        const selectedHero = selectedHeroId.value ? heroes.find((hero) => hero.id === selectedHeroId.value) || null : null;
        const selectedHeroIdle = selectedHero ? deps.isHeroIdle(selectedHero, frame.movementNowMs) : false;
        const selectedHeroWalking = selectedHero ? deps.isHeroWalking(selectedHero, frame.movementNowMs) : false;

        if ((selectedHeroIdle || selectedHeroWalking) && opts.pathCoords.length) {
            const first = opts.pathCoords[0];
            const drawPath = selectedHero && first && (first.q !== selectedHero.q || first.r !== selectedHero.r)
                ? [{ q: selectedHero.q, r: selectedHero.r }, ...opts.pathCoords]
                : opts.pathCoords;

            for (const pc of drawPath) {
                if (hexDistance(camera, pc) > camera.radius + 1) continue;
                const dist = hexDistance(camera, pc);
                const opacity = (() => {
                    const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                    return fade * fade;
                })();
                const last = pc === drawPath[drawPath.length - 1];
                deps.drawHexHighlight(
                    underlay.ctx,
                    pc.q,
                    pc.r,
                    last ? 'rgba(255,244,206,0.03)' : 'rgba(226,250,255,0.02)',
                    last ? GROWTH_HYBRID_STYLE.outlines.pathTarget : GROWTH_HYBRID_STYLE.outlines.path,
                    opacity,
                );
            }
        } else if (selectedHero?.movement) {
            const movement = selectedHero.movement;
            let currentIndex = movement.path.findIndex((point) => point.q === selectedHero.q && point.r === selectedHero.r);
            if (currentIndex < 0 && selectedHero.q === movement.origin.q && selectedHero.r === movement.origin.r) {
                currentIndex = -1;
            }
            const remaining = movement.path.slice(Math.max(0, currentIndex + 1));
            if (remaining.length) {
                for (let i = 0; i < remaining.length; i++) {
                    const pc = remaining[i]!;
                    if (hexDistance(camera, pc) > camera.radius + 1) continue;
                    const dist = hexDistance(camera, pc);
                    const opacity = (() => {
                        const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                        return fade * fade;
                    })();
                    deps.drawHexHighlight(
                        underlay.ctx,
                        pc.q,
                        pc.r,
                        'rgba(226,250,255,0.02)',
                        i === remaining.length - 1 ? GROWTH_HYBRID_STYLE.outlines.pathTarget : GROWTH_HYBRID_STYLE.outlines.path,
                        opacity,
                    );
                }
            } else {
                const target = movement.target;
                if (hexDistance(camera, target) <= camera.radius + 1) {
                    const dist = hexDistance(camera, target);
                    const opacity = (() => {
                        const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                        return fade * fade;
                    })();
                    deps.drawHexHighlight(underlay.ctx, target.q, target.r, 'rgba(226,250,255,0.02)', GROWTH_HYBRID_STYLE.outlines.path, opacity);
                }
            }
        }

        if (opts.hoveredTile && hexDistance(camera, opts.hoveredTile) <= camera.radius + 1) {
            const dist = hexDistance(camera, opts.hoveredTile);
            const opacity = (() => {
                const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                return fade * fade;
            })();
            const inReach = opts.hoveredTileInReach !== false;
            deps.drawHexHighlight(
                underlay.ctx,
                opts.hoveredTile.q,
                opts.hoveredTile.r,
                inReach ? 'rgba(255, 239, 177, 0.025)' : 'rgba(138, 102, 102, 0.03)',
                inReach ? GROWTH_HYBRID_STYLE.outlines.hover : GROWTH_HYBRID_STYLE.outlines.unreachable,
                opacity * (0.72 + (((Math.sin(frame.effectNowMs / 360) + 1) / 2) * 0.2)),
            );
        }

        if (opts.taskMenuTile && opts.clusterBoundaryTiles && opts.clusterBoundaryTiles.length) {
            const clusterSet = opts.clusterTileIds || new Set<string>();
            for (const tile of opts.clusterBoundaryTiles) {
                if (hexDistance(camera, tile) > camera.radius + 1) continue;
                const dist = hexDistance(camera, tile);
                const opacity = (() => {
                    const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                    return fade * fade;
                })();
                const { x, y } = axialToPixel(tile.q, tile.r);
                const w = deps.tileDrawSize;
                const h = deps.tileDrawSize;
                const corners: Array<[number, number]> = [
                    [x + 0.5 * w - deps.hexSize, y - deps.hexSize],
                    [x + w - deps.hexSize, y + 0.25 * h - deps.hexSize],
                    [x + w - deps.hexSize, y + 0.75 * h - deps.hexSize],
                    [x + 0.5 * w - deps.hexSize, y + h - deps.hexSize],
                    [x - deps.hexSize, y + 0.75 * h - deps.hexSize],
                    [x - deps.hexSize, y + 0.25 * h - deps.hexSize],
                ];
                const sideOrder = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
                for (let i = 0; i < sideOrder.length; i++) {
                    const side = sideOrder[i]!;
                    const neighborTile = tile.neighbors ? tile.neighbors[side] : null;
                    const outside = !neighborTile || !neighborTile.discovered || !neighborTile.terrain || !clusterSet.has(neighborTile.id);
                    if (!outside) continue;
                    const p1 = corners[(i + 5) % 6];
                    const p2 = corners[i];
                    if (!p1 || !p2) continue;
                    underlay.ctx.save();
                    underlay.ctx.globalAlpha = opacity;
                    underlay.ctx.beginPath();
                    underlay.ctx.moveTo(p1[0], p1[1]);
                    underlay.ctx.lineTo(p2[0], p2[1]);
                    underlay.ctx.strokeStyle = GROWTH_HYBRID_STYLE.outlines.cluster;
                    underlay.ctx.lineWidth = 2.2;
                    underlay.ctx.lineJoin = 'round';
                    underlay.ctx.stroke();
                    underlay.ctx.restore();
                }
            }
        }

        if (opts.taskMenuTile && hexDistance(camera, opts.taskMenuTile) <= camera.radius + 1) {
            const dist = hexDistance(camera, opts.taskMenuTile);
            const opacity = (() => {
                const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                return fade * fade;
            })();
            deps.drawHexHighlight(
                underlay.ctx,
                opts.taskMenuTile.q,
                opts.taskMenuTile.r,
                'rgba(187,248,146,0.025)',
                GROWTH_HYBRID_STYLE.outlines.selected,
                opacity,
            );
        }

        underlay.ctx.restore();
    }

    private hasUnderlayContent(
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
        summary: OverlayFrameSummary,
    ) {
        if (deps.hasGameplayWorldImpacts(frame.effectNowMs)) return true;
        if (opts.showSupportOverlay === true) return true;
        if (deps.hasGrowthTileMotion(frame.visibleTiles, frame.effectNowMs)) return true;
        if (summary.activeTilesByEffectNow.length > 0) return true;
        if ((opts.storyHintTiles?.length ?? 0) > 0) return true;
        if (opts.pathCoords.length > 0) return true;
        if (opts.hoveredTile) return true;
        if (opts.taskMenuTile) return true;
        if ((opts.clusterBoundaryTiles?.length ?? 0) > 0) return true;

        const selectedHero = selectedHeroId.value ? heroes.find((hero) => hero.id === selectedHeroId.value) || null : null;
        return !!selectedHero?.movement;
    }

    private drawTop(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
        summary: OverlayFrameSummary,
    ) {
        const overlay = context.overlayTopSurface;
        if (!overlay || !deps.canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        if (!this.hasTopOverlayContent(opts, summary)) {
            if (this.hadTopContent) {
                overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
            }
            this.hadTopContent = false;
            this.topOverlayCacheKey = '';
            if (frame.surfaceContent) {
                frame.surfaceContent.overlayTop = false;
            }
            return;
        }

        this.hadTopContent = true;
        if (frame.surfaceContent) {
            frame.surfaceContent.overlayTop = true;
        }

        const topOverlayCacheKey = this.getReusableTopOverlayCacheKey(context, frame, opts, summary);
        if (topOverlayCacheKey && this.topOverlayCacheKey === topOverlayCacheKey) {
            return;
        }

        this.topOverlayCacheKey = topOverlayCacheKey;
        overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
        overlay.ctx.save();
        overlay.ctx.scale(deps.dpr, deps.dpr);
        deps.applyWorldTransform(overlay.ctx, translateX, translateY, frame.cameraFx);

        if (opts.settlementReachOutlines?.length) {
            for (const outline of opts.settlementReachOutlines) {
                deps.drawReachOutline(
                    overlay.ctx,
                    outline.boundary,
                    outline.tileIds,
                    outline.isOwn ? 0.45 : 0.08,
                    false,
                    outline.color || undefined,
                    { dashed: outline.dashed },
                );
            }
        } else if (opts.globalReachBoundary?.length) {
            deps.drawReachOutline(
                overlay.ctx,
                opts.globalReachBoundary,
                opts.globalReachTileIds || new Set<string>(),
                0.45,
                false,
                opts.globalReachColor,
                { dashed: opts.globalReachDashed },
            );
        }

        this.drawTaskProgressBars(overlay.ctx, summary.progressTilesByMovementNow, frame.movementNowMs, deps);
        this.drawBuildingHealthBars(overlay.ctx, summary.buildingHealthTiles, deps);
        this.drawTaskIndicators(
            overlay.ctx,
            summary.taskIndicatorTiles,
            summary.storageIndicatorTiles,
            false,
            opts.hoveredTile,
            deps,
        );
        overlay.ctx.restore();
    }

    private hasTopOverlayContent(
        opts: DrawOptionsLike,
        summary: OverlayFrameSummary,
    ) {
        if (opts.settlementReachOutlines?.length || opts.globalReachBoundary?.length) {
            return true;
        }

        return summary.progressTilesByMovementNow.length > 0
            || summary.buildingHealthTiles.length > 0
            || summary.taskIndicatorTiles.length > 0
            || summary.storageIndicatorTiles.length > 0;
    }

    private getReusableTopOverlayCacheKey(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        summary: OverlayFrameSummary,
    ) {
        if (
            summary.progressTilesByMovementNow.length > 0
            || summary.buildingHealthTiles.length > 0
            || summary.storageIndicatorTiles.length > 0
        ) {
            return '';
        }

        const overlay = context.overlayTopSurface;
        if (!overlay) {
            return '';
        }

        return [
            overlay.canvas.width,
            overlay.canvas.height,
            context.viewport.dpr,
            context.viewport.cameraX,
            context.viewport.cameraY,
            context.viewport.cameraQ,
            context.viewport.cameraR,
            context.viewport.zoom,
            context.viewport.roll,
            context.viewport.offsetX,
            context.viewport.offsetY,
            context.scene.frameInfo.worldRenderVersion,
            frame.cameraFx.offsetX,
            frame.cameraFx.offsetY,
            frame.cameraFx.roll,
            frame.cameraFx.zoom,
            this.getReachOverlayCacheKey(opts),
            this.getTaskIndicatorCacheKey(summary.taskIndicatorTiles),
        ].join(':');
    }

    private getReachOverlayCacheKey(opts: DrawOptionsLike) {
        if (opts.settlementReachOutlines?.length) {
            return opts.settlementReachOutlines
                .map((outline) => [
                    outline.color ?? '',
                    outline.isOwn ? 1 : 0,
                    outline.dashed ? 1 : 0,
                    outline.boundary.map((point) => `${point.q},${point.r}`).join(';'),
                    [...outline.tileIds].sort().join(';'),
                ].join(','))
                .join('|');
        }

        if (opts.globalReachBoundary?.length) {
            return [
                opts.globalReachColor ?? '',
                opts.globalReachDashed ? 1 : 0,
                opts.globalReachBoundary.map((point) => `${point.q},${point.r}`).join(';'),
                [...(opts.globalReachTileIds ?? new Set<string>())].sort().join(';'),
            ].join(',');
        }

        return '';
    }

    private getTaskIndicatorCacheKey(tiles: Tile[]) {
        return tiles
            .map((tile) => {
                const taskState = this.getTileTaskState(tile);
                return [
                    tile.id,
                    tile.q,
                    tile.r,
                    taskState.incompleteTasks.map((task) => [
                        task.id,
                        task.type,
                        task.requiredResources?.map((resource) => `${resource.type}:${resource.amount}`).join(';') ?? '',
                        task.collectedResources?.map((resource) => `${resource.type}:${resource.amount}`).join(';') ?? '',
                    ].join('/')).join(','),
                ].join('@');
            })
            .join('|');
    }

    private drawScoutedTopHighlights(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of tiles) {
            if (tile.discovered || !tile.scouted || hexDistance(camera, tile) > camera.radius + 1) {
                continue;
            }

            const dist = hexDistance(camera, tile);
            const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
            const inReach = !opts.globalReachTileIds || opts.globalReachTileIds.has(`${tile.q},${tile.r}`);
            const reachDim = inReach ? 1 : 0.35;
            deps.drawHexHighlight(
                ctx,
                tile.q,
                tile.r,
                null,
                tile.scoutFoundResource ? SCOUTED_TILE_STYLE.foundStroke : SCOUTED_TILE_STYLE.stroke,
                fade * fade * (tile.scoutFoundResource ? 0.78 : 0.55) * reachDim,
            );
        }
    }

    private drawPathTopHighlights(
        ctx: CanvasRenderingContext2D,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        const selectedHero = selectedHeroId.value ? heroes.find((hero) => hero.id === selectedHeroId.value) || null : null;
        const selectedHeroIdle = selectedHero ? deps.isHeroIdle(selectedHero, frame.movementNowMs) : false;
        const selectedHeroWalking = selectedHero ? deps.isHeroWalking(selectedHero, frame.movementNowMs) : false;

        const drawPathStroke = (path: Array<{ q: number; r: number }>, markLastAsTarget: boolean) => {
            for (const pc of path) {
                if (hexDistance(camera, pc) > camera.radius + 1) continue;
                const dist = hexDistance(camera, pc);
                const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
                const last = markLastAsTarget && pc === path[path.length - 1];
                deps.drawHexHighlight(
                    ctx,
                    pc.q,
                    pc.r,
                    null,
                    last ? GROWTH_HYBRID_STYLE.outlines.pathTarget : GROWTH_HYBRID_STYLE.outlines.path,
                    fade * fade,
                );
            }
        };

        if ((selectedHeroIdle || selectedHeroWalking) && opts.pathCoords.length) {
            const first = opts.pathCoords[0];
            const drawPath = selectedHero && first && (first.q !== selectedHero.q || first.r !== selectedHero.r)
                ? [{ q: selectedHero.q, r: selectedHero.r }, ...opts.pathCoords]
                : opts.pathCoords;
            drawPathStroke(drawPath, true);
            return;
        }

        if (!selectedHero?.movement) {
            return;
        }

        const movement = selectedHero.movement;
        let currentIndex = movement.path.findIndex((point) => point.q === selectedHero.q && point.r === selectedHero.r);
        if (currentIndex < 0 && selectedHero.q === movement.origin.q && selectedHero.r === movement.origin.r) {
            currentIndex = -1;
        }

        const remaining = movement.path.slice(Math.max(0, currentIndex + 1));
        if (remaining.length) {
            drawPathStroke(remaining, true);
            return;
        }

        const target = movement.target;
        if (hexDistance(camera, target) <= camera.radius + 1) {
            const dist = hexDistance(camera, target);
            const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
            deps.drawHexHighlight(ctx, target.q, target.r, null, GROWTH_HYBRID_STYLE.outlines.path, fade * fade);
        }
    }

    private drawInteractiveTopHighlights(
        ctx: CanvasRenderingContext2D,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        if (opts.hoveredTile && hexDistance(camera, opts.hoveredTile) <= camera.radius + 1) {
            const dist = hexDistance(camera, opts.hoveredTile);
            const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
            const opacity = fade * fade;
            const pulse = (Math.sin(frame.effectNowMs / 360) + 1) / 2;
            const inReach = opts.hoveredTileInReach !== false;
            deps.drawHexHighlight(
                ctx,
                opts.hoveredTile.q,
                opts.hoveredTile.r,
                null,
                inReach ? GROWTH_HYBRID_STYLE.outlines.hover : GROWTH_HYBRID_STYLE.outlines.unreachable,
                opacity * (0.74 + (pulse * 0.2)),
            );
        }

        if (opts.taskMenuTile && hexDistance(camera, opts.taskMenuTile) <= camera.radius + 1) {
            const dist = hexDistance(camera, opts.taskMenuTile);
            const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
            deps.drawHexHighlight(
                ctx,
                opts.taskMenuTile.q,
                opts.taskMenuTile.r,
                null,
                GROWTH_HYBRID_STYLE.outlines.selected,
                fade * fade,
            );
        }
    }

    private drawStoryHintHighlights(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        nowMs: number,
        deps: OverlayRendererDependencies,
        includeFill: boolean = true,
    ) {
        for (const tile of tiles) {
            if (hexDistance(camera, tile) > camera.radius + 1) {
                continue;
            }

            const dist = hexDistance(camera, tile);
            const fade = deps.computeFade(dist, camera.innerRadius, camera.radius);
            const pulse = (Math.sin(nowMs / 320) + 1) / 2;
            deps.drawHexHighlight(
                ctx,
                tile.q,
                tile.r,
                includeFill ? 'rgba(180, 240, 255, 0.05)' : null,
                GROWTH_HYBRID_STYLE.outlines.story,
                fade * (0.6 + pulse * 0.35),
            );
        }
    }

    private drawActiveTaskHighlights(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        nowMs: number,
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of tiles) {
            const activity = this.getTileOverlayActivity(tile, nowMs);
            const chosenTask = activity.leadingTask;
            const scoutProgress = activity.scoutProgress;
            if (!chosenTask && scoutProgress === null) continue;

            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, false);
            const pulse = (Math.sin(nowMs / 400) + 1) / 2;
            deps.drawHexHighlight(
                ctx,
                tile.q,
                tile.r,
                null,
                chosenTask ? GROWTH_HYBRID_STYLE.outlines.task : GROWTH_HYBRID_STYLE.outlines.scout,
                opacity * (0.36 + 0.28 * pulse),
            );
        }
    }

    private drawTaskProgressBars(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        nowMs: number,
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of tiles) {
            const activity = this.getTileOverlayActivity(tile, nowMs);
            const chosenTask = activity.leadingTask;
            const scoutProgress = activity.scoutProgress;
            if (!chosenTask && scoutProgress === null) continue;

            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, false);
            if (scoutProgress !== null && (!chosenTask || scoutProgress < 1)) {
                this.drawProgressBar(ctx, tile, scoutProgress, 'rgba(148,163,184,0.86)', opacity, deps);
            } else if (chosenTask?.active) {
                const progressRatio = chosenTask.requiredXp > 0 ? (chosenTask.progressXp / chosenTask.requiredXp) : 0;
                this.drawProgressBar(ctx, tile, Math.min(1, Math.max(0, progressRatio)), 'rgba(255,223,12,0.9)', opacity, deps);
            } else if (chosenTask) {
                const totalRequired = chosenTask.requiredResources?.reduce((sum, req) => sum + req.amount, 0) || 0;
                const totalCollected = chosenTask.collectedResources?.reduce((sum, resource) => sum + resource.amount, 0) || 0;
                const progressRatio = totalRequired > 0 ? (totalCollected / totalRequired) : 0;
                this.drawProgressBar(ctx, tile, Math.min(1, Math.max(0, progressRatio)), 'rgba(129,134,154,0.9)', opacity, deps);
            }
        }
    }

    private drawBuildingHealthBars(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of tiles) {
            const healthBar = getBuildingHealthBar(tile);
            if (!healthBar) {
                continue;
            }

            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, false);
            this.drawBuildingHealthBar(ctx, tile, healthBar.percent / 100, opacity, deps);
        }
    }

    private drawBuildingHealthBar(
        ctx: CanvasRenderingContext2D,
        tile: Tile,
        healthRatio: number,
        opacity: number,
        deps: OverlayRendererDependencies,
    ) {
        const { x, y } = axialToPixel(tile.q, tile.r);
        const barWidth = Math.round(deps.tileDrawSize * 0.52);
        const barHeight = 5;
        const barX = x - barWidth / 2;
        const barY = y - deps.hexSize + 6;
        const clampedRatio = Math.max(0, Math.min(1, healthRatio));
        const fillWidth = Math.round(barWidth * clampedRatio);
        const fillStyle = clampedRatio > 0.55
            ? 'rgba(34,197,94,0.94)'
            : clampedRatio > 0.25
                ? 'rgba(245,158,11,0.94)'
                : 'rgba(239,68,68,0.96)';

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = 'rgba(30,12,10,0.72)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        if (fillWidth > 0) {
            ctx.fillStyle = fillStyle;
            ctx.fillRect(barX, barY, fillWidth, barHeight);
        }
        ctx.strokeStyle = 'rgba(255,236,184,0.34)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        ctx.restore();
    }

    private getTileOverlayActivity(tile: Tile, nowMs: number): TileOverlayActivity {
        const cacheKey = `${tile.id}:${nowMs}`;
        const cached = this.tileActivityCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const taskState = this.getTileTaskState(tile);
        const activity: TileOverlayActivity = {
            leadingTask: taskState.leadingTask,
            scoutProgress: this.getScoutScanProgressForTile(tile, nowMs),
        };
        this.tileActivityCache.set(cacheKey, activity);
        return activity;
    }

    private getTileTaskState(tile: Tile): TileTaskState {
        const cached = this.tileTaskCache.get(tile.id);
        if (cached) {
            return cached;
        }

        const incompleteTasks = this.getIncompleteTasksForTile(tile);
        const taskState: TileTaskState = {
            incompleteTasks,
            leadingTask: this.getLeadingIncompleteTask(incompleteTasks),
        };
        this.tileTaskCache.set(tile.id, taskState);
        return taskState;
    }

    private getIncompleteTasksForTile(tile: Tile): TaskInstance[] {
        const activeTasksForTile = taskStore.tasksByTile[tile.id];
        if (!activeTasksForTile) return [];

        const incompleteTasks: TaskInstance[] = [];
        for (const taskId of Object.values(activeTasksForTile)) {
            const inst = taskStore.taskIndex[taskId];
            if (!inst || inst.completedMs) {
                continue;
            }

            incompleteTasks.push(inst);
        }

        return incompleteTasks;
    }

    private getLeadingIncompleteTask(tasks: TaskInstance[]): TaskInstance | null {
        let chosenTask: TaskInstance | null = null;
        for (const inst of tasks) {
            const ratio = inst.requiredXp > 0 ? (inst.progressXp / inst.requiredXp) : 0;
            if (!chosenTask) {
                chosenTask = inst;
                continue;
            }

            const chosenRatio = chosenTask.requiredXp > 0 ? (chosenTask.progressXp / chosenTask.requiredXp) : 0;
            if (ratio > chosenRatio || (Math.abs(ratio - chosenRatio) < 0.0001 && inst.createdMs < chosenTask.createdMs)) {
                chosenTask = inst;
            }
        }

        return chosenTask;
    }

    private clearFrameCaches() {
        this.tileActivityCache.clear();
        this.tileTaskCache.clear();
        this.scoutProgressByNowMsCache.clear();
        this.cachedSummaryFrame = null;
        this.cachedSummaryOptions = null;
        this.cachedSummaryDeps = null;
        this.cachedSummary = null;
    }

    private prepareFrameCaches(frame: RenderFrameLike) {
        if (this.cachedFrame === frame) {
            return;
        }

        this.cachedFrame = frame;
        this.clearFrameCaches();
    }

    private getFrameSummary(
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        if (
            this.cachedSummary
            && this.cachedSummaryFrame === frame
            && this.cachedSummaryOptions === opts
            && this.cachedSummaryDeps === deps
        ) {
            return this.cachedSummary;
        }

        const summary = this.buildFrameSummary(frame, opts, deps);
        this.cachedSummaryFrame = frame;
        this.cachedSummaryOptions = opts;
        this.cachedSummaryDeps = deps;
        this.cachedSummary = summary;
        return summary;
    }

    private buildFrameSummary(
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ): OverlayFrameSummary {
        const activeTilesByEffectNow: Tile[] = [];
        const buildingHealthTiles: Tile[] = [];
        const progressTilesByMovementNow: Tile[] = [];
        const taskIndicatorTiles: Tile[] = [];
        const storageIndicatorTiles: Tile[] = [];

        for (const tile of frame.visibleTiles) {
            if (getBuildingHealthBar(tile)) {
                buildingHealthTiles.push(tile);
            }

            const taskState = this.getTileTaskState(tile);
            if (taskState.incompleteTasks.length > 0) {
                taskIndicatorTiles.push(tile);
            }

            const effectActivity = this.getTileOverlayActivity(tile, frame.effectNowMs);
            if (effectActivity.leadingTask || effectActivity.scoutProgress !== null) {
                activeTilesByEffectNow.push(tile);
            }

            const movementActivity = frame.movementNowMs === frame.effectNowMs
                ? effectActivity
                : this.getTileOverlayActivity(tile, frame.movementNowMs);
            if (movementActivity.leadingTask || movementActivity.scoutProgress !== null) {
                progressTilesByMovementNow.push(tile);
            }

            if (this.shouldUpdateStorageIndicator(tile, opts.hoveredTile, deps)) {
                storageIndicatorTiles.push(tile);
            }
        }

        return {
            activeTilesByEffectNow,
            buildingHealthTiles,
            progressTilesByMovementNow,
            taskIndicatorTiles,
            storageIndicatorTiles,
        };
    }

    private shouldUpdateStorageIndicator(
        tile: Tile,
        hoveredTile: Tile | null,
        deps: OverlayRendererDependencies,
    ) {
        return canUseWarehouseAtTile(tile)
            && (
                (hoveredTile?.id === tile.id && !!getStorageKindForTile(tile))
                || (deps.storageIndicatorAlphaByTileId.get(tile.id) ?? 0) > 0.02
            );
    }

    private getScoutScanProgressForTile(tile: Tile, nowMs: number = Date.now()) {
        return this.getScoutScanProgressByTile(nowMs).get(tile.id) ?? null;
    }

    private getScoutScanProgressByTile(nowMs: number) {
        const cached = this.scoutProgressByNowMsCache.get(nowMs);
        if (cached) {
            return cached;
        }

        const progressByTile = new Map<string, number>();
        for (const hero of heroes) {
            const tileId = hero.scoutResourceIntent?.scanTileId;
            if (!tileId) {
                continue;
            }

            const progress = getScoutScanProgress(hero, tileId, nowMs);
            if (progress === null) {
                continue;
            }

            progressByTile.set(tileId, Math.max(progressByTile.get(tileId) ?? 0, progress));
        }

        this.scoutProgressByNowMsCache.set(nowMs, progressByTile);
        return progressByTile;
    }

    private drawProgressBar(
        ctx: CanvasRenderingContext2D,
        tile: Tile,
        progressRatio: number,
        fillStyle: string,
        opacity: number,
        deps: OverlayRendererDependencies,
    ) {
        const { x, y } = axialToPixel(tile.q, tile.r);
        const tileLeft = x - deps.hexSize;
        const tileTop = y - deps.hexSize;
        const tileWidth = deps.tileDrawSize;
        const tileHeight = deps.tileDrawSize;
        const barWidth = Math.round(tileWidth * 0.55);
        const barHeight = 7;
        const marginBottom = 8;
        let barX = x - barWidth / 2;
        const barY = tileTop + tileHeight - marginBottom - barHeight;
        const minX = tileLeft + 4;
        const maxX = tileLeft + tileWidth - barWidth - 4;
        if (barX < minX) barX = minX;
        if (barX > maxX) barX = maxX;

        ctx.save();
        ctx.globalAlpha = opacity;
        const radius = 16;
        deps.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
        ctx.fillStyle = 'rgba(8,24,36,0.55)';
        ctx.fill();
        ctx.strokeStyle = fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();

        const filled = Math.max(1, Math.round(barWidth * progressRatio));
        if (progressRatio > 0) {
            ctx.fillStyle = fillStyle;
            if (progressRatio >= 0.999) {
                deps.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
            } else {
                this.drawLeftRoundedRect(ctx, barX, barY, filled, barHeight, radius);
            }
            ctx.fill();
        }
        ctx.restore();
    }

    private drawLeftRoundedRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ) {
        const radius = Math.min(r, h / 2, w / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    private drawTaskIndicators(
        ctx: CanvasRenderingContext2D,
        taskTiles: Tile[],
        storageTiles: Tile[],
        applyCameraFade: boolean,
        hoveredTile: Tile | null,
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of storageTiles) {
            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, applyCameraFade);
            this.drawStorageIndicator(ctx, tile, opacity, hoveredTile, deps);
        }

        for (const tile of taskTiles) {
            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, applyCameraFade);
            const taskState = this.getTileTaskState(tile);
            for (const inst of taskState.incompleteTasks) {
                this.drawResourceIndicator(ctx, tile, inst, opacity, deps);
            }
        }
    }

    private drawStorageIndicator(
        ctx: CanvasRenderingContext2D,
        tile: Tile,
        opacity: number,
        hoveredTile: Tile | null,
        deps: OverlayRendererDependencies,
    ) {
        const storageKind = getStorageKindForTile(tile);
        if (!storageKind) return;

        const isHoveredStorageTile = hoveredTile?.id === tile.id && !!getStorageKindForTile(hoveredTile);
        const currentAlpha = deps.storageIndicatorAlphaByTileId.get(tile.id) ?? 0;
        const targetAlpha = isHoveredStorageTile ? 1 : 0;
        const lerpSpeed = isHoveredStorageTile ? 0.24 : 0.18;
        const nextAlpha = currentAlpha + ((targetAlpha - currentAlpha) * lerpSpeed);

        if (nextAlpha <= 0.02 && targetAlpha === 0) {
            deps.storageIndicatorAlphaByTileId.delete(tile.id);
            return;
        }

        deps.storageIndicatorAlphaByTileId.set(tile.id, nextAlpha);

        const usedCapacity = getStorageUsedCapacity(tile.id);
        const freeCapacity = getStorageFreeCapacity(tile.id);
        const capacity = Math.max(usedCapacity + freeCapacity, getStorageCapacity(storageKind));
        if (capacity <= 0) return;

        const snapshot = storageInventories[tile.id];
        const topResources = snapshot
            ? (Object.entries(snapshot.resources) as Array<[ResourceType, number]>)
                .filter(([, amount]) => amount > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
            : [];

        const textParts = [`${getStorageKindLabel(storageKind)} ${formatStorageAmount(usedCapacity)}/${formatStorageAmount(capacity)}`];
        if (topResources.length) {
            textParts.push(topResources.map(([type, amount]) => `${deps.resourceIconMap[type] ?? '?'}${formatStorageAmount(amount)}`).join(' '));
        }
        const text = textParts.join('  ');

        const { x, y } = axialToPixel(tile.q, tile.r);
        const accent = usedCapacity >= capacity
            ? 'rgba(248, 113, 113, 0.95)'
            : storageKind === 'towncenter'
                ? 'rgba(245, 204, 96, 0.95)'
                : storageKind === 'depot'
                    ? 'rgba(125, 211, 252, 0.95)'
                    : 'rgba(226, 232, 240, 0.95)';

        ctx.save();
        ctx.font = '8px \'Press Start 2P\', \'VT323\', \'Courier New\', monospace';
        const metrics = ctx.measureText(text);
        const width = Math.max(44, metrics.width + 14);
        const height = 17;
        const drawX = x - (width / 2);
        const drawY = y - deps.hexSize - 19;

        ctx.globalAlpha = opacity * nextAlpha * 0.72;
        deps.drawRoundedRect(ctx, drawX, drawY, width, height, 6);
        ctx.fillStyle = 'rgba(7, 16, 29, 0.88)';
        ctx.fill();

        ctx.globalAlpha = opacity * nextAlpha * 0.95;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.globalAlpha = opacity * nextAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(246, 250, 255, 0.94)';
        ctx.fillText(text, x, drawY + (height / 2) + 0.5);
        ctx.restore();
    }

    private drawResourceIndicator(
        ctx: CanvasRenderingContext2D,
        tile: Tile,
        task: TaskInstance,
        opacity: number,
        deps: OverlayRendererDependencies,
    ) {
        if (!task.requiredResources?.length) return;

        const pendingResources = task.requiredResources.filter((required) => {
            const collected = task.collectedResources?.find((resource) => resource.type === required.type)?.amount || 0;
            return collected < required.amount;
        });
        if (!pendingResources.length) return;

        const { x, y } = axialToPixel(tile.q, tile.r);
        const text = pendingResources
            .map((required) => {
                const collected = task.collectedResources?.find((resource) => resource.type === required.type)?.amount || 0;
                return `${deps.resourceIconMap[required.type] ?? '?'} ${this.formatResourceIndicatorAmount(collected)}/${this.formatResourceIndicatorAmount(required.amount)}`;
            })
            .join('  ');

        ctx.save();
        const paddingX = 10;
        const paddingY = 6;
        const textMetrics = ctx.measureText(text);
        const rectWidth = textMetrics.width + paddingX * 2;
        const rectHeight = 12 + paddingY * 2;

        ctx.globalAlpha = opacity * 0.6;
        deps.drawRoundedRect(ctx, x - rectWidth / 2, y - deps.hexSize - rectHeight + 7, rectWidth, rectHeight, 6);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.font = '8px \'Press Start 2P\', \'VT323\', \'Courier New\', monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#fff6d7aa';
        ctx.fillText(text, x, y - deps.hexSize);
        ctx.restore();
    }

    private formatResourceIndicatorAmount(amount: number) {
        return String(Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0)));
    }

}
