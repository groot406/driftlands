import type { RenderPassContext } from '../RenderPassContext';
import type { Tile } from '../../types/Tile';
import { tileIndex } from '../../world';
import { HexProjection } from '../math/HexProjection';
import { TerrainChunkBuilder } from './TerrainChunkBuilder';
import { TerrainChunkCache } from './TerrainChunkCache';

interface TerrainRendererRuntime {
    dirtyChunkKeys?: readonly string[];
    terrainMetrics?: {
        visibleChunkCount: number;
        dirtyChunkCount: number;
        terrainChunkRebuilds: number;
        terrainSurfaceReused?: boolean;
    };
}

interface TerrainRendererOptions {
    cache: TerrainChunkCache;
    builder: TerrainChunkBuilder;
    shouldDrawAnimatedTile?(tile: Tile): boolean;
    drawAnimatedTile?(tile: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number): void;
    getSupportAwareTileOpacity?(tile: Tile, opacity: number): number;
}

export class TerrainRenderer {
    private readonly cache: TerrainChunkCache;
    private readonly builder: TerrainChunkBuilder;
    private readonly shouldDrawAnimatedTile?: (tile: Tile) => boolean;
    private readonly drawAnimatedTile?: (tile: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number) => void;
    private readonly getSupportAwareTileOpacity?: (tile: Tile, opacity: number) => number;
    private lastWorldRenderVersion = -1;
    private lastSurfaceKey = '';

    constructor(options: TerrainRendererOptions) {
        this.cache = options.cache;
        this.builder = options.builder;
        this.shouldDrawAnimatedTile = options.shouldDrawAnimatedTile;
        this.drawAnimatedTile = options.drawAnimatedTile;
        this.getSupportAwareTileOpacity = options.getSupportAwareTileOpacity;
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
        const hasAnimatedVisibleTile = this.hasAnimatedVisibleTile(context);
        const surfaceKey = this.getSurfaceKey(context, surface.canvas);
        const canReuseSurface = !hasAnimatedVisibleTile
            && dirtyChunkKeys.length === 0
            && this.cache.getDirtyCount() === 0
            && this.lastSurfaceKey === surfaceKey;

        if (canReuseSurface) {
            runtime.terrainMetrics = {
                visibleChunkCount: context.scene.visibleChunks.length,
                dirtyChunkCount: this.cache.getDirtyCount(),
                terrainChunkRebuilds: 0,
                terrainSurfaceReused: true,
            };
            return;
        }

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

        if (this.shouldDrawAnimatedTile && this.drawAnimatedTile) {
            for (const item of context.scene.visibleTiles) {
                const tile = tileIndex[item.tileId];
                if (!tile?.discovered || !this.shouldDrawAnimatedTile(tile)) {
                    continue;
                }

                const world = HexProjection.axialToWorld(tile.q, tile.r, context.config);
                const screen = HexProjection.worldToScreen(world.x, world.y, context.viewport);
                const opacity = this.getSupportAwareTileOpacity?.(tile, 1) ?? 1;
                surface.ctx.save();
                surface.ctx.translate(Math.round(screen.x - world.x), Math.round(screen.y - world.y));
                this.drawAnimatedTile(tile, context.scene.frameInfo.effectNowMs, surface.ctx, opacity);
                surface.ctx.restore();
            }
        }

        surface.ctx.restore();
        this.lastSurfaceKey = surfaceKey;
        runtime.terrainMetrics = {
            visibleChunkCount: context.scene.visibleChunks.length,
            dirtyChunkCount: this.cache.getDirtyCount(),
            terrainChunkRebuilds: this.cache.getTotalRebuildCount() - rebuildsBefore,
            terrainSurfaceReused: false,
        };
    }

    private hasAnimatedVisibleTile(context: RenderPassContext) {
        if (!this.shouldDrawAnimatedTile) {
            return false;
        }

        for (const item of context.scene.visibleTiles) {
            const tile = tileIndex[item.tileId];
            if (tile?.discovered && this.shouldDrawAnimatedTile(tile)) {
                return true;
            }
        }

        return false;
    }

    private getSurfaceKey(context: RenderPassContext, canvas: HTMLCanvasElement) {
        const viewport = context.viewport;
        const chunkKeys = context.scene.visibleChunks.map((chunk) => chunk.key).join('|');
        return [
            canvas.width,
            canvas.height,
            viewport.dpr,
            viewport.cameraX,
            viewport.cameraY,
            viewport.zoom,
            viewport.roll,
            viewport.offsetX,
            viewport.offsetY,
            context.scene.frameInfo.worldRenderVersion,
            chunkKeys,
        ].join(':');
    }
}
