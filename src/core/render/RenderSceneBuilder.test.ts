import assert from 'node:assert/strict';
import test from 'node:test';

import { getBaseRenderQualityProfile } from './RenderConfig';
import { RenderSceneBuilder } from './RenderSceneBuilder';

test('RenderSceneBuilder creates visible tile, entity, and overlay DTOs', () => {
    const builder = new RenderSceneBuilder();
    const scene = builder.build({
        viewport: {
            width: 640,
            height: 480,
            dpr: 1,
            cameraX: 0,
            cameraY: 0,
            cameraQ: 0,
            cameraR: 0,
            radius: 16,
            innerRadius: 5,
            zoom: 1,
            roll: 0,
            offsetX: 0,
            offsetY: 0,
        },
        quality: getBaseRenderQualityProfile(0),
        stressTier: 0,
        drawOptions: {
            hoveredTile: { id: '0,0', q: 0, r: 0, discovered: true },
            hoveredHero: { id: 'hero-1' },
            taskMenuTile: { id: '1,0', q: 1, r: 0 },
            pathCoords: [{ q: 1, r: 0 }],
            clusterBoundaryTiles: [{ q: 1, r: 0 }],
            globalReachBoundary: [{ q: 0, r: 0 }],
            globalReachTileIds: new Set(['0,0']),
            showSupportOverlay: true,
            hoveredTileInReach: true,
        },
        frameTimes: {
            effectNowMs: 1,
            movementNowMs: 2,
            perfNowMs: 3,
        },
        cameraMoving: false,
        candidateTiles: [
            { id: '0,0', q: 0, r: 0, terrain: 'plains', discovered: true },
            { id: '30,30', q: 30, r: 30, terrain: 'plains', discovered: true },
        ],
        candidateHeroes: [
            {
                id: 'hero-1',
                name: 'Iris',
                avatar: 'hero',
                q: 0,
                r: 0,
                stats: { xp: 1, hp: 10, atk: 1, spd: 1 },
                facing: 'down',
            },
        ],
        worldRenderVersion: 7,
    });

    assert.equal(scene.visibleTiles.length, 1);
    assert.equal(scene.visibleTiles[0]?.tileId, '0,0');
    assert.equal(scene.visibleChunks.length, 1);
    assert.equal(scene.visibleChunks[0]?.key, '0,0');
    assert.equal(scene.visibleEntities.length, 1);
    assert.equal(scene.visibleEntities[0]?.entityId, 'hero-1');
    assert.ok(scene.overlays.length >= 4);
    assert.equal(scene.frameInfo.worldRenderVersion, 7);
});
