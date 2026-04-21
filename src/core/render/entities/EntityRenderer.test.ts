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

function createRenderPassContext(ctx: CanvasRenderingContext2D): RenderPassContext {
    return {
        finalCtx: {} as CanvasRenderingContext2D,
        entitySurface: {
            canvas: { width: 640, height: 480 } as HTMLCanvasElement,
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

function createDependencies(capturedOverlayCounts: number[]) {
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
        drawUndiscoveredTile: () => undefined,
        getTileOverlayKey: () => 'grain_overhang',
        getTileOverlayOffset: () => ({ x: 0, y: 0 }),
        getBuildingOverlayKey: () => null,
        getBuildingOverlayOffset: () => ({ x: 0, y: 0 }),
        getTileImageKey: () => 'grain-v2',
        buildShadedTileOverlayCanvas: () => null,
        images: {
            grain_overhang: {
                naturalWidth: 64,
                naturalHeight: 64,
                width: 64,
                height: 64,
            } as HTMLImageElement,
        },
        heroRenderer: {
            drawHeroes: (
                _ctx: CanvasRenderingContext2D,
                _hoveredHero: null,
                _hoveredSettler: null,
                overlayRecords: ReadonlyArray<unknown>,
            ) => {
                capturedOverlayCounts.push(overlayRecords.length);
            },
        },
        heroRenderDependencies: {},
    };
}

test('EntityRenderer keeps inactive terrain overlays inside the tile composite path', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const capturedOverlayCounts: number[] = [];

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
        },
        createDependencies(capturedOverlayCounts) as any,
    );

    assert.deepEqual(capturedOverlayCounts, [0]);
});

test('EntityRenderer still defers active terrain overlays for hero layering', () => {
    const renderer = new EntityRenderer();
    const ctx = createMockContext();
    const capturedOverlayCounts: number[] = [];

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
        },
        createDependencies(capturedOverlayCounts) as any,
    );

    assert.deepEqual(capturedOverlayCounts, [1]);
});
