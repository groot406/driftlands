import assert from 'node:assert/strict';
import test from 'node:test';

import { tileIndex } from '../../world';
import type { Tile } from '../../types/Tile';
import type { RenderPassContext } from '../RenderPassContext';
import { getBaseRenderQualityProfile } from '../RenderConfig';
import { TerrainChunkBuilder } from './TerrainChunkBuilder';
import { TerrainChunkCache } from './TerrainChunkCache';
import { TerrainRenderer } from './TerrainRenderer';

type MockCanvasContext = CanvasRenderingContext2D & {
    calls: Record<'clearRect' | 'drawImage' | 'restore' | 'save' | 'scale' | 'translate', number>;
};

function createMockContext(): MockCanvasContext {
    const calls: Record<'clearRect' | 'drawImage' | 'restore' | 'save' | 'scale' | 'translate', number> = {
        clearRect: 0,
        drawImage: 0,
        restore: 0,
        save: 0,
        scale: 0,
        translate: 0,
    };

    return {
        calls,
        clearRect() {
            calls.clearRect += 1;
        },
        drawImage() {
            calls.drawImage += 1;
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
        translate() {
            calls.translate += 1;
        },
        imageSmoothingEnabled: false,
    } as unknown as MockCanvasContext;
}

function createContext(ctx: MockCanvasContext, runtime: Record<string, unknown> = {}): RenderPassContext {
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
        terrainSurface: {
            canvas: { width: 640, height: 480 } as HTMLCanvasElement,
            ctx,
        },
        viewport,
        scene: {
            viewport,
            visibleTiles: [],
            visibleChunks: [
                {
                    key: '0,0',
                    chunkQ: 0,
                    chunkR: 0,
                    minQ: 0,
                    maxQ: 0,
                    minR: 0,
                    maxR: 0,
                    worldX: 0,
                    worldY: 0,
                    width: 66,
                    height: 66,
                },
            ],
            visibleEntities: [],
            overlays: [],
            particles: [],
            debug: {
                visibleTileCount: 0,
                visibleEntityCount: 0,
                overlayCount: 0,
                visibleChunkCount: 1,
                dirtyChunkCount: 0,
                selectedHeroId: null,
            },
            frameInfo: {
                effectNowMs: 0,
                movementNowMs: 0,
                perfNowMs: 0,
                worldRenderVersion: 1,
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
        runtime,
        passTimingsMs: {},
    };
}

test('TerrainRenderer reuses unchanged static terrain surface', () => {
    const ctx = createMockContext();
    const runtime: Record<string, unknown> = {};
    let rebuilds = 0;
    const renderer = new TerrainRenderer({
        cache: new TerrainChunkCache(() => ({ width: 0, height: 0 } as HTMLCanvasElement)),
        builder: {
            rebuild: () => {
                rebuilds += 1;
            },
        } as unknown as TerrainChunkBuilder,
    });

    renderer.render(createContext(ctx, runtime));
    renderer.render(createContext(ctx, runtime));

    assert.equal(rebuilds, 1);
    assert.equal(ctx.calls.clearRect, 1);
    assert.equal(ctx.calls.drawImage, 1);
    assert.equal((runtime.terrainMetrics as { terrainSurfaceReused?: boolean }).terrainSurfaceReused, true);
});

test('TerrainRenderer redraws when visible animated terrain is present', () => {
    const ctx = createMockContext();
    const tileId = '9991,9991';
    const previousTile = tileIndex[tileId];
    const animatedTile = {
        id: tileId,
        q: 9991,
        r: 9991,
        biome: null,
        terrain: 'water',
        discovered: true,
        isBaseTile: true,
    } as Tile;
    tileIndex[tileId] = animatedTile;

    try {
        const renderer = new TerrainRenderer({
            cache: new TerrainChunkCache(() => ({ width: 0, height: 0 } as HTMLCanvasElement)),
            builder: {
                rebuild: () => undefined,
            } as unknown as TerrainChunkBuilder,
            shouldDrawAnimatedTile: (tile) => tile.id === tileId,
            drawAnimatedTile: () => undefined,
        });
        const runtime: Record<string, unknown> = {};
        const context = createContext(ctx, runtime);
        context.scene.visibleTiles = [
            {
                tileId,
                q: 9991,
                r: 9991,
                worldX: 0,
                worldY: 0,
                terrainType: 'water',
                variantKey: null,
                activationState: null,
                supportBand: null,
                flags: {
                    discovered: true,
                    hasVariant: false,
                    inReach: false,
                    hasTileOverlay: false,
                    hasBuildingOverlay: false,
                },
            },
        ];

        renderer.render(context);
        renderer.render(context);

        assert.equal(ctx.calls.clearRect, 2);
        assert.equal((runtime.terrainMetrics as { terrainSurfaceReused?: boolean }).terrainSurfaceReused, false);
    } finally {
        if (previousTile) {
            tileIndex[tileId] = previousTile;
        } else {
            delete tileIndex[tileId];
        }
    }
});

