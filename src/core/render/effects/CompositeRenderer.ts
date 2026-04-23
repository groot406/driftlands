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

    renderEffects(
        context: RenderPassContext,
        frame: TFrame,
        deps: CompositeRendererDependencies,
    ) {
        const surface = frame.effectSurface;
        surface.ctx.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
        this.ensureScratchWorldComposite(frame);

        deps.applyEffectPipeline(context);
        return context.runtime.motionBlur ?? null;
    }

    compositeToFinal(frame: TFrame) {
        this.ensureScratchWorldComposite(frame);
        const ctx = frame.finalCtx;
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = false;

        if (frame.quality.enableManualShadowComposite) {
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3;
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(3, 18, 12, 0.42)';
            ctx.drawImage(frame.worldCanvas, 0, 0);

            ctx.shadowOffsetX = 18;
            ctx.shadowOffsetY = 32;
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(2, 14, 10, 0.24)';
            ctx.drawImage(frame.worldCanvas, 0, 0);

            ctx.shadowOffsetX = -5;
            ctx.shadowOffsetY = 12;
            ctx.shadowBlur = 18;
            ctx.shadowColor = 'rgba(36, 50, 28, 0.14)';
            ctx.drawImage(frame.worldCanvas, 0, 0);

            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        } else {
            ctx.drawImage(frame.worldCanvas, 0, 0);
        }

        ctx.drawImage(frame.effectSurface.canvas, 0, 0);
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
        frame.worldCtx.drawImage(frame.terrainSurface.canvas, 0, 0);
        frame.worldCtx.drawImage(frame.overlayUnderlaySurface.canvas, 0, 0);
        frame.worldCtx.drawImage(frame.particleUnderlaySurface.canvas, 0, 0);
        frame.worldCtx.drawImage(frame.entitySurface.canvas, 0, 0);
        frame.worldCtx.drawImage(frame.overlayTopSurface.canvas, 0, 0);
        frame.worldCtx.drawImage(frame.particleOverlaySurface.canvas, 0, 0);
    }
}
