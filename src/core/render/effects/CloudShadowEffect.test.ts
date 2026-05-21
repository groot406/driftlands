import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import type { RenderPassContext, RenderSurface } from '../RenderPassContext';
import { CloudShadowEffect } from './CloudShadowEffect';

type MockCanvasContext = CanvasRenderingContext2D & {
    fillRects: Array<{ x: number; y: number; width: number; height: number }>;
};

function createMockContext(): MockCanvasContext {
    const fillRects: Array<{ x: number; y: number; width: number; height: number }> = [];

    return {
        fillRects,
        save() {
            return undefined;
        },
        restore() {
            return undefined;
        },
        scale() {
            return undefined;
        },
        translate() {
            return undefined;
        },
        rotate() {
            return undefined;
        },
        beginPath() {
            return undefined;
        },
        moveTo() {
            return undefined;
        },
        lineTo() {
            return undefined;
        },
        closePath() {
            return undefined;
        },
        clip() {
            return undefined;
        },
        fillRect(x: number, y: number, width: number, height: number) {
            fillRects.push({ x, y, width, height });
        },
        createPattern() {
            return {} as CanvasPattern;
        },
        createImageData(width: number, height: number) {
            return {
                width,
                height,
                data: new Uint8ClampedArray(width * height * 4),
                colorSpace: 'srgb',
            } as ImageData;
        },
        putImageData() {
            return undefined;
        },
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true,
        filter: 'none',
        fillStyle: '',
    } as unknown as MockCanvasContext;
}

function createCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
    return {
        width: 0,
        height: 0,
        getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
}

function createContext(effectSurface: RenderSurface): RenderPassContext {
    const quality = getBaseRenderQualityProfile(0);

    return {
        finalCtx: createMockContext(),
        effectSurface,
        viewport: {
            width: 1280,
            height: 720,
            dpr: 1,
            cameraX: 1_250_000,
            cameraY: -870_000,
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
                width: 1280,
                height: 720,
                dpr: 1,
                cameraX: 1_250_000,
                cameraY: -870_000,
                cameraQ: 0,
                cameraR: 0,
                radius: 10,
                innerRadius: 5,
                zoom: 1,
                roll: 0,
                offsetX: 0,
                offsetY: 0,
            },
            visibleTiles: [
                {
                    tileId: 'far-tile',
                    q: 0,
                    r: 0,
                    worldX: 1_250_024,
                    worldY: -869_982,
                    terrainType: 'plains',
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
            ],
            visibleChunks: [],
            visibleEntities: [],
            overlays: [],
            particles: [],
            debug: {
                visibleTileCount: 1,
                visibleEntityCount: 0,
                overlayCount: 0,
                visibleChunkCount: 0,
                dirtyChunkCount: 0,
                selectedHeroId: null,
            },
            frameInfo: {
                effectNowMs: 1000,
                movementNowMs: 1000,
                perfNowMs: 1000,
                worldRenderVersion: 1,
                stressTier: 0,
                cameraMoving: false,
                qualityName: 'high',
            },
        },
        quality,
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

test('CloudShadowEffect draws camera-relative cloud fields for far world coordinates', () => {
    const previousDocument = globalThis.document;
    const textureCtx = createMockContext();
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            createElement: () => createCanvas(textureCtx),
        },
    });

    try {
        const effectCtx = createMockContext();
        const effect = new CloudShadowEffect({
            getDpr: () => 1,
            getCanvasCenter: () => ({ cx: 640, cy: 360 }),
            getCameraFx: () => ({ offsetX: 0, offsetY: 0, roll: 0, zoom: 1 }),
        });

        effect.apply(createContext({
            canvas: createCanvas(effectCtx),
            ctx: effectCtx,
        }));

        assert.ok(effectCtx.fillRects.length > 0);
        for (const rect of effectCtx.fillRects) {
            assert.ok(Math.abs(rect.x) < 5000);
            assert.ok(Math.abs(rect.y) < 5000);
            assert.ok(rect.width > 0);
            assert.ok(rect.height > 0);
        }
    } finally {
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: previousDocument,
        });
    }
});
