import assert from 'node:assert/strict';
import test from 'node:test';

import { camera } from '../../camera';
import type { Hero } from '../../types/Hero';
import { heroes } from '../../../store/heroStore';
import { HeroRenderer } from './HeroRenderer';

function createHero(id: string, q: number, r: number): Hero {
    return {
        id,
        name: id,
        avatar: id,
        q,
        r,
        stats: {
            xp: 0,
            hp: 1,
            atk: 1,
            spd: 1,
        },
        facing: 'down',
    };
}

test('HeroRenderer only builds hero layouts for camera-visible actors', () => {
    const previousHeroes = heroes.slice();
    const previousCamera = {
        q: camera.q,
        r: camera.r,
        radius: camera.radius,
    };

    heroes.splice(
        0,
        heroes.length,
        createHero('visible-a', 0, 0),
        createHero('visible-b', 0, 0),
        createHero('offscreen', 50, 50),
    );
    camera.q = 0;
    camera.r = 0;
    camera.radius = 6;

    const layoutInputs: string[][] = [];
    const renderer = new HeroRenderer();
    const ctx = {
        globalAlpha: 1,
    } as CanvasRenderingContext2D;

    try {
        renderer.drawHeroes(
            ctx,
            null,
            null,
            [],
            false,
            1000,
            {
                queueMissingHeroAssets: () => undefined,
                heroImagesLoaded: true,
                heroImages: {},
                toolImagesLoaded: false,
                toolImages: {},
                settlerImagesLoaded: false,
                settlerImages: {},
                heroLayouts: new Map(),
                setHeroLayouts: () => undefined,
                setSortedHeroes: () => undefined,
                setLastHeroFrame: () => undefined,
                computeTileHeroOffsets: (list) => {
                    layoutInputs.push(list.map((hero) => hero.id));
                    return Object.fromEntries(list.map((hero) => [hero.id, { x: 0, y: 0 }]));
                },
                getActorOpacity: () => 1,
                getHeroInterpolatedPixelPosition: (hero) => ({ x: hero.q, y: hero.r }),
                hasMovementStarted: () => false,
                isDustyWalkingTerrain: () => false,
                drawWalkingDust: () => undefined,
                drawHeroSelectionAura: () => undefined,
                getTileImageKey: () => null,
                heroFrameSize: 16,
                heroZoom: 2,
                heroShadowOpacity: 0,
                heroShadowWidthFactor: 1,
                heroShadowHeightFactor: 1,
                heroShadowYOffset: 1,
                currentRenderQuality: {
                    enableHeroAuras: false,
                },
                resourceIconMap: {},
                heroAnimStart: 0,
            },
        );
    } finally {
        heroes.splice(0, heroes.length, ...previousHeroes);
        camera.q = previousCamera.q;
        camera.r = previousCamera.r;
        camera.radius = previousCamera.radius;
    }

    assert.deepEqual(layoutInputs, [['visible-a', 'visible-b']]);
});
