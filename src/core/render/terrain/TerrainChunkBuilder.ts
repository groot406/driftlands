import { axialKey, tileIndex } from '../../world';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext } from '../RenderPassContext';
import type { TerrainChunkRef } from '../RenderTypes';

export interface TerrainChunkBuildRequest {
    chunk: TerrainChunkRef;
    canvas: HTMLCanvasElement;
    context: RenderPassContext;
}

interface TerrainChunkBuilderDependencies {
    get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null;
    drawTile(tile: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number): void;
    getSupportAwareTileOpacity(tile: Tile, opacity: number): number;
}

export class TerrainChunkBuilder {
    private readonly deps: TerrainChunkBuilderDependencies;

    constructor(deps: TerrainChunkBuilderDependencies) {
        this.deps = deps;
    }

    rebuild(request: TerrainChunkBuildRequest) {
        const { chunk, canvas, context } = request;
        canvas.width = Math.max(1, Math.ceil(chunk.width));
        canvas.height = Math.max(1, Math.ceil(chunk.height));

        const ctx = this.deps.get2dContext(canvas);
        if (!ctx) {
            return;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(-chunk.worldX, -chunk.worldY);

        for (let q = chunk.minQ; q <= chunk.maxQ; q++) {
            for (let r = chunk.minR; r <= chunk.maxR; r++) {
                const tile = tileIndex[axialKey(q, r)];
                if (!tile?.discovered) {
                    continue;
                }

                const opacity = this.deps.getSupportAwareTileOpacity(tile, 1);
                this.deps.drawTile(tile, context.scene.frameInfo.effectNowMs, ctx, opacity);
            }
        }

        ctx.restore();
    }
}
