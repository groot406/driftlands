import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import type { RenderPassContext } from '../RenderPassContext';
import type { Tile } from '../../types/Tile';
import { getBuildingHealthBar, OverlayRenderer } from './OverlayRenderer';
import { heroes } from '../../../store/heroStore';

type MockCanvasContext = CanvasRenderingContext2D & {
    calls: Record<'clearRect' | 'fillRect' | 'restore' | 'save' | 'scale' | 'strokeRect', number>;
};

function createMockContext(): MockCanvasContext {
    const calls: Record<'clearRect' | 'fillRect' | 'restore' | 'save' | 'scale' | 'strokeRect', number> = {
        clearRect: 0,
        fillRect: 0,
        restore: 0,
        save: 0,
        scale: 0,
        strokeRect: 0,
    };

    return {
        calls,
        clearRect() {
            calls.clearRect += 1;
        },
        fillRect() {
            calls.fillRect += 1;
        },
        restore() {
            calls.restore += 1;
        },
        save() {
            calls.save += 1;
        },
        scale() {
            calls.scale += 1;
        },
        strokeRect() {
            calls.strokeRect += 1;
        },
    } as unknown as MockCanvasContext;
}

function createContext(underlayCtx: MockCanvasContext, topCtx: MockCanvasContext): RenderPassContext {
    const viewport = {
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
    };

    return {
        finalCtx: {} as CanvasRenderingContext2D,
        overlayUnderlaySurface: {
            canvas: { width: 640, height: 480 } as HTMLCanvasElement,
            ctx: underlayCtx,
        },
        overlayTopSurface: {
            canvas: { width: 640, height: 480 } as HTMLCanvasElement,
            ctx: topCtx,
        },
        viewport,
        scene: {
            viewport,
            visibleTiles: [],
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

function createDeps() {
    return {
        canvas: { width: 640, height: 480 } as HTMLCanvasElement,
        dpr: 1,
        hexSize: 34,
        tileDrawSize: 66,
        heroFrameSize: 16,
        resourceIconMap: {},
        storageIndicatorAlphaByTileId: new Map<string, number>(),
        getCanvasCenter: () => ({ cx: 320, cy: 240 }),
        applyWorldTransform: () => undefined,
        computeFade: () => 1,
        getTileOpacity: () => 1,
        drawHexHighlight: () => undefined,
        drawSupportOverlay: () => undefined,
        drawGameplayWorldImpacts: () => undefined,
        hasGameplayWorldImpacts: () => false,
        drawGrowthTileMotion: () => undefined,
        hasGrowthTileMotion: () => false,
        drawReachOutline: () => undefined,
        drawRoundedRect: () => undefined,
        projectWorldToScreenPixels: (worldX: number, worldY: number) => ({ x: worldX, y: worldY }),
        isHeroIdle: () => false,
        isHeroWalking: () => false,
    };
}

test('getBuildingHealthBar returns durability percent for attacked or damaged combat buildings', () => {
    assert.deepEqual(
        getBuildingHealthBar({
            id: '2,0',
            q: 2,
            r: 0,
            towerDurability: 45,
            towerDurabilityMax: 100,
            towerAttackerSettlementId: '0,0',
        } as Tile),
        { percent: 45 },
    );

    assert.deepEqual(
        getBuildingHealthBar({
            id: '3,0',
            q: 3,
            r: 0,
            towerDurability: 150,
            towerDurabilityMax: 300,
            towerCaptureProgress: 12,
        } as Tile),
        { percent: 50 },
    );

    assert.deepEqual(
        getBuildingHealthBar({
            id: '4,0',
            q: 4,
            r: 0,
            towerDurability: 100,
            towerDurabilityMax: 100,
            towerAttackerSettlementId: '0,0',
        } as Tile),
        { percent: 100 },
    );
});

test('getBuildingHealthBar skips full-health and non-combat tiles', () => {
    assert.equal(
        getBuildingHealthBar({
            id: '2,0',
            q: 2,
            r: 0,
            towerDurability: 100,
            towerDurabilityMax: 100,
        } as Tile),
        null,
    );

    assert.equal(
        getBuildingHealthBar({
            id: 'grass',
            q: 0,
            r: 0,
        } as Tile),
        null,
    );
});

test('OverlayRenderer draws building health bars for attacked structures', () => {
    const renderer = new OverlayRenderer();
    const underlayCtx = createMockContext();
    const topCtx = createMockContext();
    const surfaceContent = { overlayUnderlay: false, overlayTop: false };

    renderer.renderLayers(
        createContext(underlayCtx, topCtx),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 1000,
            movementNowMs: 1000,
            visibleTiles: [
                {
                    id: '2,0',
                    q: 2,
                    r: 0,
                    towerDurability: 45,
                    towerDurabilityMax: 100,
                    towerAttackerSettlementId: '0,0',
                } as Tile,
            ],
            surfaceContent,
        },
        {
            hoveredTile: null,
            taskMenuTile: null,
            pathCoords: [],
        },
        createDeps(),
    );

    assert.equal(surfaceContent.overlayTop, true);
    assert.equal(topCtx.calls.clearRect, 1);
    assert.ok(topCtx.calls.fillRect >= 2);
    assert.equal(topCtx.calls.strokeRect, 1);
});

test('OverlayRenderer skips empty overlay surfaces', () => {
    const renderer = new OverlayRenderer();
    const underlayCtx = createMockContext();
    const topCtx = createMockContext();
    const surfaceContent = { overlayUnderlay: true, overlayTop: true };

    renderer.renderLayers(
        createContext(underlayCtx, topCtx),
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 1000,
            movementNowMs: 1000,
            visibleTiles: [],
            surfaceContent,
        },
        {
            hoveredTile: null,
            taskMenuTile: null,
            pathCoords: [],
        },
        createDeps(),
    );

    assert.equal(surfaceContent.overlayUnderlay, false);
    assert.equal(surfaceContent.overlayTop, false);
    assert.equal(underlayCtx.calls.clearRect, 0);
    assert.equal(topCtx.calls.clearRect, 0);
});

test('OverlayRenderer clears stale underlay content once it becomes empty', () => {
    const renderer = new OverlayRenderer();
    const underlayCtx = createMockContext();
    const topCtx = createMockContext();
    const surfaceContent = { overlayUnderlay: false, overlayTop: true };
    const context = createContext(underlayCtx, topCtx);
    const frame = {
        cameraFx: {
            offsetX: 0,
            offsetY: 0,
            roll: 0,
            zoom: 1,
        },
        effectNowMs: 1000,
        movementNowMs: 1000,
        visibleTiles: [],
        surfaceContent,
    };

    renderer.renderLayers(
        context,
        frame,
        {
            hoveredTile: { id: 'hover', q: 0, r: 0 } as never,
            taskMenuTile: null,
            pathCoords: [],
        },
        createDeps(),
    );

    renderer.renderLayers(
        context,
        frame,
        {
            hoveredTile: null,
            taskMenuTile: null,
            pathCoords: [],
        },
        createDeps(),
    );

    assert.equal(surfaceContent.overlayUnderlay, false);
    assert.equal(underlayCtx.calls.clearRect, 2);
});

test('OverlayRenderer keeps task caches alive for same-frame depth highlights', () => {
    const renderer = new OverlayRenderer() as unknown as {
        prepareFrameCaches(frame: unknown): void;
        tileTaskCache: Map<string, unknown>;
        tileActivityCache: Map<string, unknown>;
    };
    const frame = {
        cameraFx: {
            offsetX: 0,
            offsetY: 0,
            roll: 0,
            zoom: 1,
        },
        effectNowMs: 1000,
        movementNowMs: 1000,
        visibleTiles: [],
    };

    renderer.prepareFrameCaches(frame);
    renderer.tileTaskCache.set('0,0', { incompleteTasks: [], leadingTask: null });
    renderer.tileActivityCache.set('0,0:1000', { leadingTask: null, scoutProgress: null });
    renderer.prepareFrameCaches(frame);

    assert.equal(renderer.tileTaskCache.size, 1);
    assert.equal(renderer.tileActivityCache.size, 1);

    renderer.prepareFrameCaches({ ...frame });

    assert.equal(renderer.tileTaskCache.size, 0);
    assert.equal(renderer.tileActivityCache.size, 0);
});

test('OverlayRenderer reuses unchanged static top overlay', () => {
    const renderer = new OverlayRenderer();
    const underlayCtx = createMockContext();
    const topCtx = createMockContext();
    let reachDraws = 0;
    const deps = {
        ...createDeps(),
        drawReachOutline: () => {
            reachDraws += 1;
        },
    };
    const context = createContext(underlayCtx, topCtx);
    const frame = {
        cameraFx: {
            offsetX: 0,
            offsetY: 0,
            roll: 0,
            zoom: 1,
        },
        effectNowMs: 1000,
        movementNowMs: 1000,
        visibleTiles: [],
        surfaceContent: { overlayUnderlay: false, overlayTop: false },
    };
    const opts = {
        hoveredTile: null,
        taskMenuTile: null,
        pathCoords: [],
        globalReachBoundary: [{ q: 0, r: 0 }],
        globalReachTileIds: new Set(['0,0']),
    };

    renderer.renderLayers(context, frame, opts, deps);
    renderer.renderLayers(context, { ...frame }, opts, deps);

    assert.equal(reachDraws, 1);
    assert.equal(topCtx.calls.clearRect, 1);
    assert.equal(frame.surfaceContent.overlayTop, true);
});

test('OverlayRenderer indexes scout progress by tile once per frame timestamp', () => {
    const originalHeroes = [...heroes];
    const renderer = new OverlayRenderer() as unknown as {
        getScoutScanProgressForTile(tile: { id: string }, nowMs: number): number | null;
        scoutProgressByNowMsCache: Map<number, Map<string, number>>;
    };

    heroes.splice(
        0,
        heroes.length,
        {
            id: 'scout-a',
            q: 0,
            r: 0,
            movement: null,
            scoutResourceIntent: {
                resourceType: 'wood',
                scanTileId: '0,0',
                scanStartedAt: 0,
                scanDurationMs: 1000,
            },
        } as never,
        {
            id: 'scout-b',
            q: 0,
            r: 0,
            movement: null,
            scoutResourceIntent: {
                resourceType: 'wood',
                scanTileId: '0,0',
                scanStartedAt: 250,
                scanDurationMs: 1000,
            },
        } as never,
    );

    try {
        assert.equal(renderer.getScoutScanProgressForTile({ id: '0,0' }, 500), 0.5);
        assert.equal(renderer.getScoutScanProgressForTile({ id: '1,0' }, 500), null);
        assert.equal(renderer.scoutProgressByNowMsCache.size, 1);
        assert.equal(renderer.getScoutScanProgressForTile({ id: '0,0' }, 500), 0.5);
        assert.equal(renderer.scoutProgressByNowMsCache.size, 1);
    } finally {
        heroes.splice(0, heroes.length, ...originalHeroes);
    }
});
