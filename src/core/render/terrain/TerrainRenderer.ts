import type { RenderPassContext } from '../RenderPassContext';
import { HexProjection } from '../math/HexProjection';
import { TerrainChunkBuilder } from './TerrainChunkBuilder';
import { TerrainChunkCache } from './TerrainChunkCache';

interface TerrainRendererRuntime {
    dirtyChunkKeys?: readonly string[];
    terrainMetrics?: {
        visibleChunkCount: number;
        dirtyChunkCount: number;
        terrainChunkRebuilds: number;
    };
}

interface TerrainRendererOptions {
    cache: TerrainChunkCache;
    builder: TerrainChunkBuilder;
}

export class TerrainRenderer {
    private readonly cache: TerrainChunkCache;
    private readonly builder: TerrainChunkBuilder;
    private lastWorldRenderVersion = -1;

    constructor(options: TerrainRendererOptions) {
        this.cache = options.cache;
        this.builder = options.builder;
    }

    render(context: RenderPassContext) {
        const surface = context.terrainSurface;
        if (!surface) {
            return;
        }

        const runtime = context.runtime as TerrainRendererRuntime;
        const dirtyChunkKeys = runtime.dirtyChunkKeys ?? [];
        if (dirtyChunkKeys.length) {
            this.cache.markDirtyMany(dirtyChunkKeys);
        } else if (this.lastWorldRenderVersion !== -1 && this.lastWorldRenderVersion !== context.scene.frameInfo.worldRenderVersion) {
            this.cache.markAllDirty();
        }
        this.lastWorldRenderVersion = context.scene.frameInfo.worldRenderVersion;

        const rebuildsBefore = this.cache.getTotalRebuildCount();
        surface.ctx.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
        surface.ctx.save();
        surface.ctx.scale(context.viewport.dpr, context.viewport.dpr);
        surface.ctx.imageSmoothingEnabled = false;

        for (const chunk of context.scene.visibleChunks) {
            const entry = this.cache.ensureChunk(chunk.key, {
                rebuild: ({ canvas }) => {
                    this.builder.rebuild({
                        chunk,
                        canvas,
                        context,
                    });
                },
            });
            const screen = HexProjection.worldToScreen(chunk.worldX, chunk.worldY, context.viewport);
            surface.ctx.drawImage(entry.canvas, Math.round(screen.x), Math.round(screen.y));
        }

        surface.ctx.restore();
        runtime.terrainMetrics = {
            visibleChunkCount: context.scene.visibleChunks.length,
            dirtyChunkCount: this.cache.getDirtyCount(),
            terrainChunkRebuilds: this.cache.getTotalRebuildCount() - rebuildsBefore,
        };
    }
}
