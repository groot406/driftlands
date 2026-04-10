import { camera } from '../../camera';
import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import type { WorldEffect } from './WorldEffect';

export interface MotionBlurState {
    offsetX: number;
    offsetY: number;
    samples: number;
    alpha: number;
    crispAlpha: number;
    softness: number;
    strength: number;
}

export class MotionBlurEffect implements WorldEffect {
    readonly name = 'MotionBlurEffect';

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableMotionBlur;
    }

    apply(context: RenderPassContext) {
        const motionBlur = this.getMotionBlurState(context.quality);
        context.runtime.motionBlur = motionBlur;

        if (!motionBlur || !context.effectSurface || !context.worldCanvas) {
            return;
        }

        this.drawMotionTrail(context.effectSurface.ctx, context.worldCanvas, motionBlur);
    }

    private getMotionBlurState(quality: RenderQualityProfile): MotionBlurState | null {
        const SPEED_THRESHOLD = 70;
        const MAX_SPEED_FOR_SCALING = 1100;
        const screenSpeed = Math.hypot(camera.screenVelocityX, camera.screenVelocityY);

        if (screenSpeed <= SPEED_THRESHOLD) {
            return null;
        }

        const rawNorm = Math.min(1, (screenSpeed - SPEED_THRESHOLD) / (MAX_SPEED_FOR_SCALING - SPEED_THRESHOLD));
        const norm = rawNorm * rawNorm * (3 - (2 * rawNorm));
        const dirX = camera.screenVelocityX / screenSpeed;
        const dirY = camera.screenVelocityY / screenSpeed;
        const strength = quality.motionBlurStrength;
        const streakLength = (7 + norm * 29) * (0.58 + (strength * 0.48));
        const samples = Math.max(3, Math.round((4 + norm * 7.5) * (0.68 + (strength * 0.36))));

        return {
            offsetX: -dirX * streakLength,
            offsetY: -dirY * streakLength,
            samples,
            alpha: (0.09 + norm * 0.16) * strength,
            crispAlpha: (0.032 + norm * 0.045) * strength,
            softness: 1 + (norm * (1.55 * strength)),
            strength,
        };
    }

    private drawMotionTrail(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, motion: MotionBlurState) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.filter = `blur(${motion.softness.toFixed(2)}px)`;

        for (let i = motion.samples; i >= 1; i--) {
            const t = i / motion.samples;
            const weight = motion.alpha * (0.35 + ((1 - t) * 0.65));
            ctx.globalAlpha = weight;
            ctx.drawImage(source, motion.offsetX * t, motion.offsetY * t);
        }

        ctx.filter = 'none';
        for (let i = motion.samples; i >= 1; i--) {
            const t = i / motion.samples;
            ctx.globalAlpha = motion.crispAlpha * (1 - (t * 0.7));
            ctx.drawImage(source, motion.offsetX * t, motion.offsetY * t);
        }
        ctx.restore();
    }
}
