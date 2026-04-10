import { heroes } from '../../../store/heroStore';
import { taskStore } from '../../../store/taskStore';
import { selectedHeroId } from '../../../store/uiStore';
import { axialToPixel, hexDistance } from '../../camera';
import type { Hero } from '../../types/Hero';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext, RenderSurface } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import type { WorldEffect } from './WorldEffect';
import { drawGlow, type GlowColor } from './EffectUtils';

interface CameraCompositeStateLike {
    offsetX: number;
    offsetY: number;
    roll: number;
    zoom: number;
}

interface DrawOptionsLike {
    hoveredTile: Tile | null;
    taskMenuTile: Tile | null;
    hoveredTileInReach?: boolean;
}

interface BloomFrameLike {
    cameraFx: CameraCompositeStateLike;
    effectNowMs: number;
    movementNowMs: number;
    visibleTiles: Tile[];
    viewport: {
        cameraQ: number;
        cameraR: number;
        radius: number;
        innerRadius: number;
    };
}

interface BloomEffectDependencies {
    dpr: number;
    hexSize: number;
    getBloomSurface(): RenderSurface | null;
    getFrame(context: RenderPassContext): BloomFrameLike;
    getDrawOptions(context: RenderPassContext): DrawOptionsLike;
    getCanvasCenter(): { cx: number; cy: number };
    applyWorldTransform(
        ctx: CanvasRenderingContext2D,
        translateX: number,
        translateY: number,
        cameraFx: CameraCompositeStateLike,
    ): void;
    computeFade(dist: number, inner: number, radius: number): number;
    getTileImageKey(tile: Tile): string | null;
    getTileOverlayKey(tile: Tile): string | null;
    getHeroInterpolatedPixelPosition(hero: Hero, now: number): { x: number; y: number };
}

export class BloomEffect implements WorldEffect {
    readonly name = 'BloomEffect';

    private readonly deps: BloomEffectDependencies;

