import type { Hero } from '../types/Hero';
import type { Settler } from '../types/Settler';
import { DEFAULT_RENDER_CONFIG, type RenderConfig } from './RenderConfig';
import { EntitySortService } from './entities/EntitySortService';
import { getSettlerRenderFacing, isSettlerVisibleOnMap } from './entities/settlerRender';
import { HexProjection } from './math/HexProjection';
import { filterAxialItemsToViewport } from './math/VisibilityMath';
import { createTerrainChunkKey, getTerrainChunkBounds, getTerrainChunkCoordForTile } from './terrain/TerrainChunkKey';
import type {
    EntityRenderItem,
    FrameTimes,
    HexMapDrawOptions,
    OverlayRenderItem,
    RenderQualityProfile,
    RenderScene,
    RenderStressTier,
    TerrainChunkRef,
    TerrainTileRenderItem,
    ViewportSnapshot,
} from './RenderTypes';

interface RenderSceneBuilderInput {
    viewport: ViewportSnapshot;
    quality: RenderQualityProfile;
    stressTier: RenderStressTier;
    drawOptions: HexMapDrawOptions;
    frameTimes: FrameTimes;
    cameraMoving: boolean;
    candidateTiles: readonly RenderSceneBuilderTile[];
    candidateHeroes?: readonly Hero[];
    candidateSettlers?: readonly Settler[];
    selectedHeroId?: string | null;
    worldRenderVersion: number;
    dirtyChunkKeys?: readonly string[];
}

interface RenderSceneBuilderTile {
        id: string;
        q: number;
        r: number;
        terrain: string | null;
        variant?: string | null;
        discovered: boolean;
        activationState?: TerrainTileRenderItem['activationState'];
        supportBand?: TerrainTileRenderItem['supportBand'];
}

export class RenderSceneBuilder {
    private readonly config: RenderConfig;

    constructor(config: RenderConfig = DEFAULT_RENDER_CONFIG) {
        this.config = config;
    }

    build(input: RenderSceneBuilderInput): RenderScene {
        const visibleTiles = this.buildVisibleTiles(input.candidateTiles, input.viewport, input.drawOptions.globalReachTileIds);
        const visibleChunks = this.buildVisibleChunks(visibleTiles);
        const heroCandidates = input.candidateHeroes ?? [];
        const settlerCandidates = input.candidateSettlers ?? [];
        const visibleEntities = this.buildVisibleEntities(
            heroCandidates,
            settlerCandidates,
            input.viewport,
            input.frameTimes.movementNowMs,
        );
        const overlays = this.buildOverlays(input.drawOptions);

        return {
            viewport: input.viewport,
            visibleTiles,
            visibleChunks,
            visibleEntities,
            overlays,
            particles: [],
            debug: {
                visibleTileCount: visibleTiles.length,
                visibleEntityCount: visibleEntities.length,
                overlayCount: overlays.length,
                visibleChunkCount: visibleChunks.length,
                dirtyChunkCount: input.dirtyChunkKeys?.length ?? 0,
                selectedHeroId: input.selectedHeroId ?? null,
            },
            frameInfo: {
                effectNowMs: input.frameTimes.effectNowMs,
                movementNowMs: input.frameTimes.movementNowMs,
                perfNowMs: input.frameTimes.perfNowMs,
                worldRenderVersion: input.worldRenderVersion,
                stressTier: input.stressTier,
                cameraMoving: input.cameraMoving,
                qualityName: input.quality.name,
            },
        };
    }

    private buildVisibleTiles(
        candidateTiles: readonly RenderSceneBuilderTile[],
        viewport: ViewportSnapshot,
        globalReachTileIds?: ReadonlySet<string>,
    ) {
        return filterAxialItemsToViewport(candidateTiles, viewport, Math.max(this.config.tileDrawSize * 1.5, 72), this.config)
            .map((tile): TerrainTileRenderItem => {
                const world = HexProjection.axialToWorld(tile.q, tile.r, this.config);

                return {
                    tileId: tile.id,
                    q: tile.q,
                    r: tile.r,
                    worldX: world.x,
                    worldY: world.y,
                    terrainType: tile.terrain,
                    variantKey: tile.variant ?? null,
                    activationState: tile.activationState ?? null,
                    supportBand: tile.supportBand ?? null,
                    flags: {
                        discovered: tile.discovered,
                        hasVariant: !!tile.variant,
                        inReach: globalReachTileIds?.has(tile.id) ?? false,
                        hasTileOverlay: false,
                        hasBuildingOverlay: false,
                    },
                };
            });
    }

