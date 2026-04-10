import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import { ParticleRenderer } from './ParticleRenderer';
import type { RenderPassContext } from '../RenderPassContext';

type MockCanvasContext = CanvasRenderingContext2D & {
    calls: Record<string, number>;
};

function createMockContext(): MockCanvasContext {
    const calls: Record<string, number> = {
        arc: 0,
        beginPath: 0,
        clearRect: 0,
        fill: 0,
        moveTo: 0,
        quadraticCurveTo: 0,
        restore: 0,
        save: 0,
        scale: 0,
        stroke: 0,
    };

    const gradient = {
        addColorStop() {
            return undefined;
        },
    } as CanvasGradient;

    const ctx = {
        calls,
        clearRect() {
            calls.clearRect += 1;
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
        beginPath() {
            calls.beginPath += 1;
        },
        arc() {
            calls.arc += 1;
        },
        fill() {
            calls.fill += 1;
        },
        stroke() {
            calls.stroke += 1;
        },
        moveTo() {
            calls.moveTo += 1;
        },
        quadraticCurveTo() {
            calls.quadraticCurveTo += 1;
        },
        translate() {
            return undefined;
        },
        rotate() {
            return undefined;
        },
        fillRect() {
            return undefined;
        },
        ellipse() {
            return undefined;
        },
        createRadialGradient() {
            return gradient;
        },
        imageSmoothingEnabled: true,
        globalCompositeOperation: 'source-over',
        lineCap: 'butt',
        lineJoin: 'miter',
        lineWidth: 1,
        strokeStyle: '',
        fillStyle: '',
    } as unknown as MockCanvasContext;

    return ctx;
}

test('ParticleRenderer renders underlay and overlay particles to separate surfaces', () => {
    const renderer = new ParticleRenderer();
    const underlayCtx = createMockContext();
    const overlayCtx = createMockContext();
    const underlayCanvas = { width: 640, height: 480 } as HTMLCanvasElement;
    const overlayCanvas = { width: 640, height: 480 } as HTMLCanvasElement;
    let updateCalls = 0;
    let lastParticleUpdateMs = 1000;

    const context: RenderPassContext = {
        finalCtx: {} as CanvasRenderingContext2D,
        particleUnderlaySurface: {
            canvas: underlayCanvas,
            ctx: underlayCtx,
        },
        particleOverlaySurface: {
            canvas: overlayCanvas,
            ctx: overlayCtx,
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

    renderer.renderWorldLayer(
        context,
        {
            cameraFx: {
                offsetX: 0,
                offsetY: 0,
                roll: 0,
                zoom: 1,
            },
            effectNowMs: 1040,
            visibleTiles: [],
        },
        {
            canvas: { width: 640, height: 480 } as HTMLCanvasElement,
            dpr: 1,
            getCanvasCenter: () => ({ cx: 320, cy: 240 }),
            applyWorldTransform: () => undefined,
            projectWorldToScreenPixels: (worldX, worldY) => ({ x: worldX, y: worldY }),
            getParticleEdgeFade: () => 1,
            toRgba: (_color, alpha) => `rgba(0, 0, 0, ${alpha})`,
            resetParticles: () => undefined,
            updateParticles: () => {
                updateCalls += 1;
            },
            spawnGameplayBursts: () => undefined,
            spawnAmbientParticles: () => undefined,
            spawnTaskParticles: () => undefined,
            spawnHeroTrailParticles: () => undefined,
            getParticles: () => [
                {
                    x: 160,
                    y: 120,
                    vx: 0,
                    vy: 0,
                    size: 3,
                    bornMs: 1000,
                    lifeMs: 1000,
                    alpha: 0.4,
                    glow: 0,
                    color: [255, 255, 255] as const,
                    twinkle: 0,
                    shape: 'ring' as const,
                    layer: 'underlay' as const,
                    growth: 4,
                },
                {
                    x: 240,
                    y: 160,
                    vx: 64,
                    vy: -2,
                    size: 8,
                    bornMs: 1000,
                    lifeMs: 2000,
                    alpha: 0.35,
                    glow: 0,
                    color: [64, 56, 48] as const,
                    twinkle: 120,
                    shape: 'bird' as const,
                    layer: 'overlay' as const,
                },
            ],
            getLastParticleUpdateMs: () => lastParticleUpdateMs,
            setLastParticleUpdateMs: (now) => {
                lastParticleUpdateMs = now;
            },
        },
    );

    assert.equal(updateCalls, 1);
    assert.equal(lastParticleUpdateMs, 1040);
    assert.equal(underlayCtx.calls.clearRect, 1);
    assert.equal(overlayCtx.calls.clearRect, 1);
    assert.ok(underlayCtx.calls.arc > 0);
    assert.equal(underlayCtx.calls.quadraticCurveTo, 0);
    assert.ok(overlayCtx.calls.quadraticCurveTo > 0);
});
