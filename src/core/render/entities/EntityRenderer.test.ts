import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import type { RenderPassContext } from '../RenderPassContext';
import { EntityRenderer } from './EntityRenderer';

type MockCanvasContext = CanvasRenderingContext2D & {
    calls: Record<'clearRect' | 'drawImage' | 'restore' | 'save' | 'scale', number>;
};

function createMockContext(): MockCanvasContext {
    const calls: Record<'clearRect' | 'drawImage' | 'restore' | 'save' | 'scale', number> = {
        clearRect: 0,
        drawImage: 0,
        restore: 0,
        save: 0,
        scale: 0,
    };

    return {
        calls,
        clearRect() {
            calls.clearRect += 1;
        },
        drawImage() {
            calls.drawImage += 1;
        },
        save() {
            calls.save += 1;
        },
        restore() {
            calls.restore += 1;
        },
        scale() {
            calls.scale += 1;
        },
        translate() {
            return undefined;
        },
        imageSmoothingEnabled: true,
        globalAlpha: 1,
    } as unknown as MockCanvasContext;
}

function createSceneTile(tileId: string, q = 0, r = 0, discovered = true, terrainType: string | null = 'grain') {
    return {
        tileId,
        q,
        r,
        worldX: 0,
        worldY: 0,
        terrainType,
        variantKey: null,
        activationState: 'active',
        supportBand: null,
        flags: {
            discovered,
            hasVariant: false,
            inReach: false,
            hasTileOverlay: false,
            hasBuildingOverlay: false,
        },
    };
}

function createRenderPassContext(
    ctx: CanvasRenderingContext2D,
    sceneVisibleTiles: ReturnType<typeof createSceneTile>[] = [],
    entityCanvas: HTMLCanvasElement = { width: 640, height: 480 } as HTMLCanvasElement,
): RenderPassContext {
    return {
        finalCtx: {} as CanvasRenderingContext2D,
        entitySurface: {
            canvas: entityCanvas,
            ctx,
        },
        viewport: {
            width: 640,
            height: 480,
            dpr: 1,
            cameraX: 0,
            cameraY: 0,
            cameraQ: 0,
            cameraR: 0,
            radius: 10,
            innerRadius: 5,
            zoom: 1,
            roll: 0,
            offsetX: 0,
            offsetY: 0,
        },
        scene: {
            viewport: {
                width: 640,
                height: 480,
                dpr: 1,
                cameraX: 0,
                cameraY: 0,
                cameraQ: 0,
                cameraR: 0,
                radius: 10,
                innerRadius: 5,
                zoom: 1,
                roll: 0,
                offsetX: 0,
                offsetY: 0,
            },
            visibleTiles: sceneVisibleTiles,
            visibleChunks: [],
            visibleEntities: [],
            overlays: [],
            particles: [],
            debug: {
                visibleTileCount: 0,
                visibleEntityCount: 0,
                overlayCount: 0,
                visibleChunkCount: 0,
                dirtyChunkCount: 0,
                selectedHeroId: null,
            },
            frameInfo: {
                effectNowMs: 0,
                movementNowMs: 0,
                perfNowMs: 0,
                worldRenderVersion: 0,
                stressTier: 0,
                cameraMoving: false,
                qualityName: 'high',
            },
        },
        quality: getBaseRenderQualityProfile(0),
        config: {
            hexSize: 34,
            hexSpace: 2,
            tileDrawSize: 66,
            tileDepthPaddingPx: 16,
            terrainChunkSize: 16,
            heroFrameSize: 16,
            heroZoom: 2,
            heroOffsetSpacing: 14,
            staticTerrainPaddingPx: 462,
            ambientParticleDensity: 0.58,
            hexXFactor: 68.573,
            hexYFactor: 51,
        },
        debug: { enabled: false },
        runtime: {},
        passTimingsMs: {},
    };
}

