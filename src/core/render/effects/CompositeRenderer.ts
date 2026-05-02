import type { RenderPassContext, RenderSurface } from '../RenderPassContext';

interface CompositeFrameLike {
    finalCtx: CanvasRenderingContext2D;
    worldCtx: CanvasRenderingContext2D;
    worldCanvas: HTMLCanvasElement;
    terrainSurface: RenderSurface;
    overlayUnderlaySurface: RenderSurface;
    entitySurface: RenderSurface;
    overlayTopSurface: RenderSurface;
    particleUnderlaySurface: RenderSurface;
    particleOverlaySurface: RenderSurface;
    effectSurface: RenderSurface;
    cameraFx: unknown;
    effectNowMs: number;
    quality: {
        enableMotionBlur: boolean;
        enableManualShadowComposite: boolean;
    };
}

interface CompositeRendererDependencies {
    applyEffectPipeline(context: RenderPassContext): void;
}

export class CompositeRenderer<TFrame extends CompositeFrameLike> {
    private scratchCompositeFrame: TFrame | null = null;

    private drawCanvasIfReady(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
        if (canvas.width < 1 || canvas.height < 1) {
            return;
        }

        ctx.drawImage(canvas, 0, 0);
    }

    renderEffects(
        context: RenderPassContext,
        frame: TFrame,
        deps: CompositeRendererDependencies,
    ) {
        const surface = frame.effectSurface;
        surface.ctx.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
        if (frame.quality.enableMotionBlur) {
            this.ensureScratchWorldComposite(frame);
        }

        deps.applyEffectPipeline(context);
        return context.runtime.motionBlur ?? null;
    }

    compositeToFinal(frame: TFrame, includeEffectSurface = true) {
        const ctx = frame.finalCtx;
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = false;

        if (!frame.quality.enableManualShadowComposite && !frame.quality.enableMotionBlur) {
            this.drawWorldLayers(ctx, frame);
        } else if (frame.quality.enableManualShadowComposite) {
            this.ensureScratchWorldComposite(frame);
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3;
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(3, 18, 12, 0.42)';
            this.drawCanvasIfReady(ctx, frame.worldCanvas);

            ctx.shadowOffsetX = 18;
            ctx.shadowOffsetY = 32;
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(2, 14, 10, 0.24)';
            this.drawCanvasIfReady(ctx, frame.worldCanvas);

            ctx.shadowOffsetX = -5;
            ctx.shadowOffsetY = 12;
            ctx.shadowBlur = 18;
            ctx.shadowColor = 'rgba(36, 50, 28, 0.14)';
            this.drawCanvasIfReady(ctx, frame.worldCanvas);

            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        } else {
            this.ensureScratchWorldComposite(frame);
            this.drawCanvasIfReady(ctx, frame.worldCanvas);
        }

        if (includeEffectSurface) {
            this.drawCanvasIfReady(ctx, frame.effectSurface.canvas);
        }
    }

    private ensureScratchWorldComposite(frame: TFrame) {
        if (this.scratchCompositeFrame === frame) {
            return;
        }

        this.buildScratchWorldComposite(frame);
        this.scratchCompositeFrame = frame;
    }

    private buildScratchWorldComposite(frame: TFrame) {
        frame.worldCtx.clearRect(0, 0, frame.worldCanvas.width, frame.worldCanvas.height);
        frame.worldCtx.globalAlpha = 1;
        frame.worldCtx.filter = 'none';
        frame.worldCtx.imageSmoothingEnabled = false;
        this.drawWorldLayers(frame.worldCtx, frame);
    }

    private drawWorldLayers(ctx: CanvasRenderingContext2D, frame: TFrame) {
        this.drawCanvasIfReady(ctx, frame.terrainSurface.canvas);
        this.drawCanvasIfReady(ctx, frame.overlayUnderlaySurface.canvas);
        this.drawCanvasIfReady(ctx, frame.particleUnderlaySurface.canvas);
        this.drawCanvasIfReady(ctx, frame.entitySurface.canvas);
        this.drawCanvasIfReady(ctx, frame.overlayTopSurface.canvas);
        this.drawCanvasIfReady(ctx, frame.particleOverlaySurface.canvas);
    }
}
