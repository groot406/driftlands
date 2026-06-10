import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import type { RenderPassContext, RenderSurface } from '../RenderPassContext';
import type { RenderQualityProfile, TerrainTileRenderItem } from '../RenderTypes';
import { CloudShadowEffect } from './CloudShadowEffect';

type MockCanvasContext = CanvasRenderingContext2D & {
    fillRects: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        alpha: number;
        filter: string;
        compositeOperation: string;
    }>;
    clipCount: number;
    compositeOperations: string[];
    patternRequests: number;
};

function createMockContext(): MockCanvasContext {
    const fillRects: MockCanvasContext['fillRects'] = [];
    const compositeOperations: string[] = [];
    let globalAlpha = 1;
    let globalCompositeOperation: GlobalCompositeOperation = 'source-over';
    let imageSmoothingEnabled = true;
    let filter = 'none';
    let fillStyle: string | CanvasGradient | CanvasPattern = '';

    const ctx = {
        fillRects,
        clipCount: 0,
        compositeOperations,
        patternRequests: 0,
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
            ctx.clipCount += 1;
            return undefined;
        },
        fillRect(x: number, y: number, width: number, height: number) {
            fillRects.push({
                x,
                y,
                width,
                height,
                alpha: globalAlpha,
                filter,
                compositeOperation: globalCompositeOperation,
            });
        },
        createPattern() {
            ctx.patternRequests += 1;
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
        get globalAlpha() {
            return globalAlpha;
        },
        set globalAlpha(value: number) {
            globalAlpha = value;
        },
        get globalCompositeOperation() {
            return globalCompositeOperation;
        },
        set globalCompositeOperation(value: GlobalCompositeOperation) {
            globalCompositeOperation = value;
            compositeOperations.push(value);
        },
        get imageSmoothingEnabled() {
            return imageSmoothingEnabled;
        },
        set imageSmoothingEnabled(value: boolean) {
            imageSmoothingEnabled = value;
        },
        get filter() {
            return filter;
        },
        set filter(value: string) {
            filter = value;
        },
        get fillStyle() {
            return fillStyle;
        },
        set fillStyle(value: string | CanvasGradient | CanvasPattern) {
            fillStyle = value;
        },
    } as unknown as MockCanvasContext;

    return ctx;
}

function createCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
    return {
        width: 0,
        height: 0,
        getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
}

function createTile(overrides: Partial<TerrainTileRenderItem> = {}): TerrainTileRenderItem {
    const { flags: flagOverrides, ...tileOverrides } = overrides;

    return {
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
            ...flagOverrides,
        },
        ...tileOverrides,
    };
}

function createContext(
    effectSurface: RenderSurface,
    options: {
        quality?: RenderQualityProfile;
        visibleTiles?: TerrainTileRenderItem[];
        effectNowMs?: number;
    } = {},
): RenderPassContext {
    const quality = options.quality ?? getBaseRenderQualityProfile(0);
    const visibleTiles = options.visibleTiles ?? [createTile()];
    const effectNowMs = options.effectNowMs ?? 1000;

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
            visibleTiles,
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
                effectNowMs,
                movementNowMs: effectNowMs,
                perfNowMs: effectNowMs,
                worldRenderVersion: 1,
                stressTier: 0,
                cameraMoving: false,
                qualityName: quality.name,
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

function installMockDocument(textureCtx: CanvasRenderingContext2D) {
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            createElement: () => createCanvas(textureCtx),
        },
    });

    return () => {
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: previousDocument,
        });
    };
}

function createEffect() {
    return new CloudShadowEffect({
        getDpr: () => 1,
        getCanvasCenter: () => ({ cx: 640, cy: 360 }),
        getCameraFx: () => ({ offsetX: 0, offsetY: 0, roll: 0, zoom: 1 }),
    });
}

function createCloudEnabledLowQuality() {
    return {
        ...getBaseRenderQualityProfile(2),
        enableClouds: true,
        cloudsEnabled: true,
    };
}

test('CloudShadowEffect draws camera-relative cloud fields for far world coordinates', () => {
    const textureCtx = createMockContext();
    const restoreDocument = installMockDocument(textureCtx);

    try {
        const effectCtx = createMockContext();
        const effect = createEffect();

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
        restoreDocument();
    }
});

