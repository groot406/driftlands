import { axialToPixel } from '../../camera';
import { getActiveResourceFlights, getResourceTargetCenter } from '../../gameFeel';
import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import { getQuadraticPoint, hexToColor, smoothStep, toRgba } from './EffectUtils';
import type { WorldEffect } from './WorldEffect';

interface ResourceFlightFrameLike<TCameraFx> {
    cameraFx: TCameraFx;
    effectNowMs: number;
}

interface ResourceFlightDependencies<TCameraFx> {
    getFrame(context: RenderPassContext): ResourceFlightFrameLike<TCameraFx>;
    projectWorldToScreenPixels(worldX: number, worldY: number, cameraFx: TCameraFx): { x: number; y: number };
}

export class ResourceFlightEffect<TCameraFx> implements WorldEffect {
    readonly name = 'ResourceFlightEffect';

    private readonly deps: ResourceFlightDependencies<TCameraFx>;

    constructor(deps: ResourceFlightDependencies<TCameraFx>) {
        this.deps = deps;
    }

    isEnabled(_quality: RenderQualityProfile) {
        return true;
    }

    apply(context: RenderPassContext) {
        if (!context.effectSurface) {
            return;
        }

        const frame = this.deps.getFrame(context);
        const flights = getActiveResourceFlights(frame.effectNowMs);
        if (!flights.length) return;

        const ctx = context.effectSurface.ctx;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const flight of flights) {
            if (frame.effectNowMs < flight.startedMs) continue;

            const target = getResourceTargetCenter(flight.resourceType);
            if (!target) continue;

            const progress = Math.min(1, Math.max(0, (frame.effectNowMs - flight.startedMs) / flight.durationMs));
            const eased = smoothStep(progress);
            const world = axialToPixel(flight.q, flight.r);
            const start = this.deps.projectWorldToScreenPixels(world.x, world.y, frame.cameraFx);
            const controlX = ((start.x + target.x) / 2) + flight.scatter;
            const controlY = Math.min(start.y, target.y) - (68 + (Math.abs(flight.scatter) * 0.35));
            const point = getQuadraticPoint(start.x, start.y, controlX, controlY, target.x, target.y, eased);
            const alpha = 1 - (progress * 0.55);
            const scale = 0.72 + ((1 - progress) * 0.55);
            const glowRadius = 10 + ((1 - progress) * 5);
            const color = hexToColor(flight.color);

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, glowRadius);
            glow.addColorStop(0, toRgba(color, alpha * 0.9));
            glow.addColorStop(0.45, toRgba(color, alpha * 0.4));
            glow.addColorStop(1, toRgba(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(point.x, point.y);
            ctx.scale(scale, scale);
            ctx.font = "18px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
            ctx.fillText(flight.icon, 0, 0);
            ctx.restore();
        }

        ctx.restore();
    }
}
