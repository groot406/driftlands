import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import { toRgba } from './EffectUtils';
import type { WorldEffect } from './WorldEffect';

interface CameraCompositeStateLike {
    vignetteBiasX: number;
    vignetteBiasY: number;
    speedNorm: number;
}

interface VignetteFrameLike {
    cameraFx: CameraCompositeStateLike;
}

interface VignetteEffectDependencies {
    getFrame(context: RenderPassContext): VignetteFrameLike;
}

export class VignetteEffect implements WorldEffect {
    readonly name = 'VignetteEffect';

    private readonly deps: VignetteEffectDependencies;

    constructor(deps: VignetteEffectDependencies) {
        this.deps = deps;
    }

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableEdgeVignette && quality.vignetteEnabled;
    }

    apply(context: RenderPassContext) {
        if (!context.effectSurface) {
            return;
        }

        const frame = this.deps.getFrame(context);
        const ctx = context.effectSurface.ctx;
        const width = context.effectSurface.canvas.width;
        const height = context.effectSurface.canvas.height;
        const centerX = (width / 2) + (frame.cameraFx.vignetteBiasX * context.viewport.dpr);
        const centerY = (height / 2) + (frame.cameraFx.vignetteBiasY * context.viewport.dpr);
        const baseRadius = Math.min(width, height) * (0.84 - (frame.cameraFx.speedNorm * 0.035));
        const scaleX = width >= height ? Math.min(1.45, width / height) : 1;
        const scaleY = height > width ? Math.min(1.45, height / width) : 1;
        const drawWidth = width / scaleX;
        const drawHeight = height / scaleY;
        const edgeBoost = 1 + (frame.cameraFx.speedNorm * 0.35);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scaleX, scaleY);

        const broadVignette = ctx.createRadialGradient(0, 0, baseRadius * 0.2, 0, 0, baseRadius);
        broadVignette.addColorStop(0, 'rgba(7, 11, 18, 0)');
        broadVignette.addColorStop(0.42, 'rgba(7, 11, 18, 0.008)');
        broadVignette.addColorStop(0.68, toRgba([7, 11, 18], 0.045 * edgeBoost));
        broadVignette.addColorStop(0.86, toRgba([7, 11, 18], 0.12 * edgeBoost));
        broadVignette.addColorStop(1, toRgba([6, 9, 15], 0.24 + (frame.cameraFx.speedNorm * 0.08)));
        ctx.fillStyle = broadVignette;
        ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

        const edgeVignette = ctx.createRadialGradient(0, 0, baseRadius * 0.72, 0, 0, baseRadius * 1.02);
        edgeVignette.addColorStop(0, 'rgba(6, 9, 15, 0)');
        edgeVignette.addColorStop(0.82, 'rgba(6, 9, 15, 0)');
        edgeVignette.addColorStop(0.94, toRgba([6, 9, 15], 0.08 * edgeBoost));
        edgeVignette.addColorStop(1, toRgba([5, 7, 12], 0.22 + (frame.cameraFx.speedNorm * 0.09)));
        ctx.fillStyle = edgeVignette;
        ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

        ctx.restore();
    }
}
