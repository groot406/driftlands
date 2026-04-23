import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import type { RenderPassContext, RenderSurface } from '../RenderPassContext';
import { CompositeRenderer } from './CompositeRenderer';

type MockCanvasContext = CanvasRenderingContext2D & {
    calls: Record<'clearRect' | 'drawImage', number>;
};

function createMockContext(): MockCanvasContext {
    const calls: Record<'clearRect' | 'drawImage', number> = {
        clearRect: 0,
        drawImage: 0,
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
            return undefined;
        },
        restore() {
            return undefined;
        },
        globalAlpha: 1,
        filter: 'none',
        imageSmoothingEnabled: false,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowBlur: 0,
        shadowColor: 'transparent',
    } as unknown as MockCanvasContext;
}

function createSurface(name: string): RenderSurface {
    return {
        canvas: { name, width: 640, height: 480 } as unknown as HTMLCanvasElement,
        ctx: createMockContext(),
    };
}

function createFrame() {
    return {
        finalCtx: createMockContext(),
        worldCtx: createMockContext(),
        worldCanvas: { width: 640, height: 480 } as HTMLCanvasElement,
        terrainSurface: createSurface('terrain'),
        overlayUnderlaySurface: createSurface('overlay-underlay'),
        entitySurface: createSurface('entity'),
        overlayTopSurface: createSurface('overlay-top'),
        particleUnderlaySurface: createSurface('particle-underlay'),
        particleOverlaySurface: createSurface('particle-overlay'),
        effectSurface: createSurface('effect'),
        cameraFx: {},
        effectNowMs: 0,
        quality: {
            enableMotionBlur: false,
            enableManualShadowComposite: false,
        },
    };
}

function createContext(): RenderPassContext {
    return {
        finalCtx: createMockContext(),
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

test('CompositeRenderer reuses the scratch world composite between effects and final composite', () => {
    const renderer = new CompositeRenderer<ReturnType<typeof createFrame>>();
    const frame = createFrame();
    const context = createContext();

    renderer.renderEffects(context, frame, {
        applyEffectPipeline: () => undefined,
    });
    renderer.compositeToFinal(frame);

    assert.equal(frame.worldCtx.calls.clearRect, 1);
    assert.equal(frame.worldCtx.calls.drawImage, 6);
    assert.equal(frame.finalCtx.calls.drawImage, 2);
});