    private buildVisibleChunks(visibleTiles: readonly TerrainTileRenderItem[]) {
        const chunks = new Map<string, TerrainChunkRef>();

        for (const tile of visibleTiles) {
            const coord = getTerrainChunkCoordForTile(tile.q, tile.r, this.config.terrainChunkSize);
            const key = createTerrainChunkKey(coord.chunkQ, coord.chunkR);
            if (chunks.has(key)) {
                continue;
            }

            const bounds = getTerrainChunkBounds(coord.chunkQ, coord.chunkR, this.config.terrainChunkSize);
            const minWorld = HexProjection.axialToWorld(bounds.minQ, bounds.minR, this.config);
            const maxWorld = HexProjection.axialToWorld(bounds.maxQ, bounds.maxR, this.config);
            chunks.set(key, {
                key,
                chunkQ: coord.chunkQ,
                chunkR: coord.chunkR,
                minQ: bounds.minQ,
                maxQ: bounds.maxQ,
                minR: bounds.minR,
                maxR: bounds.maxR,
                worldX: minWorld.x - this.config.hexSize,
                worldY: minWorld.y - this.config.hexSize,
                width: (maxWorld.x - minWorld.x) + this.config.tileDrawSize + this.config.tileDepthPaddingPx,
                height: (maxWorld.y - minWorld.y) + this.config.tileDrawSize + this.config.tileDepthPaddingPx,
            });
        }

        return [...chunks.values()].sort((a, b) => {
            if (a.chunkR !== b.chunkR) {
                return a.chunkR - b.chunkR;
            }
            return a.chunkQ - b.chunkQ;
        });
    }

    private buildVisibleEntities(
        candidateHeroes: readonly Hero[],
        candidateSettlers: readonly Settler[],
        viewport: ViewportSnapshot,
        movementNowMs: number,
    ) {
        const heroEntities = filterAxialItemsToViewport(candidateHeroes, viewport, Math.max(this.config.tileDrawSize * 1.5, 72), this.config)
            .map((hero): EntityRenderItem => {
                const world = HexProjection.axialToWorld(hero.q, hero.r, this.config);

                return {
                    entityId: hero.id,
                    kind: 'hero',
                    q: hero.q,
                    r: hero.r,
                    worldX: world.x,
                    worldY: world.y,
                    spriteKey: hero.avatar,
                    sortY: hero.r,
                    sortX: hero.q,
                    layer: 1,
                    opacity: 1,
                    scale: this.config.heroZoom,
                    shadow: {
                        opacity: 0.6,
                        widthFactor: 0.6,
                        heightFactor: 0.2,
                        yOffset: 0.13,
                    },
                    facing: hero.facing,
                    movement: hero.movement,
                    currentTaskId: hero.currentTaskId,
                    carryingPayload: hero.carryingPayload,
                };
            });

        const settlerEntities = filterAxialItemsToViewport(
            candidateSettlers.filter((settler) => isSettlerVisibleOnMap(settler)),
            viewport,
            Math.max(this.config.tileDrawSize * 1.25, 64),
            this.config,
        )
            .map((settler): EntityRenderItem => {
                const world = HexProjection.axialToWorld(settler.q, settler.r, this.config);

                return {
                    entityId: settler.id,
                    kind: 'settler',
                    q: settler.q,
                    r: settler.r,
                    worldX: world.x,
                    worldY: world.y,
                    spriteKey: 'settler',
                    sortY: settler.r,
                    sortX: settler.q,
                    layer: 1,
                    opacity: 1,
                    scale: 1.4,
                    shadow: {
                        opacity: 0.45,
                        widthFactor: 0.36,
                        heightFactor: 0.12,
                        yOffset: 0.08,
                    },
                    facing: getSettlerRenderFacing(settler, movementNowMs),
                    movement: settler.movement,
                    carryingPayload: settler.carryingPayload,
                };
            });

        return EntitySortService.sort([...heroEntities, ...settlerEntities]);
    }

    private buildOverlays(drawOptions: HexMapDrawOptions) {
        const overlays: OverlayRenderItem[] = [];

        if (drawOptions.hoveredTile) {
            overlays.push({
                type: 'hover',
                layer: 'underlay',
                q: drawOptions.hoveredTile.q,
                r: drawOptions.hoveredTile.r,
                styleKey: drawOptions.hoveredTileInReach === false ? 'hover:unreachable' : 'hover:default',
                intensity: 1,
            });
        }

        if (drawOptions.taskMenuTile) {
            overlays.push({
                type: 'selected',
                layer: 'overlay',
                q: drawOptions.taskMenuTile.q,
                r: drawOptions.taskMenuTile.r,
                styleKey: 'task-menu:selected',
                intensity: 1,
            });
        }

        for (const coord of drawOptions.pathCoords) {
            overlays.push({
                type: 'path',
                layer: 'underlay',
                q: coord.q,
                r: coord.r,
                styleKey: 'path:preview',
                intensity: 1,
            });
        }

        for (const coord of drawOptions.globalReachBoundary ?? []) {
            overlays.push({
                type: 'reach',
                layer: 'overlay',
                q: coord.q,
                r: coord.r,
                styleKey: 'reach:global',
                intensity: 0.45,
            });
        }

        for (const coord of drawOptions.storyHintTiles ?? []) {
            overlays.push({
                type: 'marker',
                layer: 'underlay',
                q: coord.q,
                r: coord.r,
                styleKey: 'story-hint:tile',
                intensity: 1,
            });
        }

        for (const coord of drawOptions.clusterBoundaryTiles ?? []) {
            overlays.push({
                type: 'region',
                layer: 'overlay',
                q: coord.q,
                r: coord.r,
                styleKey: 'cluster:outline',
                intensity: 1,
            });
        }

        if (drawOptions.showSupportOverlay) {
            overlays.push({
                type: 'marker',
                layer: 'underlay',
                styleKey: 'support:visible',
                intensity: 1,
            });
        }

        return overlays;
    }
}