function createDependencies(capturedOverlayCounts: number[], drawOrder: string[] = []) {
    return {
        canvas: { width: 640, height: 480 } as HTMLCanvasElement,
        dpr: 1,
        hexSize: 34,
        tileDrawSize: 66,
        getCanvasCenter: () => ({ cx: 320, cy: 240 }),
        applyWorldTransform: () => undefined,
        getSupportAwareTileOpacity: (_tile: unknown, opacity: number) => opacity,
        getTileOpacity: () => 1,
        drawTile: () => undefined,
        drawTileBottomEdges: () => {
            drawOrder.push('depth-edges');
        },
        drawUndiscoveredTile: () => undefined,
        getTileOverlayKey: () => 'grain_overhang',
        getTileOverlayOffset: () => ({ x: 0, y: 0 }),
        getBuildingOverlayKey: () => null,
        getBuildingOverlayOffset: () => ({ x: 0, y: 0 }),
        getTileImageKey: () => 'grain-v2',
        buildShadedTileOverlayCanvas: () => null,
        getTileOverlayDrawSpec: () => ({
            sourceRect: { sx: 0, sy: 0, sw: 64, sh: 64 },
            drawWidth: 66,
            drawHeight: 66,
            frameCacheKey: 'grain_overhang',
        }),
        getBuildingOverlayDrawSpec: () => ({
            sourceRect: { sx: 0, sy: 0, sw: 64, sh: 64 },
            drawWidth: 66,
            drawHeight: 66,
            frameCacheKey: 'building',
        }),
        images: {
            grain_overhang: {
                naturalWidth: 64,
                naturalHeight: 64,
                width: 64,
                height: 64,
            } as HTMLImageElement,
        },
        drawDepthEdgeHighlights: () => {
            drawOrder.push('highlights');
        },
        heroRenderer: {
            drawHeroes: (
                _ctx: CanvasRenderingContext2D,
                _hoveredHero: null,
                _hoveredSettler: null,
                overlayRecords: ReadonlyArray<unknown>,
            ) => {
                drawOrder.push('overlays-and-actors');
                capturedOverlayCounts.push(overlayRecords.length);
            },
        },
        heroRenderDependencies: {},
    };
}

function createTile(id: string, q: number, r: number) {
    return {
        id,
        q,
        r,
        biome: null,
        terrain: 'grain',
        discovered: true,
        isBaseTile: true,
        activationState: 'active',
    };
}

test('EntityRenderer keeps inactive terrain overlays inside the tile composite path', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const capturedOverlayCounts: number[] = [];
    const drawOrder: string[] = [];

    renderer.renderWorldLayer(
        createRenderPassContext(ctx),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 0,
            movementNowMs: 0,
            visibleTiles: [
                {
                    id: '0,0',
                    q: 0,
                    r: 0,
                    biome: null,
                    terrain: 'grain',
                    discovered: true,
                    isBaseTile: true,
                    activationState: 'inactive',
                },
            ],
        },
        {
            hoveredHero: null,
            pathCoords: [],
        },
        createDependencies(capturedOverlayCounts, drawOrder) as any,
    );

    assert.deepEqual(capturedOverlayCounts, [0]);
    assert.deepEqual(drawOrder, ['depth-edges', 'highlights', 'overlays-and-actors']);
});

test('EntityRenderer reuses visible tile id set between frames', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const receivedSets: ReadonlySet<string>[] = [];
    const deps = {
        ...createDependencies([]),
        drawTileBottomEdges: (
            _tile: unknown,
            _now: number,
            _ctx: CanvasRenderingContext2D,
            _opacity: number,
            visibleTileIds: ReadonlySet<string>,
        ) => {
            receivedSets.push(visibleTileIds);
        },
    };

    const renderFrame = (tiles: any[]) => renderer.renderWorldLayer(
        createRenderPassContext(ctx, tiles.map((tile) => createSceneTile(tile.id, tile.q, tile.r))),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 0,
            movementNowMs: 0,
            visibleTiles: tiles,
        },
        {
            hoveredHero: null,
            pathCoords: [],
        },
        deps as any,
    );

    renderFrame([createTile('0,0', 0, 0)]);
    renderFrame([createTile('1,0', 1, 0), createTile('1,1', 1, 1)]);

    assert.equal(receivedSets.length, 3);
    assert.equal(receivedSets[0], receivedSets[1]);
    assert.equal(receivedSets[1], receivedSets[2]);
    assert.equal(receivedSets[2]?.has('0,0'), false);
    assert.equal(receivedSets[2]?.has('1,0'), true);
    assert.equal(receivedSets[2]?.has('1,1'), true);
});

