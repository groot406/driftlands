import type { RenderPassContext } from '../RenderPassContext';
import type { RenderQualityProfile } from '../RenderTypes';
import type { WorldEffect } from './WorldEffect';

export class FogShimmerEffect implements WorldEffect {
    readonly name = 'FogShimmerEffect';

    isEnabled(quality: RenderQualityProfile) {
        return quality.enableFogShimmer && quality.fogShimmerEnabled;
    }

    apply(_context: RenderPassContext) {}

    drawTileShimmer(
        ctx: CanvasRenderingContext2D,
        q: number,
        r: number,
        x: number,
        y: number,
        tileDrawSize: number,
        hexSize: number,
        reachDim: number,
        drawHexPath: (ctx: CanvasRenderingContext2D, x: number, y: number) => void,
    ) {
        
        const shimmerSeed = ((q * 374761393) ^ (r * 668265263)) >>> 0;
        const shimmerX = ((shimmerSeed % 100) / 100) * tileDrawSize * 0.4 + tileDrawSize * 0.2;
        const shimmerY = (((shimmerSeed >> 8) % 100) / 100) * tileDrawSize * 0.4 + tileDrawSize * 0.2;
        const shimmerR = tileDrawSize * 0.18 + (((shimmerSeed >> 16) % 50) / 50) * tileDrawSize * 0.12;
        ctx.save();
        ctx.beginPath();
        drawHexPath(ctx, x, y);
        ctx.clip();
        const shimGrad = ctx.createRadialGradient(
            x - hexSize + shimmerX, y - hexSize + shimmerY, 0,
            x - hexSize + shimmerX, y - hexSize + shimmerY, shimmerR,
        );
        shimGrad.addColorStop(0, 'rgba(160, 180, 220, 0.09)');
        shimGrad.addColorStop(1, 'rgba(120, 140, 180, 0)');
        ctx.fillStyle = shimGrad;
        ctx.globalAlpha = reachDim;
        ctx.fill();
        ctx.restore();
    }
}