test('CloudShadowEffect draws richer high quality cloud layers than low quality', () => {
    const textureCtx = createMockContext();
    const restoreDocument = installMockDocument(textureCtx);

    try {
        const highCtx = createMockContext();
        const lowCtx = createMockContext();
        const highEffect = createEffect();
        const lowEffect = createEffect();

        highEffect.apply(createContext({
            canvas: createCanvas(highCtx),
            ctx: highCtx,
        }, {
            quality: getBaseRenderQualityProfile(0),
            effectNowMs: 1000,
        }));
        lowEffect.apply(createContext({
            canvas: createCanvas(lowCtx),
            ctx: lowCtx,
        }, {
            quality: createCloudEnabledLowQuality(),
            effectNowMs: 1000,
        }));
        highCtx.fillRects.length = 0;
        lowCtx.fillRects.length = 0;

        highEffect.apply(createContext({
            canvas: createCanvas(highCtx),
            ctx: highCtx,
        }, {
            quality: getBaseRenderQualityProfile(0),
            effectNowMs: 46_000,
        }));
        lowEffect.apply(createContext({
            canvas: createCanvas(lowCtx),
            ctx: lowCtx,
        }, {
            quality: createCloudEnabledLowQuality(),
            effectNowMs: 46_000,
        }));

        assert.ok(lowCtx.fillRects.length > 0);
        assert.ok(
            highCtx.fillRects.length >= lowCtx.fillRects.length + 4,
            `expected high quality to draw at least two extra morphing detail layer pairs; high=${highCtx.fillRects.length}, low=${lowCtx.fillRects.length}`,
        );
    } finally {
        restoreDocument();
    }
});

test('CloudShadowEffect no-ops when no discovered tiles are visible', () => {
    const textureCtx = createMockContext();
    const restoreDocument = installMockDocument(textureCtx);

    try {
        const effectCtx = createMockContext();
        const effect = createEffect();

        effect.apply(createContext({
            canvas: createCanvas(effectCtx),
            ctx: effectCtx,
        }, {
            visibleTiles: [createTile({
                flags: {
                    discovered: false,
                    hasVariant: false,
                    inReach: false,
                    hasTileOverlay: false,
                    hasBuildingOverlay: false,
                },
            })],
        }));

        assert.equal(effectCtx.fillRects.length, 0);
        assert.equal(effectCtx.clipCount, 0);
        assert.equal(textureCtx.patternRequests, 0);
    } finally {
        restoreDocument();
    }
});

test('CloudShadowEffect is gated by enableClouds and cloudsEnabled', () => {
    const textureCtx = createMockContext();
    const restoreDocument = installMockDocument(textureCtx);

    try {
        for (const quality of [
            { ...getBaseRenderQualityProfile(0), enableClouds: false, cloudsEnabled: true },
            { ...getBaseRenderQualityProfile(0), enableClouds: true, cloudsEnabled: false },
        ]) {
            const effectCtx = createMockContext();
            const effect = createEffect();

            effect.apply(createContext({
                canvas: createCanvas(effectCtx),
                ctx: effectCtx,
            }, {
                quality,
            }));

            assert.equal(effectCtx.fillRects.length, 0);
            assert.equal(effectCtx.clipCount, 0);
        }
    } finally {
        restoreDocument();
    }
});

test('CloudShadowEffect keeps cloud-only composition source-over and clipped', () => {
    const textureCtx = createMockContext();
    const restoreDocument = installMockDocument(textureCtx);

    try {
        const effectCtx = createMockContext();
        const effect = createEffect();

        effect.apply(createContext({
            canvas: createCanvas(effectCtx),
            ctx: effectCtx,
        }));

        assert.ok(effectCtx.fillRects.length > 0);
        assert.equal(effectCtx.clipCount, 1);
        assert.ok(effectCtx.compositeOperations.includes('source-over'));
        assert.ok(effectCtx.fillRects.every((rect) => rect.compositeOperation === 'source-over'));
    } finally {
        restoreDocument();
    }
});