test('EntityRenderer uses viewport-filtered terrain tiles for bottom edge adjacency', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const receivedSets: ReadonlySet<string>[] = [];
    const deps = {
        ...createDependencies([]),
        drawTileBottomEdges: (
            _tile: unknown,
            _now: number,
            _ctx: CanvasRenderingContext2D,
            _opacity: number,
            visibleTileIds: ReadonlySet<string>,
        ) => {
            receivedSets.push(visibleTileIds);
        },
    };

    renderer.renderWorldLayer(
        createRenderPassContext(ctx, [createSceneTile('0,0', 0, 0)]),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 0,
            movementNowMs: 0,
            visibleTiles: [
                createTile('0,0', 0, 0),
                createTile('0,1', 0, 1),
            ],
        },
        {
            hoveredHero: null,
            pathCoords: [],
        },
        deps as any,
    );

    assert.equal(receivedSets.length, 2);
    assert.equal(receivedSets[0]?.has('0,0'), true);
    assert.equal(receivedSets[0]?.has('0,1'), false);
    assert.equal(receivedSets[0], receivedSets[1]);
});

test('EntityRenderer includes visible frontier tiles in bottom edge adjacency', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const receivedSets: ReadonlySet<string>[] = [];
    const deps = {
        ...createDependencies([]),
        drawTileBottomEdges: (
            _tile: unknown,
            _now: number,
            _ctx: CanvasRenderingContext2D,
            _opacity: number,
            visibleTileIds: ReadonlySet<string>,
        ) => {
            receivedSets.push(visibleTileIds);
        },
    };

    renderer.renderWorldLayer(
        createRenderPassContext(ctx, [
            createSceneTile('0,0', 0, 0, true, 'grain'),
            createSceneTile('0,1', 0, 1, false, null),
        ]),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 0,
            movementNowMs: 0,
            visibleTiles: [
                createTile('0,0', 0, 0),
                {
                    ...createTile('0,1', 0, 1),
                    terrain: null,
                    discovered: false,
                },
            ],
        },
        {
            hoveredHero: null,
            pathCoords: [],
        },
        deps as any,
    );

    assert.equal(receivedSets.length, 2);
    assert.equal(receivedSets[0]?.has('0,0'), true);
    assert.equal(receivedSets[0]?.has('0,1'), true);
});

test('EntityRenderer caches unchanged bottom edge layer', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const edgeCtx = createMockContext();
    const edgeCanvas = {
        width: 640,
        height: 480,
        getContext: () => edgeCtx,
    } as unknown as HTMLCanvasElement;
    const entityCanvas = {
        width: 640,
        height: 480,
        ownerDocument: {
            createElement: () => edgeCanvas,
        },
    } as unknown as HTMLCanvasElement;
    let edgeDraws = 0;
    const deps = {
        ...createDependencies([]),
        drawTileBottomEdges: () => {
            edgeDraws += 1;
        },
    };
    const context = createRenderPassContext(ctx, [createSceneTile('0,0', 0, 0)], entityCanvas);
    const frame = {
        cameraFx: {
            offsetX: 0,
            offsetY: 0,
            roll: 0,
            zoom: 1,
        },
        effectNowMs: 0,
        movementNowMs: 0,
        visibleTiles: [
            createTile('0,0', 0, 0),
        ],
    };
    const opts = {
        hoveredHero: null,
        pathCoords: [],
    };

    renderer.renderWorldLayer(context, frame, opts, deps as any);
    renderer.renderWorldLayer(context, frame, opts, deps as any);

    assert.equal(edgeDraws, 1);
    assert.equal(ctx.calls.drawImage, 2);
});

