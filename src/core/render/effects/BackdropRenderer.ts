import type { RenderQualityProfile, ViewportSnapshot } from '../RenderTypes';
import { drawGlow, toRgba } from './EffectUtils';
import { buildWorldAtmosphere, type WorldAtmosphere } from './WorldAtmosphere';

interface BackdropTileLike {
    q: number;
    r: number;
    discovered: boolean;
    terrain: string | null;
}

interface BackdropCameraFxLike {
    vignetteBiasX: number;
    vignetteBiasY: number;
}

interface BackdropFrameLike<TTile extends BackdropTileLike, TCameraFx extends BackdropCameraFxLike> {
    finalCtx: CanvasRenderingContext2D;
    visibleTiles: readonly TTile[];
    effectNowMs: number;
    cameraFx: TCameraFx;
    quality: RenderQualityProfile;
    viewport: ViewportSnapshot;
}

export class BackdropRenderer<TTile extends BackdropTileLike, TCameraFx extends BackdropCameraFxLike> {
    render(frame: BackdropFrameLike<TTile, TCameraFx>) {
        const width = Math.round(frame.viewport.width * frame.viewport.dpr);
        const height = Math.round(frame.viewport.height * frame.viewport.dpr);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return;
        }

        const mood = buildWorldAtmosphere({
            tiles: frame.visibleTiles,
            nowMs: frame.effectNowMs,
            cameraQ: frame.viewport.cameraQ,
            cameraR: frame.viewport.cameraR,
            quality: frame.quality,
        });

        const ctx = frame.finalCtx;
        ctx.save();
        try {
            this.drawSkyDepth(ctx, mood, width, height);
            this.drawHorizonWash(ctx, mood, width, height);
            this.drawMoodGlows(ctx, mood, frame.quality, width, height);
            this.drawCameraVignette(ctx, mood, frame.cameraFx, width, height);
        } finally {
            ctx.restore();
        }
    }

    private drawSkyDepth(ctx: CanvasRenderingContext2D, mood: WorldAtmosphere, width: number, height: number) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, toRgba(mood.skyColor, 1));
        gradient.addColorStop(0.46, toRgba(mood.hazeColor, 0.96));
        gradient.addColorStop(1, toRgba(mood.shadowColor, 0.94));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    private drawHorizonWash(ctx: CanvasRenderingContext2D, mood: WorldAtmosphere, width: number, height: number) {
        const horizonY = height * (0.44 + ((mood.timePulse - 0.5) * 0.04));
        const gradient = ctx.createLinearGradient(0, horizonY - (height * 0.22), 0, height);
        gradient.addColorStop(0, toRgba(mood.hazeColor, 0));
        gradient.addColorStop(0.36, toRgba(mood.hazeColor, 0.2 + (mood.cloudDepthIntensity * 0.12)));
        gradient.addColorStop(1, toRgba(mood.shadowColor, 0.3));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, Math.max(0, horizonY - (height * 0.32)), width, height);
    }

    private drawMoodGlows(
        ctx: CanvasRenderingContext2D,
        mood: WorldAtmosphere,
        quality: RenderQualityProfile,
        width: number,
        height: number,
    ) {
        if (!quality.enableBackdropGlows) {
            return;
        }

        const glowCount = quality.expensiveAtmosphere ? 4 : 2;
        const largestSide = Math.max(width, height);
        const windDriftX = mood.windX * width * 0.05;
        const windDriftY = mood.windY * height * 0.035;
        const warmthShift = (mood.lightTemperature - 0.5) * 0.12;
        const baseOpacity = quality.expensiveAtmosphere ? 0.13 : 0.08;
        const glowOpacity = baseOpacity * (0.65 + (mood.cloudDepthIntensity * 0.35));

        drawGlow(
            ctx,
            width * (0.2 + warmthShift) + windDriftX,
            height * 0.26 + windDriftY,
            largestSide * 0.48,
            mood.hazeColor,
            glowOpacity,
        );
        drawGlow(
            ctx,
            width * (0.76 - warmthShift) - windDriftX,
            height * 0.38 - windDriftY,
            largestSide * 0.42,
            mood.glowColor,
            glowOpacity * 0.78,
        );

        if (glowCount < 4) {
            return;
        }

        drawGlow(
            ctx,
            width * 0.5 + (mood.windX * width * 0.08),
            height * 0.66 + (mood.weights.water * height * 0.06),
            largestSide * 0.5,
            mood.glowColor,
            glowOpacity * (0.48 + (mood.weights.lush * 0.22)),
        );
        drawGlow(
            ctx,
            width * (0.08 + (mood.weights.ember * 0.1)),
            height * (0.78 - (mood.weights.cold * 0.08)),
            largestSide * 0.36,
            mood.hazeColor,
            glowOpacity * (0.35 + (mood.timePulse * 0.2)),
        );
    }

    private drawCameraVignette(
        ctx: CanvasRenderingContext2D,
        mood: WorldAtmosphere,
        cameraFx: BackdropCameraFxLike,
        width: number,
        height: number,
    ) {
        const biasX = Math.max(-1, Math.min(1, cameraFx.vignetteBiasX));
        const biasY = Math.max(-1, Math.min(1, cameraFx.vignetteBiasY));
        const centerX = width * (0.5 + (biasX * 0.12));
        const centerY = height * (0.5 + (biasY * 0.12));
        const innerRadius = Math.min(width, height) * 0.28;
        const outerRadius = Math.max(width, height) * 0.78;
        const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
        gradient.addColorStop(0, toRgba(mood.shadowColor, 0));
        gradient.addColorStop(0.62, toRgba(mood.shadowColor, 0.08));
        gradient.addColorStop(1, toRgba(mood.shadowColor, 0.34));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
}
