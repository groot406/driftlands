import assert from 'node:assert/strict';
import test from 'node:test';

import { camera } from '../../camera';
import type { Hero } from '../../types/Hero';
import type { Settler } from '../../types/Settler';
import { heroes } from '../../../store/heroStore';
import { settlers } from '../../../store/settlerStore';
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

function createSettler(overrides: Partial<Settler> = {}): Settler {
    return {
        id: 'settler-test',
        q: 0,
        r: 0,
        facing: 'down',
        appearanceSeed: 1,
        homeTileId: '0,0',
        homeAccessTileId: '0,0',
        settlementId: '0,0',
        assignedWorkTileId: null,
        assignedRole: null,
        workTileId: null,
        hiddenWhileWorking: null,
        activity: 'idle',
        stateSinceMs: 0,
        hungerMs: 0,
        fatigueMs: 0,
        happiness: 100,
        workProgressMs: 0,
        carryingKind: null,
        ...overrides,
    };
}

function createCanvasContext() {
    const calls = {
        drawImage: 0,
    };

    return {
        calls,
        ctx: {
            globalAlpha: 1,
            imageSmoothingEnabled: false,
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: 'left',
            textBaseline: 'alphabetic',
            save() {},
            restore() {},
            beginPath() {},
            ellipse() {},
            fill() {},
            stroke() {},
            roundRect() {},
            fillText() {},
            fillRect() {},
            measureText(text: string) {
                return { width: text.length * 6 };
            },
            translate() {},
            scale() {},
            drawImage() {
                calls.drawImage += 1;
            },
        } as unknown as CanvasRenderingContext2D,
    };
}

function createHeroRendererDependencies(overrides: Partial<Parameters<HeroRenderer['drawHeroes']>[6]> = {}): Parameters<HeroRenderer['drawHeroes']>[6] {
    return {
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
        computeTileHeroOffsets: (list) => Object.fromEntries(list.map((hero) => [hero.id, { x: 0, y: 0 }])),
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
        ...overrides,
    };
}

test('HeroRenderer only builds hero layouts for camera-visible actors', () => {
    const previousHeroes = heroes.slice();
    const previousSettlers = settlers.slice();
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
            createHeroRendererDependencies({
                computeTileHeroOffsets: (list) => {
                    layoutInputs.push(list.map((hero) => hero.id));
                    return Object.fromEntries(list.map((hero) => [hero.id, { x: 0, y: 0 }]));
                },
            }),
        );
    } finally {
        heroes.splice(0, heroes.length, ...previousHeroes);
        settlers.splice(0, settlers.length, ...previousSettlers);
        camera.q = previousCamera.q;
        camera.r = previousCamera.r;
        camera.radius = previousCamera.radius;
    }

    assert.deepEqual(layoutInputs, [['visible-a', 'visible-b']]);
});

test('HeroRenderer keeps moving settlers visible by their interpolated position', () => {
    const previousHeroes = heroes.slice();
    const previousSettlers = settlers.slice();
    const previousCamera = {
        q: camera.q,
        r: camera.r,
        radius: camera.radius,
    };

    heroes.splice(0, heroes.length);
    settlers.splice(
        0,
        settlers.length,
        createSettler({
            id: 'raider',
            q: -50,
            r: -50,
            activity: 'commuting_work',
            movement: {
                origin: { q: -50, r: -50 },
                path: [{ q: 0, r: 0 }],
                target: { q: 0, r: 0 },
                startMs: 0,
                stepDurations: [1_000],
                cumulative: [1_000],
                authoritative: true,
            },
        }),
    );
    camera.q = 0;
    camera.r = 0;
    camera.radius = 6;

    const renderer = new HeroRenderer();
    const { ctx, calls } = createCanvasContext();

    try {
        renderer.drawHeroes(
            ctx,
            null,
            null,
            [],
            false,
            1_000,
            createHeroRendererDependencies({
                settlerImagesLoaded: true,
                settlerImages: {
                    default: {} as HTMLImageElement,
                },
            }),
        );
    } finally {
        heroes.splice(0, heroes.length, ...previousHeroes);
        settlers.splice(0, settlers.length, ...previousSettlers);
        camera.q = previousCamera.q;
        camera.r = previousCamera.r;
        camera.radius = previousCamera.radius;
    }

    assert.equal(calls.drawImage, 1);
});