test('EntityRenderer keeps cached bottom edges across non-discovery world updates', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const edgeCtx = createMockContext();
    const edgeCanvas = {
        width: 640,
        height: 480,
        getContext: () => edgeCtx,
    } as unknown as HTMLCanvasElement;
    const entityCanvas = {
        width: 640,
        height: 480,
        ownerDocument: {
            createElement: () => edgeCanvas,
        },
    } as unknown as HTMLCanvasElement;
    let edgeDraws = 0;
    const deps = {
        ...createDependencies([]),
        drawTileBottomEdges: () => {
            edgeDraws += 1;
        },
    };
    const frame = {
        cameraFx: {
            offsetX: 0,
            offsetY: 0,
            roll: 0,
            zoom: 1,
        },
        effectNowMs: 0,
        movementNowMs: 0,
        visibleTiles: [
            createTile('0,0', 0, 0),
        ],
    };
    const opts = {
        hoveredHero: null,
        pathCoords: [],
    };
    const firstContext = createRenderPassContext(ctx, [createSceneTile('0,0', 0, 0)], entityCanvas);
    const updateContext = createRenderPassContext(ctx, [createSceneTile('0,0', 0, 0)], entityCanvas);
    updateContext.scene.frameInfo.worldRenderVersion = 1;

    renderer.renderWorldLayer(firstContext, frame, opts, deps as any);
    renderer.renderWorldLayer(updateContext, frame, opts, deps as any);

    assert.equal(edgeDraws, 1);
    assert.equal(ctx.calls.drawImage, 2);
});

test('EntityRenderer rebuilds cached bottom edges when a tile is discovered', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const edgeCtx = createMockContext();
    const edgeCanvas = {
        width: 640,
        height: 480,
        getContext: () => edgeCtx,
    } as unknown as HTMLCanvasElement;
    const entityCanvas = {
        width: 640,
        height: 480,
        ownerDocument: {
            createElement: () => edgeCanvas,
        },
    } as unknown as HTMLCanvasElement;
    let edgeDraws = 0;
    const deps = {
        ...createDependencies([]),
        drawTileBottomEdges: () => {
            edgeDraws += 1;
        },
    };
    const context = createRenderPassContext(ctx, [createSceneTile('0,0', 0, 0)], entityCanvas);
    const frame = {
        cameraFx: {
            offsetX: 0,
            offsetY: 0,
            roll: 0,
            zoom: 1,
        },
        effectNowMs: 0,
        movementNowMs: 0,
        visibleTiles: [
            createTile('0,0', 0, 0),
        ],
    };
    const discoveryFrame = {
        ...frame,
        discoveredTileIds: new Set(['0,0']),
    };
    const opts = {
        hoveredHero: null,
        pathCoords: [],
    };

    renderer.renderWorldLayer(context, frame, opts, deps as any);
    renderer.renderWorldLayer(context, discoveryFrame, opts, deps as any);
    renderer.renderWorldLayer(context, frame, opts, deps as any);

    assert.equal(edgeDraws, 2);
    assert.equal(ctx.calls.drawImage, 3);
});

test('EntityRenderer still defers active terrain overlays for hero layering', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const capturedOverlayCounts: number[] = [];
    const drawOrder: string[] = [];

    renderer.renderWorldLayer(
        createRenderPassContext(ctx),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 0,
            movementNowMs: 0,
            visibleTiles: [
                {
                    id: '0,0',
                    q: 0,
                    r: 0,
                    biome: null,
                    terrain: 'grain',
                    discovered: true,
                    isBaseTile: true,
                    activationState: 'active',
                },
            ],
        },
        {
            hoveredHero: null,
            pathCoords: [],
        },
        createDependencies(capturedOverlayCounts, drawOrder) as any,
    );

    assert.deepEqual(capturedOverlayCounts, [1]);
    assert.deepEqual(drawOrder, ['depth-edges', 'highlights', 'overlays-and-actors']);
});