    constructor(deps: BloomEffectDependencies) {
        this.deps = deps;
    }

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableBloom && quality.bloomEnabled;
    }

    apply(context: RenderPassContext) {
        if (!context.effectSurface) {
            return;
        }

        const bloomSurface = this.deps.getBloomSurface();
        if (!bloomSurface) {
            return;
        }

        const frame = this.deps.getFrame(context);
        const opts = this.deps.getDrawOptions(context);
        bloomSurface.ctx.clearRect(0, 0, bloomSurface.canvas.width, bloomSurface.canvas.height);
        this.drawBloomLayer(bloomSurface.ctx, opts, frame);
        this.compositeBloom(context.effectSurface.ctx, bloomSurface.canvas);
    }

    private drawBloomLayer(
        ctx: CanvasRenderingContext2D,
        opts: DrawOptionsLike,
        frame: BloomFrameLike,
    ) {
        const camPx = axialToPixel(frame.viewport.cameraQ, frame.viewport.cameraR);
        const { cx, cy } = this.deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;
        const cameraPoint = { q: frame.viewport.cameraQ, r: frame.viewport.cameraR };

        ctx.save();
        ctx.scale(this.deps.dpr, this.deps.dpr);
        this.deps.applyWorldTransform(ctx, translateX, translateY, frame.cameraFx);

        for (const tile of frame.visibleTiles) {
            if (!tile.discovered) continue;

            const dist = hexDistance(cameraPoint, tile);
            const opacity = (() => {
                const fade = this.deps.computeFade(dist, frame.viewport.innerRadius, frame.viewport.radius);
                return fade * fade;
            })();

            if (opacity <= 0.04) continue;

            const bloomSpec = this.getTileBloomSpec(tile);
            if (bloomSpec) {
                const { x, y } = axialToPixel(tile.q, tile.r);
                drawGlow(ctx, x, y + bloomSpec.yOffset, bloomSpec.radius, bloomSpec.color, bloomSpec.strength * opacity);
            }

            const activeTasksForTile = taskStore.tasksByTile[tile.id];
            if (activeTasksForTile) {
                const pulse = 0.12 + (((Math.sin(frame.effectNowMs / 400) + 1) / 2) * 0.08);
                const { x, y } = axialToPixel(tile.q, tile.r);
                drawGlow(ctx, x, y, this.deps.hexSize * 0.95, [96, 228, 255], opacity * pulse);
            }
        }

        this.drawBloomOverlayHighlights(ctx, opts, frame, cameraPoint);
        ctx.restore();
    }

    private compositeBloom(ctx: CanvasRenderingContext2D, bloomCanvas: HTMLCanvasElement) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.26;
        ctx.filter = 'blur(7px) brightness(82%) saturate(172%) contrast(112%)';
        ctx.drawImage(bloomCanvas, 0, 0);
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.18;
        ctx.filter = 'saturate(188%) contrast(108%)';
        ctx.drawImage(bloomCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.08;
        ctx.filter = 'blur(2px) saturate(160%)';
        ctx.drawImage(bloomCanvas, 0, 0);
        ctx.restore();
    }

    private drawBloomOverlayHighlights(
        ctx: CanvasRenderingContext2D,
        opts: DrawOptionsLike,
        frame: BloomFrameLike,
        cameraPoint: { q: number; r: number },
    ) {
        if (opts.hoveredTile) {
            const { x, y } = axialToPixel(opts.hoveredTile.q, opts.hoveredTile.r);
            const opacity = this.deps.computeFade(
                hexDistance(cameraPoint, opts.hoveredTile),
                frame.viewport.innerRadius,
                frame.viewport.radius,
            );
            const inReach = opts.hoveredTileInReach !== false;
            const glowColor: GlowColor = inReach ? [255, 226, 122] : [100, 60, 60];
            drawGlow(ctx, x, y, this.deps.hexSize, glowColor, opacity * 0.2);
        }

        if (opts.taskMenuTile) {
            const { x, y } = axialToPixel(opts.taskMenuTile.q, opts.taskMenuTile.r);
            const opacity = this.deps.computeFade(
                hexDistance(cameraPoint, opts.taskMenuTile),
                frame.viewport.innerRadius,
                frame.viewport.radius,
            );
            drawGlow(ctx, x, y, this.deps.hexSize * 1.05, [145, 250, 49], opacity * 0.22);
        }

        const selectedHero = selectedHeroId.value ? heroes.find((hero) => hero.id === selectedHeroId.value) || null : null;
        if (selectedHero) {
            const opacity = this.deps.computeFade(
                hexDistance(cameraPoint, selectedHero),
                frame.viewport.innerRadius,
                frame.viewport.radius,
            );
            const interp = this.deps.getHeroInterpolatedPixelPosition(selectedHero, frame.movementNowMs);
            drawGlow(ctx, interp.x + 12, interp.y - 22, this.deps.hexSize * 0.95, [255, 214, 122], opacity * 0.32);
            drawGlow(ctx, interp.x + 8, interp.y - 18, this.deps.hexSize * 0.72, [126, 255, 214], opacity * 0.22);
        }
    }

    private getTileBloomSpec(tile: Tile): { color: GlowColor; radius: number; strength: number; yOffset: number } | null {
        const baseKey = this.deps.getTileImageKey(tile);
        const overlayKey = this.deps.getTileOverlayKey(tile);

        if (tile.terrain === 'vulcano' || baseKey === 'vulcano' || overlayKey === 'vulcano_overhang') {
            return { color: [255, 145, 92], radius: this.deps.hexSize * 1.05, strength: 0.24, yOffset: -6 };
        }

        if (tile.terrain === 'towncenter') {
            return { color: [255, 190, 118], radius: this.deps.hexSize * 0.98, strength: 0.18, yOffset: -4 };
        }

        if (baseKey === 'grain_bloom') {
            return { color: [255, 219, 120], radius: this.deps.hexSize * 0.95, strength: 0.2, yOffset: -5 };
        }

        if (baseKey === 'water_lily') {
            return { color: [178, 255, 224], radius: this.deps.hexSize * 0.82, strength: 0.14, yOffset: -2 };
        }

        if (baseKey === 'water_reflections') {
            return { color: [130, 222, 255], radius: this.deps.hexSize, strength: 0.18, yOffset: -1 };
        }

        return null;
    }
}
