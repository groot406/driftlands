import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from '../RenderConfig';
import type { RenderQualityProfile, ViewportSnapshot } from '../RenderTypes';
import { BackdropRenderer } from './BackdropRenderer';

type CallName =
    | 'arc'
    | 'beginPath'
    | 'createLinearGradient'
    | 'createRadialGradient'
    | 'fill'
    | 'fillRect'
    | 'restore'
    | 'save';

type MockCanvasGradient = CanvasGradient & {
    stops: Array<{ offset: number; color: string }>;
};

type MockCanvasContext = CanvasRenderingContext2D & {
    calls: Record<CallName, number>;
};

interface TestTile {
    q: number;
    r: number;
    discovered: boolean;
    terrain: string | null;
}

interface TestCameraFx {
    vignetteBiasX: number;
    vignetteBiasY: number;
}

function createMockGradient(): MockCanvasGradient {
    return {
        stops: [],
        addColorStop(offset: number, color: string) {
            this.stops.push({ offset, color });
        },
    } as MockCanvasGradient;
}

function createMockContext(): MockCanvasContext {
    const calls: Record<CallName, number> = {
        arc: 0,
        beginPath: 0,
        createLinearGradient: 0,
        createRadialGradient: 0,
        fill: 0,
        fillRect: 0,
        restore: 0,
        save: 0,
    };

    return {
        calls,
        createLinearGradient() {
            calls.createLinearGradient += 1;
            return createMockGradient();
        },
        createRadialGradient() {
            calls.createRadialGradient += 1;
            return createMockGradient();
        },
        fillRect() {
            calls.fillRect += 1;
        },
        save() {
            calls.save += 1;
        },
        restore() {
            calls.restore += 1;
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
        fillStyle: '#000',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
    } as unknown as MockCanvasContext;
}

function createViewport(overrides: Partial<ViewportSnapshot> = {}): ViewportSnapshot {
    return {
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
        ...overrides,
    };
}

function tile(q: number, r: number, terrain: string, discovered = true): TestTile {
    return { q, r, terrain, discovered };
}

function createFrame(options: {
    visibleTiles?: readonly TestTile[];
    quality?: RenderQualityProfile;
    viewport?: Partial<ViewportSnapshot>;
    cameraFx?: Partial<TestCameraFx>;
} = {}) {
    return {
        finalCtx: createMockContext(),
        visibleTiles: options.visibleTiles ?? [],
        effectNowMs: 1200,
        cameraFx: {
            vignetteBiasX: 0,
            vignetteBiasY: 0,
            ...options.cameraFx,
        },
        quality: options.quality ?? getBaseRenderQualityProfile(0),
        viewport: createViewport(options.viewport),
    };
}

function totalDrawingCalls(ctx: MockCanvasContext) {
    return Object.values(ctx.calls).reduce((total, count) => total + count, 0);
}

test('BackdropRenderer draws a neutral layered backdrop when no discovered tiles are visible', () => {
    const renderer = new BackdropRenderer<TestTile, TestCameraFx>();
    const frame = createFrame({
        visibleTiles: [
            tile(0, 0, 'forest', false),
            tile(1, 0, 'water', false),
        ],
    });

    renderer.render(frame);

    assert.ok(frame.finalCtx.calls.createLinearGradient >= 1);
    assert.ok(frame.finalCtx.calls.fillRect >= 2);
    assert.ok(frame.finalCtx.calls.save >= 1);
    assert.ok(frame.finalCtx.calls.restore >= 1);
});

test('BackdropRenderer renders richer radial glow work in high quality than low quality', () => {
    const visibleTiles = [
        tile(0, 0, 'forest'),
        tile(1, 0, 'water'),
        tile(2, -1, 'vulcano'),
    ];
    const renderer = new BackdropRenderer<TestTile, TestCameraFx>();
    const highFrame = createFrame({
        visibleTiles,
        quality: getBaseRenderQualityProfile(0),
    });
    const lowFrame = createFrame({
        visibleTiles,
        quality: getBaseRenderQualityProfile(2),
    });

    renderer.render(lowFrame);
    renderer.render(highFrame);

    assert.ok(highFrame.finalCtx.calls.createRadialGradient > lowFrame.finalCtx.calls.createRadialGradient);
    assert.ok(highFrame.finalCtx.calls.arc > lowFrame.finalCtx.calls.arc);
});

test('BackdropRenderer skips drawing when canvas dimensions are invalid', () => {
    const renderer = new BackdropRenderer<TestTile, TestCameraFx>();
    const frame = createFrame({
        visibleTiles: [tile(0, 0, 'forest')],
        viewport: { width: 0 },
    });

    renderer.render(frame);

    assert.equal(totalDrawingCalls(frame.finalCtx), 0);
});
