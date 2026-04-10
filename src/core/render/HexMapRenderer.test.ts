import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from './RenderConfig';
import { HexMapRenderer } from './HexMapRenderer';
import type { RenderPassContext } from './RenderPassContext';

test('HexMapRenderer executes passes in order and records timings', () => {
    const calls: string[] = [];
    const renderer = new HexMapRenderer([
        {
            name: 'FirstPass',
            isEnabled: () => true,
            execute: () => {
                calls.push('first');
            },
        },
        {
            name: 'SecondPass',
            isEnabled: () => true,
            execute: () => {
                calls.push('second');
            },
        },
    ]);

    const passTimingsMs: Record<string, number> = {};
    const context: RenderPassContext = {
        finalCtx: {} as CanvasRenderingContext2D,
        viewport: {
            width: 10,
            height: 10,
            dpr: 1,
            cameraX: 0,
            cameraY: 0,
            cameraQ: 0,
            cameraR: 0,
            radius: 1,
            innerRadius: 1,
            zoom: 1,
            roll: 0,
            offsetX: 0,
            offsetY: 0,
        },
        scene: {
            viewport: {
                width: 10,
                height: 10,
                dpr: 1,
                cameraX: 0,
                cameraY: 0,
                cameraQ: 0,
                cameraR: 0,
                radius: 1,
                innerRadius: 1,
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
        passTimingsMs,
    };

    renderer.render(context);

    assert.deepEqual(calls, ['first', 'second']);
    assert.ok((passTimingsMs.FirstPass ?? -1) >= 0);
    assert.ok((passTimingsMs.SecondPass ?? -1) >= 0);
});
