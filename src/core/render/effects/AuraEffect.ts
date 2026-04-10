import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import { toRgba, type GlowColor } from './EffectUtils';
import type { WorldEffect } from './WorldEffect';

export class AuraEffect implements WorldEffect {
    readonly name = 'AuraEffect';

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableHeroAuras && quality.auraEnabled;
    }

    apply(_context: RenderPassContext) {}

    drawHeroSelectionAura(
        ctx: CanvasRenderingContext2D,
        interp: { x: number; y: number },
        pos: { x: number; y: number },
        opacity: number,
        selected: boolean,
        now: number,
        heroFrameSize: number,
        heroShadowYOffset: number,
    ) {
        const pulse = 0.5 + (0.5 * Math.sin(now / 280));
        const spin = now / 760;
        const centerX = interp.x + pos.x - 15;
        const centerY = interp.y + pos.y + (heroFrameSize * heroShadowYOffset) - 3;
        const outerWidth = selected ? 21.5 + (pulse * 2.6) : 17.8 + (pulse * 1.2);
        const outerHeight = selected ? 8.4 + (pulse * 0.9) : 6.9 + (pulse * 0.45);
        const baseAlpha = opacity * (selected ? 1 : 0.76);

        ctx.save();
        ctx.imageSmoothingEnabled = true;

        const aura = ctx.createRadialGradient(centerX, centerY + 0.8, 0, centerX, centerY + 0.8, outerWidth * 1.28);
        if (selected) {
            aura.addColorStop(0, toRgba([255, 221, 144], baseAlpha * 0.52));
            aura.addColorStop(0.46, toRgba([120, 255, 214], baseAlpha * 0.28));
            aura.addColorStop(1, toRgba([120, 255, 214], 0));
        } else {
            aura.addColorStop(0, toRgba([180, 235, 255], baseAlpha * 0.14));
            aura.addColorStop(1, toRgba([180, 235, 255], 0));
        }
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 0.8, outerWidth * 1.28, outerHeight * 1.28, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = selected ? 2.6 : 1.55;
        ctx.strokeStyle = selected
            ? toRgba([244, 197, 102], baseAlpha * 0.72)
            : toRgba([164, 228, 255], baseAlpha * 0.48);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 1.15, outerWidth, outerHeight, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (selected) {
            const sparkAngles = [spin * 1.25, (spin * 1.25) + ((Math.PI * 2) / 3), (spin * 1.25) + ((Math.PI * 4) / 3)];
            for (let i = 0; i < sparkAngles.length; i++) {
                const angle = sparkAngles[i]!;
                const px = centerX + (Math.cos(angle) * (outerWidth + 2.2));
                const py = centerY + 1.2 + (Math.sin(angle) * (outerHeight + 1.0));
                const radius = i === 0 ? 1.8 + (pulse * 0.3) : 1.35 + ((1 - pulse) * 0.24);
                const color: GlowColor = i === 0 ? [255, 241, 196] : i === 1 ? [166, 255, 228] : [255, 219, 137];

                ctx.fillStyle = toRgba(color, baseAlpha * 0.95);
                ctx.shadowColor = toRgba(color, baseAlpha * 0.85);
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}
