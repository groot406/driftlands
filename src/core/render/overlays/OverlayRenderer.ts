import { getStorageFreeCapacity, getStorageUsedCapacity, storageInventories } from '../../../store/resourceStore';
import { heroes } from '../../../store/heroStore';
import { selectedHeroId } from '../../../store/uiStore';
import { taskStore } from '../../../store/taskStore';
import { getStorageCapacity } from '../../../shared/game/storage';
import { getScoutSurveyProgress } from '../../../shared/game/scoutResources';
import { canUseWarehouseAtTile, getStorageKindForTile } from '../../../shared/buildings/storage';
import { camera, axialToPixel, hexDistance } from '../../camera';
import { getTextIndicators } from '../../textIndicators';
import type { Hero } from '../../types/Hero';
import type { ResourceType } from '../../types/Resource';
import type { TaskInstance } from '../../types/Task';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext } from '../RenderPassContext';

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
    storyHintTiles?: Tile[];
    showSupportOverlay?: boolean;
    hoveredTileInReach?: boolean;
}

interface RenderFrameLike {
    cameraFx: CameraCompositeStateLike;
    effectNowMs: number;
    movementNowMs: number;
    visibleTiles: Tile[];
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
    drawReachOutline(
        ctx: CanvasRenderingContext2D,
        boundary: Array<{ q: number; r: number }>,
        reachSet: Set<string>,
        alpha: number,
        hovered?: boolean,
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

export class OverlayRenderer {
    renderLayers(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        this.drawUnderlay(context, frame, opts, deps);
        this.drawTop(context, frame, opts, deps);
        this.drawScreen(context, frame, deps);
    }

    private drawUnderlay(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        const underlay = context.overlayUnderlaySurface;
        if (!underlay || !deps.canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        underlay.ctx.clearRect(0, 0, underlay.canvas.width, underlay.canvas.height);
        underlay.ctx.save();
        underlay.ctx.scale(deps.dpr, deps.dpr);
        deps.applyWorldTransform(underlay.ctx, translateX, translateY, frame.cameraFx);

        deps.drawGameplayWorldImpacts(underlay.ctx, frame.effectNowMs, false);
        deps.drawSupportOverlay(underlay.ctx, frame.visibleTiles, false, opts.showSupportOverlay === true);
        this.drawActiveTaskHighlights(underlay.ctx, frame.visibleTiles, frame.effectNowMs, deps);
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
                    last ? 'rgba(216,244,255,0.0)' : 'rgba(250,253,255,0.0)',
                    last ? '#dbedff' : '#daf0ff',
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
                        'rgba(132,196,255,0.0)',
                        i === remaining.length - 1 ? '#6fb8ff' : '#9fd8ff',
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
                    deps.drawHexHighlight(underlay.ctx, target.q, target.r, 'rgba(132,196,255,0.0)', '#9fd8ff', opacity);
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
                inReach ? 'rgba(255, 227, 122, 0)' : 'rgba(100, 60, 60, 0)',
                inReach ? '#d0b23d' : '#6a4a4a',
                opacity,
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
                    underlay.ctx.strokeStyle = 'rgba(255,201,77,0.95)';
                    underlay.ctx.lineWidth = 3;
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
            deps.drawHexHighlight(underlay.ctx, opts.taskMenuTile.q, opts.taskMenuTile.r, 'rgba(163,255,61,0.00)', '#91fa31', opacity);
        }

        underlay.ctx.restore();
    }

    private drawTop(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: OverlayRendererDependencies,
    ) {
        const overlay = context.overlayTopSurface;
        if (!overlay || !deps.canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
        overlay.ctx.save();
        overlay.ctx.scale(deps.dpr, deps.dpr);
        deps.applyWorldTransform(overlay.ctx, translateX, translateY, frame.cameraFx);

        if (opts.globalReachBoundary?.length) {
            deps.drawReachOutline(overlay.ctx, opts.globalReachBoundary, opts.globalReachTileIds || new Set<string>(), 0.45, false);
        }

        this.drawTaskProgressBars(overlay.ctx, frame.visibleTiles, frame.movementNowMs, deps);
        this.drawTaskIndicators(overlay.ctx, frame.visibleTiles, false, opts.hoveredTile, deps);
        overlay.ctx.restore();
    }

    private drawStoryHintHighlights(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        nowMs: number,
        deps: OverlayRendererDependencies,
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
                'rgba(45, 212, 191, 0.05)',
                'rgba(125, 211, 252, 1)',
                fade * (0.6 + pulse * 0.35),
            );
        }
    }

    private drawScreen(
        context: RenderPassContext,
        frame: RenderFrameLike,
        deps: OverlayRendererDependencies,
    ) {
        const overlay = context.overlayTopSurface;
        if (!overlay) return;

        overlay.ctx.save();
        overlay.ctx.scale(deps.dpr, deps.dpr);
        this.drawTextIndicators(overlay.ctx, frame.effectNowMs, frame.cameraFx, deps);
        overlay.ctx.restore();
    }

    private drawActiveTaskHighlights(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        nowMs: number,
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of tiles) {
            const chosenTask = this.getLeadingIncompleteTaskForTile(tile);
            const scoutProgress = this.getScoutSurveyProgressForTile(tile, nowMs);
            if (!chosenTask && scoutProgress === null) continue;

            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, false);
            const pulse = (Math.sin(nowMs / 400) + 1) / 2;
            deps.drawHexHighlight(
                ctx,
                tile.q,
                tile.r,
                null,
                chosenTask ? 'rgba(0, 225, 255, 1)' : 'rgba(244, 114, 182, 1)',
                opacity * (0.5 + 0.4 * pulse),
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
            const chosenTask = this.getLeadingIncompleteTaskForTile(tile);
            const scoutProgress = this.getScoutSurveyProgressForTile(tile, nowMs);
            if (!chosenTask && scoutProgress === null) continue;

            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, false);
            if (scoutProgress !== null && (!chosenTask || scoutProgress < 1)) {
                this.drawProgressBar(ctx, tile, scoutProgress, 'rgba(244,114,182,0.92)', opacity, deps);
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

    private getLeadingIncompleteTaskForTile(tile: Tile): TaskInstance | null {
        const activeTasksForTile = taskStore.tasksByTile[tile.id];
        if (!activeTasksForTile) return null;

        let chosenTask: TaskInstance | null = null;
        for (const taskId of Object.values(activeTasksForTile)) {
            const inst = taskStore.taskIndex[taskId];
            if (!inst || inst.completedMs) continue;

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

    private getScoutSurveyProgressForTile(tile: Tile, nowMs: number = Date.now()) {
        let bestProgress: number | null = null;

        for (const hero of heroes) {
            const progress = getScoutSurveyProgress(hero, tile.id, nowMs);
            if (progress === null) {
                continue;
            }

            bestProgress = bestProgress === null ? progress : Math.max(bestProgress, progress);
        }

        return bestProgress;
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
        tiles: Tile[],
        applyCameraFade: boolean,
        hoveredTile: Tile | null,
        deps: OverlayRendererDependencies,
    ) {
        for (const tile of tiles) {
            const dist = hexDistance(camera, tile);
            const opacity = deps.getTileOpacity(dist, applyCameraFade);

            if (canUseWarehouseAtTile(tile)) {
                this.drawStorageIndicator(ctx, tile, opacity, hoveredTile, deps);
            }

            const activeTasksForTile = taskStore.tasksByTile[tile.id];
            if (activeTasksForTile) {
                for (const taskId of Object.values(activeTasksForTile)) {
                    const inst = taskStore.taskIndex[taskId];
                    if (inst && !inst.completedMs) {
                        this.drawResourceIndicator(ctx, tile, inst, opacity, deps);
                    }
                }
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

        const textParts = [`${usedCapacity}/${capacity}`];
        if (topResources.length) {
            textParts.push(topResources.map(([type, amount]) => `${deps.resourceIconMap[type] ?? '?'}${amount}`).join(' '));
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
                return `${deps.resourceIconMap[required.type] ?? '?'} ${collected}/${required.amount}`;
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

    private drawTextIndicators(
        ctx: CanvasRenderingContext2D,
        nowMs: number,
        cameraFx: CameraCompositeStateLike,
        deps: OverlayRendererDependencies,
    ) {
        for (const indicator of getTextIndicators()) {
            const anchorQ = indicator.position.q;
            const anchorR = indicator.position.r;
            const dist = hexDistance(camera, { q: anchorQ, r: anchorR });
            if (dist > camera.radius + 1) continue;

            let worldAnchor = indicator.worldAnchor;
            if (!worldAnchor) {
                const { x, y } = axialToPixel(anchorQ, anchorR);
                const pos = indicator.position.currentOffset || { x: 0, y: 0 };
                worldAnchor = {
                    x: x + pos.x - (deps.heroFrameSize / 2),
                    y: y + pos.y - (deps.heroFrameSize * 1.5) - 8,
                };
                indicator.worldAnchor = worldAnchor;
            }

            const progress = Math.min(1, (nowMs - indicator.created) / indicator.duration);
            const anchor = deps.projectWorldToScreenPixels(worldAnchor.x, worldAnchor.y, cameraFx);
            const floatY = anchor.y - (progress * 28);
            const alpha = 1 - progress;

            if (deps.canvas) {
                const width = deps.canvas.width / deps.dpr;
                const height = deps.canvas.height / deps.dpr;
                const margin = 48;
                if (anchor.x < -margin || anchor.x > width + margin || floatY < -margin || floatY > height + margin) {
                    continue;
                }
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = "12px 'Press Start 2P', 'VT323', 'Courier New', monospace";
            ctx.fillStyle = indicator.color || '#ffe066';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(24, 16, 8, 0.45)';
            ctx.strokeText(indicator.text, anchor.x, floatY);
            ctx.shadowColor = 'rgba(24, 16, 8, 0.7)';
            ctx.shadowBlur = 4;
            ctx.fillText(indicator.text, anchor.x, floatY);
            ctx.restore();
        }
    }
}
