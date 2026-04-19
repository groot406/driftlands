import { axialToPixel, camera, hexDistance } from '../../camera';
import type { Hero } from '../../types/Hero';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext } from '../RenderPassContext';
import { HeroRenderer, type HeroOverlayRecord } from './HeroRenderer';

interface CameraCompositeStateLike {
    offsetX: number;
    offsetY: number;
    roll: number;
    zoom: number;
}

interface DrawOptionsLike {
    hoveredHero: Hero | null;
    hoveredSettler?: { id: string } | null;
    globalReachTileIds?: Set<string>;
}

interface RenderFrameLike {
    cameraFx: CameraCompositeStateLike;
    effectNowMs: number;
    movementNowMs: number;
    visibleTiles: Tile[];
}

interface EntityRendererDependencies {
    canvas: HTMLCanvasElement | null;
    dpr: number;
    hexSize: number;
    tileDrawSize: number;
    getCanvasCenter(): { cx: number; cy: number };
    applyWorldTransform(
        ctx: CanvasRenderingContext2D,
        translateX: number,
        translateY: number,
        cameraFx: CameraCompositeStateLike,
    ): void;
    getSupportAwareTileOpacity(tile: Tile, opacity: number): number;
    getTileOpacity(dist: number, applyCameraFade: boolean): number;
    drawTile(tile: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number): void;
    drawUndiscoveredTile(ctx: CanvasRenderingContext2D, opacity: number, tile: Tile, inReach: boolean): void;
    getTileOverlayKey(tile: Tile): string | null;
    getTileOverlayOffset(tile: Tile): { x: number; y: number };
    getBuildingOverlayKey(tile: Tile): string | null;
    getBuildingOverlayOffset(tile: Tile): { x: number; y: number };
    getTileImageKey(tile: Tile): string | null;
    buildShadedTileOverlayCanvas(
        tile: Tile,
        baseKey: string,
        overlayKey: string,
        overlayImg: HTMLImageElement,
        drawWidth: number,
        drawHeight: number,
    ): HTMLCanvasElement | null;
    images: Record<string, HTMLImageElement>;
    heroRenderer: HeroRenderer;
    heroRenderDependencies: Parameters<HeroRenderer['drawHeroes']>[6];
}

export class EntityRenderer {
    private shouldRenderTileOverlayInline(tile: Tile, deps: EntityRendererDependencies) {
        const band = tile.supportBand ?? (tile.activationState === 'inactive' ? 'inactive' : null);
        return band === 'inactive' && !!deps.getTileOverlayKey(tile);
    }

    renderWorldLayer(
        context: RenderPassContext,
        frame: RenderFrameLike,
        opts: DrawOptionsLike,
        deps: EntityRendererDependencies,
    ) {
        const surface = context.entitySurface;
        if (!surface || !deps.canvas) {
            return;
        }

        surface.ctx.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = deps.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        surface.ctx.save();
        surface.ctx.scale(deps.dpr, deps.dpr);
        deps.applyWorldTransform(surface.ctx, translateX, translateY, frame.cameraFx);

        const overlayRecords: HeroOverlayRecord[] = [];
        this.drawTiles(surface.ctx, overlayRecords, frame.visibleTiles, frame.effectNowMs, opts.globalReachTileIds, deps);
        deps.heroRenderer.drawHeroes(
            surface.ctx,
            opts.hoveredHero,
            opts.hoveredSettler ?? null,
            overlayRecords,
            false,
            frame.movementNowMs,
            deps.heroRenderDependencies,
        );

        surface.ctx.restore();
    }

    private drawTiles(
        ctx: CanvasRenderingContext2D,
        overlayRecords: HeroOverlayRecord[],
        tiles: Tile[],
        now: number,
        reachTileIds: Set<string> | undefined,
        deps: EntityRendererDependencies,
    ) {
        for (const tile of tiles) {
            const dist = hexDistance(camera, tile);
            const opacity = deps.getSupportAwareTileOpacity(tile, deps.getTileOpacity(dist, false));

            if (!tile.discovered) {
                const inReach = !reachTileIds || reachTileIds.has(`${tile.q},${tile.r}`);
                deps.drawUndiscoveredTile(ctx, opacity, tile, inReach);
                continue;
            }

            const { x, y } = axialToPixel(tile.q, tile.r);
            const overlayKey = this.shouldRenderTileOverlayInline(tile, deps) ? null : deps.getTileOverlayKey(tile);
            if (overlayKey) {
                const ovImg = deps.images[overlayKey];
                if (ovImg) {
                    const off = deps.getTileOverlayOffset(tile);
                    const baseKey = deps.getTileImageKey(tile) ?? tile.terrain ?? 'plains';
                    const sourceWidth = ovImg.naturalWidth || ovImg.width || deps.tileDrawSize;
                    const sourceHeight = ovImg.naturalHeight || ovImg.height || deps.tileDrawSize;
                    const drawWidth = deps.tileDrawSize;
                    const drawHeight = Math.round((sourceHeight / sourceWidth) * drawWidth);
                    const overlaySource = deps.buildShadedTileOverlayCanvas(
                        tile,
                        baseKey,
                        overlayKey,
                        ovImg,
                        drawWidth,
                        drawHeight,
                    ) ?? ovImg;
                    overlayRecords.push({
                        source: overlaySource,
                        x: x - deps.hexSize + off.x,
                        y: y - deps.hexSize + off.y,
                        width: drawWidth,
                        height: drawHeight,
                        q: tile.q,
                        r: tile.r,
                        opacity,
                        z: 0,
                    });
                }
            }

            const buildingOverlayKey = deps.getBuildingOverlayKey(tile);
            if (buildingOverlayKey) {
                const buildingImg = deps.images[buildingOverlayKey];
                if (buildingImg) {
                    const off = deps.getBuildingOverlayOffset(tile);
                    const sourceWidth = buildingImg.naturalWidth || buildingImg.width || deps.tileDrawSize;
                    const sourceHeight = buildingImg.naturalHeight || buildingImg.height || deps.tileDrawSize;
                    const drawWidth = deps.tileDrawSize;
                    const drawHeight = Math.round((sourceHeight / sourceWidth) * drawWidth);
                    overlayRecords.push({
                        source: buildingImg,
                        x: x - deps.hexSize + off.x,
                        y: y + deps.hexSize - drawHeight + off.y,
                        width: drawWidth,
                        height: drawHeight,
                        q: tile.q,
                        r: tile.r,
                        opacity,
                        z: 1,
                    });
                }
            }

            // Chunked terrain already rendered the discovered ground layer.
            void now;
            void deps.drawTile;
        }
    }
}
