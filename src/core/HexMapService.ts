import {
    axialKey,
    consumePendingRenderDirtyTiles,
    getTilesInRadius,
    getWorldRenderVersion,
    tileIndex,
} from './world';
import {
    animateCamera,
    axialToPixel,
    camera,
    isCameraMoving,
    hexDistance,
    nudgeCameraTowards,
    pixelToAxial,
    stopCameraAnimation,
    updateCameraRadius,
    centerCamera,
    moveCamera
} from './camera';
import {heroes} from '../store/heroStore';
import { settlers } from '../store/settlerStore';
import {TERRAIN_DEFS} from './terrainDefs';
import { selectedHeroId } from '../store/uiStore';
import {heroAnimationSet, heroAnimName, resolveActivity, shouldFlip} from './heroSprite';
import {taskStore} from '../store/taskStore';
import { worldOuterRadius } from './world';
import {getTextIndicators} from "./textIndicators.ts";
import type { PathCoord } from './PathService';
import { OPPOSITE_SIDE, SIDE_NAMES, type Tile, type TileSide } from "./types/Tile.ts";
import type {Hero} from "./types/Hero.ts";
import type { Settler } from "./types/Settler.ts";
import type {ResourceType} from "./types/Resource.ts";
import type {TaskInstance} from "./types/Task.ts";
import {getDecorativeSelectionForTile} from './tileVisuals';
import {
    getEffectiveParticleBudget,
    graphicsStore,
    shouldUseParticleGlowPass,
} from '../store/graphicsStore';
import { updateRenderDebugState } from '../store/renderDebugStore';
import { resolveRenderFeatureEnabled } from '../store/renderFeatureStore';
import { getStorageFreeCapacity, getStorageUsedCapacity, storageInventories } from '../store/resourceStore';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry';
import { canUseWarehouseAtTile, getStorageKindForTile } from '../shared/buildings/storage';
import { getStorageCapacity } from '../shared/game/storage';
import { getDistanceToNearestTowncenter } from '../shared/game/worldQueries';
import { isVisibleExplorationTile } from '../shared/game/explorationFrontier';
import { getScoutSurveyProgress, isHeroSurveyingScoutResource } from '../shared/game/scoutResources';
import {
    consumePendingCameraNudges,
    consumePendingTerrainBursts,
    getActiveImpactRings,
    getActiveTileFlashes,
    getHeroImpactOffset,
} from './gameFeel';
import { isHeroWorkingTask } from '../shared/game/heroTaskState';
import {
    getBridgeConnectionSides,
    getTunnelConnectionSides,
    isBridgeTile,
    isTunnelTile,
} from '../shared/game/bridges';
import { isProceduralRoadVariant, isRoadConnectionTarget, isRoadTile } from '../shared/game/roads';
import { hash32 } from './worldVariation';
import { DEFAULT_RENDER_CONFIG, getRenderDebugLabelForQuality, getResolvedRenderQualityProfile } from './render/RenderConfig';
import { HexMapRenderer } from './render/HexMapRenderer';
import { MapPicker } from './render/MapPicker';
import { RenderSceneBuilder } from './render/RenderSceneBuilder';
import type { RenderPass } from './render/RenderPass';
import type { RenderPassContext as RendererPassContext, RenderSurface } from './render/RenderPassContext';
import type { FrameTimes, HexMapDrawOptions, RenderQualityProfile, RenderScene, ViewportSnapshot } from './render/RenderTypes';
import { HexProjection } from './render/math/HexProjection';
import { filterAxialItemsToViewport } from './render/math/VisibilityMath';
import { MapViewport } from './render/viewport/MapViewport';
import { TerrainChunkCache } from './render/terrain/TerrainChunkCache';
import { TerrainRenderer } from './render/terrain/TerrainRenderer';
import { TerrainChunkBuilder } from './render/terrain/TerrainChunkBuilder';
import { getDirtyChunkKeysForTiles } from './render/terrain/TerrainInvalidation';
import { EntityRenderer } from './render/entities/EntityRenderer';
import { HeroRenderer } from './render/entities/HeroRenderer';
import { OverlayRenderer } from './render/overlays/OverlayRenderer';
import { ParticleRenderer } from './render/particles/ParticleRenderer';
import { EffectPipeline } from './render/effects/EffectPipeline';
import { BloomEffect } from './render/effects/BloomEffect';
import { VignetteEffect } from './render/effects/VignetteEffect';
import { FogShimmerEffect } from './render/effects/FogShimmerEffect';
import { CloudShadowEffect } from './render/effects/CloudShadowEffect';
import { AuraEffect } from './render/effects/AuraEffect';
import { BackdropRenderer } from './render/effects/BackdropRenderer';
import { CompositeRenderer } from './render/effects/CompositeRenderer';
import { MotionBlurEffect } from './render/effects/MotionBlurEffect';
import { ResourceFlightEffect } from './render/effects/ResourceFlightEffect';
import { DebugRenderer } from './render/debug/DebugRenderer';
import { DEFAULT_DEBUG_FLAGS } from './render/debug/DebugFlags';
import {
    computeTileSettlerOffsets,
    getSettlerRenderCoords,
    getSettlerInterpolatedPixelPosition,
    isSettlerVisibleOnMap,
} from './render/entities/settlerRender';

const SCOUTED_TILE_STYLE = {
    fill: 'rgba(236, 72, 153, 0.14)',
    stroke: 'rgba(244, 114, 182, 0.82)',
    foundStroke: 'rgba(251, 207, 232, 0.96)',
};

type GlowColor = readonly [number, number, number];

function buildTileSources(): Record<string, string> {
    const tileImageModules = import.meta.glob('../assets/tiles/*.png', { eager: true });
    const sources: Record<string, string> = {};
    for (const path in tileImageModules) {
        const mod: any = tileImageModules[path];
        const url: string = mod.default || mod;
        const nameMatch = path.match(/([^/]+)\.png$/);
        if (!nameMatch) continue;
        const key = nameMatch[1]!;
        sources[key] = url;
    }
    return sources;
}

function buildHeroSources(): Record<string, string> {
    const heroImageModules = import.meta.glob('../assets/heroes/*.png', { eager: true });
    const sources: Record<string, string> = {};
    for (const path in heroImageModules) {
        const mod: any = heroImageModules[path];
        const url: string = mod.default || mod;
        const nameMatch = path.match(/([^/]+)\.png$/);
        if (!nameMatch) continue;
        const key = nameMatch[1]!;
        sources[key] = url;
    }
    return sources;
}

function buildToolSources(): Record<string, string> {
    const toolImageModules = import.meta.glob('../assets/tools/*.png', { eager: true });
    const sources: Record<string, string> = {};
    for (const path in toolImageModules) {
        const mod: any = toolImageModules[path];
        const url: string = mod.default || mod;
        const nameMatch = path.match(/([^/]+)\.png$/);
        if (!nameMatch) continue;
        const key = nameMatch[1]!;
        sources[key] = url;
    }
    return sources;
}

function buildSettlerSources(): Record<string, string> {
    const settlerImageModules = import.meta.glob('../assets/settlers/*.png', { eager: true });
    const sources: Record<string, string> = {};
    for (const path in settlerImageModules) {
        const mod: any = settlerImageModules[path];
        const url: string = mod.default || mod;
        const nameMatch = path.match(/([^/]+)\.png$/);
        if (!nameMatch) continue;
        const key = nameMatch[1]!;
        sources[key] = url;
    }
    return sources;
}

interface DrawOptions {
    hoveredTile: Tile | null;
    hoveredHero: Hero | null;
    hoveredSettler: Settler | null;
    taskMenuTile: Tile | null;
    pathCoords: PathCoord[];
    clusterBoundaryTiles?: Tile[]; // boundary tiles of same-terrain cluster for menu highlighting
    clusterTileIds?: Set<string>; // all tile ids in cluster to suppress interior edges
    globalReachBoundary?: Array<{q: number; r: number}>; // always-visible reach outline (all TCs, dimmed)
    globalReachTileIds?: Set<string>;
    storyHintTiles?: Tile[];
    showSupportOverlay?: boolean;
    hoveredTileInReach?: boolean; // whether the hovered tile is within TC reach
}

interface OverlayRecord {
    source: CanvasImageSource;
    x: number;
    y: number;
    width: number;
    height: number;
    q: number;
    r: number;
    opacity: number;
    z: number;
}

interface RenderFrameContext {
    finalCtx: CanvasRenderingContext2D;
    terrainSurface: RenderSurface;
    overlayUnderlaySurface: RenderSurface;
    entitySurface: RenderSurface;
    overlayTopSurface: RenderSurface;
    particleUnderlaySurface: RenderSurface;
    particleOverlaySurface: RenderSurface;
    effectSurface: RenderSurface;
    worldCtx: CanvasRenderingContext2D;
    worldCanvas: HTMLCanvasElement;
    viewport: ViewportSnapshot;
    scene: RenderScene;
    cameraFx: CameraCompositeState;
    effectNowMs: number;
    movementNowMs: number;
    perfNowMs: number;
    visibleTiles: Tile[];
    quality: RenderQualityProfile;
    stressTier: RenderStressState['tier'];
    cameraMoving: boolean;
    dirtyChunkKeys: string[];
    passTimingsMs: Record<string, number>;
}

interface TileRenderState {
    tile: Tile;
    key: string;
    x: number;
    y: number;
    now: number;
    opacity: number;
    maskedCanvasKey: string;
    maskedCanvas: HTMLCanvasElement | null;
}

interface TileColorAdjustment {
    hueDeg: number;
    saturate: number;
    brightness: number;
}

interface TileShaderVariant {
    accentBucket: number;
    accentVariant: number;
    regionBucket: number;
    regionVariant: number;
}

interface TileShaderPalette {
    wash: GlowColor;
    patch: GlowColor;
    shadow: GlowColor;
    highlight: GlowColor;
    regionGlow: GlowColor;
    regionGlowAlpha: number;
    washAlpha: number;
    patchAlpha: number;
    shadowAlpha: number;
    highlightAlpha: number;
}

interface TileShaderGeometry {
    width: number;
    height: number;
    accentX: number;
    accentY: number;
    accentRadius: number;
    accentX2: number;
    accentY2: number;
    accentRadius2: number;
    regionShiftX: number;
    sunX: number;
    sunY: number;
    sunRadius: number;
    shadeX: number;
    shadeY: number;
    shadeRadius: number;
}

interface WaterReflectionSample {
    side: TileSide;
    source: HTMLCanvasElement;
    signature: string;
    alpha: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    bornMs: number;
    lifeMs: number;
    alpha: number;
    glow: number;
    color: GlowColor;
    gravity: number;
    drag: number;
    twinkle: number;
    shape: 'circle' | 'diamond' | 'cloud' | 'ring' | 'bird';
    renderMode?: 'glow' | 'smoke';
    growth?: number;
    layer?: 'underlay' | 'overlay';
    wobbleX?: number;
    wobbleY?: number;
    wobbleSpeed?: number;
    flapSpeed?: number;
}

interface CameraCompositeState {
    offsetX: number;
    offsetY: number;
    roll: number;
    zoom: number;
    vignetteBiasX: number;
    vignetteBiasY: number;
    sheenAlpha: number;
    speedNorm: number;
    dirX: number;
    dirY: number;
}

interface CameraCompositeRuntimeState extends CameraCompositeState {
    pulse: number;
    lastUpdateMs: number;
    lastScreenSpeed: number;
}

interface RoadBranch {
    side: TileSide;
    start: { x: number; y: number };
    control1: { x: number; y: number };
    control2: { x: number; y: number };
    end: { x: number; y: number };
    dirX: number;
    dirY: number;
    perpX: number;
    perpY: number;
    distance: number;
}

interface RenderStressState {
    tier: 0 | 1 | 2;
    smoothedFrameMs: number;
}

const DEFAULT_CAMERA_COMPOSITE_STATE: CameraCompositeState = {
    offsetX: 0,
    offsetY: 0,
    roll: 0,
    zoom: 1,
    vignetteBiasX: 0,
    vignetteBiasY: 0,
    sheenAlpha: 0,
    speedNorm: 0,
    dirX: 0,
    dirY: 0,
};

const DEFAULT_RENDER_QUALITY: RenderQualityProfile = getResolvedRenderQualityProfile(0);

export class HexMapService {

    readonly HEX_SIZE = DEFAULT_RENDER_CONFIG.hexSize;
    readonly HEX_SPACE = DEFAULT_RENDER_CONFIG.hexSpace;

    // Config constants (exposed for potential external tuning later)
    readonly TILE_DRAW_SIZE = DEFAULT_RENDER_CONFIG.tileDrawSize;
    readonly heroFrameSize = heroAnimationSet.size;
    // Removed fixed heroFrames/speed/row in favor of animation definitions
    readonly heroZoom = DEFAULT_RENDER_CONFIG.heroZoom;
    readonly HERO_OFFSET_SPACING = DEFAULT_RENDER_CONFIG.heroOffsetSpacing;

    readonly heroShadowOpacity = 0.6; // base opacity before fade scaling
    readonly heroShadowWidthFactor = 0.6; // relative to heroFrameSize * zoom
    readonly heroShadowHeightFactor = 0.20; // relative to heroFrameSize * zoom
    readonly heroShadowYOffset = 0.13; // move shadow up relative to tile center (in heroFrameSize units)
    readonly AMBIENT_PARTICLE_DENSITY = DEFAULT_RENDER_CONFIG.ambientParticleDensity;
    private readonly _renderConfig = DEFAULT_RENDER_CONFIG;
    private readonly _mapViewport = new MapViewport();
    private readonly _sceneBuilder = new RenderSceneBuilder(this._renderConfig);
    private _renderPipeline!: HexMapRenderer;
    private readonly _terrainChunkCache = new TerrainChunkCache(() => document.createElement('canvas'));
    private _terrainRenderer!: TerrainRenderer;
    private readonly _heroRenderer = new HeroRenderer();
    private readonly _entityRenderer = new EntityRenderer();
    private readonly _overlayRenderer = new OverlayRenderer();
    private readonly _particleRenderer = new ParticleRenderer();
    private _effectPipeline!: EffectPipeline;
    private readonly _fogShimmerEffect = new FogShimmerEffect();
    private readonly _cloudShadowEffect = new CloudShadowEffect({
        dpr: this._dpr,
        getCanvasCenter: () => this.getCanvasCenter(),
        getCameraFx: (context) => this.getLegacyFrameFromPassContext(context).cameraFx,
        applyWorldTransform: (ctx, translateX, translateY, cameraFx) => {
            this.applyWorldTransform(ctx, translateX, translateY, cameraFx as CameraCompositeState);
        },
    });
    private readonly _auraEffect = new AuraEffect();
    private readonly _backdropRenderer = new BackdropRenderer<Tile, CameraCompositeState>();
    private readonly _compositeRenderer = new CompositeRenderer<RenderFrameContext>();
    private readonly _debugRenderer = new DebugRenderer();
    private _canvas: HTMLCanvasElement | null = null;
    private _container: HTMLDivElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _terrainCanvas: HTMLCanvasElement | null = null;
    private _terrainCtx: CanvasRenderingContext2D | null = null;
    private _worldCanvas: HTMLCanvasElement | null = null;
    private _worldCtx: CanvasRenderingContext2D | null = null;
    private _overlayUnderlayCanvas: HTMLCanvasElement | null = null;
    private _overlayUnderlayCtx: CanvasRenderingContext2D | null = null;
    private _layerCanvas: HTMLCanvasElement | null = null;
    private _layerCtx: CanvasRenderingContext2D | null = null;
    private _overlayTopCanvas: HTMLCanvasElement | null = null;
    private _overlayTopCtx: CanvasRenderingContext2D | null = null;
    private _particleUnderlayCanvas: HTMLCanvasElement | null = null;
    private _particleUnderlayCtx: CanvasRenderingContext2D | null = null;
    private _particleOverlayCanvas: HTMLCanvasElement | null = null;
    private _particleOverlayCtx: CanvasRenderingContext2D | null = null;
    private _effectCanvas: HTMLCanvasElement | null = null;
    private _effectCtx: CanvasRenderingContext2D | null = null;
    private _bloomCanvas: HTMLCanvasElement | null = null;
    private _bloomCtx: CanvasRenderingContext2D | null = null;
    private _dpr = 1;

    private _images: Record<string, HTMLImageElement> = {};
    private _maskedImages = new Map<string, HTMLCanvasElement>();
    private _imagesLoaded = false;
    private _heroImages: Record<string, HTMLImageElement> = {};
    private _pendingHeroImageLoads = new Map<string, Promise<void>>();
    private _heroImagesLoaded = false;
    private _toolImages: Record<string, HTMLImageElement> = {};
    private _toolImagesLoaded = false;
    private _settlerImages: Record<string, HTMLImageElement> = {};
    private _settlerImagesLoaded = false;

    private _heroLayouts: Map<string, Record<string, { x: number; y: number }>> = new Map();

    private _heroMasksByRow: Record<string, Record<number, Uint8Array[]>> = {};
    private _heroEdgePixelsByRow: Record<string, Record<number, { x: number; y: number }[][]>> = {};

    private _heroAnimStart = Date.now();
    private _lastHeroFrame = 0;

    private _tileAnimStart = Date.now();
    private _particles: Particle[] = [];
    private _lastParticleUpdateMs = Date.now();
    private _nextBirdFlockSpawnMs = 0;
    private _heroTrailEmitMs = new Map<string, number>();
    private _taskParticleEmitMs = new Map<string, number>();
    private _cameraFx: CameraCompositeRuntimeState = {
        ...DEFAULT_CAMERA_COMPOSITE_STATE,
        pulse: 0,
        lastUpdateMs: 0,
        lastScreenSpeed: 0,
    };
    private _currentCameraFx: CameraCompositeState = {...DEFAULT_CAMERA_COMPOSITE_STATE};
    private _renderStress: RenderStressState = {
        tier: 0,
        smoothedFrameMs: 5.5,
    };
    private _storageIndicatorAlphaByTileId = new Map<string, number>();
    private _tileColorVariantCache = new Map<string, HTMLCanvasElement>();
    private _tileShaderCache = new Map<string, HTMLCanvasElement>();
    private _tileShorelineCache = new Map<string, HTMLCanvasElement>();
    private _tileOverlayShaderCache = new Map<string, HTMLCanvasElement>();
    private _tileOverlayAlphaBoundsCache = new Map<string, { top: number; bottom: number } | null>();
    private _tileCompositeScratchCanvas: HTMLCanvasElement | null = null;
    private _tileCompositeScratchCtx: CanvasRenderingContext2D | null = null;
    private _currentRenderQuality: RenderQualityProfile = { ...DEFAULT_RENDER_QUALITY };

    //stores heroes in the exact draw layering order (top drawn first, bottom drawn last)
    private _sortedHeroes: Hero[] = [];

    // Asset sources
    private readonly tileImgSources: Record<string, string> = buildTileSources();
    private readonly heroImgSources: Record<string, string> = buildHeroSources();
    private readonly toolImgSources: Record<string, string> = buildToolSources();
    private readonly settlerImgSources: Record<string, string> = buildSettlerSources();

    constructor() {
        this.ensureRenderArchitecture();
    }

    async init(canvasEl: HTMLCanvasElement, containerEl: HTMLDivElement) {
        if (Object.getPrototypeOf(this) !== HexMapService.prototype) {
            Object.setPrototypeOf(this, HexMapService.prototype);
        }
        this.ensureRenderArchitecture();
        this._canvas = canvasEl;
        this._container = containerEl;
        this._dpr = 1;
        this.setupCanvas();
        await this.loadTileImages();
        await this.ensureHeroAssets();
        await this.loadToolImages();
        await this.loadSettlerImages();
        this.resize();
        stopCameraAnimation();
        animateCamera();
    }

    destroy() {
        this._canvas = null;
        this._container = null;
        this._ctx = null;
        this._terrainCanvas = null;
        this._terrainCtx = null;
        this._worldCanvas = null;
        this._worldCtx = null;
        this._overlayUnderlayCanvas = null;
        this._overlayUnderlayCtx = null;
        this._layerCanvas = null;
        this._layerCtx = null;
        this._overlayTopCanvas = null;
        this._overlayTopCtx = null;
        this._particleUnderlayCanvas = null;
        this._particleUnderlayCtx = null;
        this._particleOverlayCanvas = null;
        this._particleOverlayCtx = null;
        this._effectCanvas = null;
        this._effectCtx = null;
        this._bloomCanvas = null;
        this._bloomCtx = null;
        this._heroLayouts.clear();
        this._maskedImages.clear();
        this._particles = [];
        this._lastParticleUpdateMs = Date.now();
        this._nextBirdFlockSpawnMs = 0;
        this._heroTrailEmitMs.clear();
        this._taskParticleEmitMs.clear();
        this._pendingHeroImageLoads.clear();
        this._fogTileCanvas = null;
        this._proceduralRoadCache.clear();
        this._proceduralBridgeCache.clear();
        this._tileColorVariantCache.clear();
        this._tileShaderCache.clear();
        this._tileShorelineCache.clear();
        this._tileOverlayShaderCache.clear();
        this._tileOverlayAlphaBoundsCache.clear();
        this._tileCompositeScratchCanvas = null;
        this._tileCompositeScratchCtx = null;
        this._renderStress = {
            tier: 0,
            smoothedFrameMs: 5.5,
        };
        this.resetCameraCompositeState();
        this._currentRenderQuality = { ...DEFAULT_RENDER_QUALITY };
    }

    resize() {
        if (!this._canvas || !this._container) return;
        this._mapViewport.syncFromContainer(this._container, 1);
        this._dpr = this._mapViewport.dpr;
        this._mapViewport.applyToCanvas(this._canvas);
        this._ctx = this.get2dContext(this._canvas);
        if (this._ctx) this._ctx.imageSmoothingEnabled = false;
        if (!this._terrainCanvas) this._terrainCanvas = document.createElement('canvas');
        this._terrainCanvas.width = this._canvas.width;
        this._terrainCanvas.height = this._canvas.height;
        this._terrainCtx = this.get2dContext(this._terrainCanvas);
        if (this._terrainCtx) this._terrainCtx.imageSmoothingEnabled = false;
        if (!this._worldCanvas) this._worldCanvas = document.createElement('canvas');
        this._worldCanvas.width = this._canvas.width;
        this._worldCanvas.height = this._canvas.height;
        this._worldCtx = this.get2dContext(this._worldCanvas);
        if (this._worldCtx) this._worldCtx.imageSmoothingEnabled = false;
        if (!this._overlayUnderlayCanvas) this._overlayUnderlayCanvas = document.createElement('canvas');
        this._overlayUnderlayCanvas.width = this._canvas.width;
        this._overlayUnderlayCanvas.height = this._canvas.height;
        this._overlayUnderlayCtx = this.get2dContext(this._overlayUnderlayCanvas);
        if (this._overlayUnderlayCtx) this._overlayUnderlayCtx.imageSmoothingEnabled = false;
        if (!this._layerCanvas) this._layerCanvas = document.createElement('canvas');
        this._layerCanvas.width = this._canvas.width;
        this._layerCanvas.height = this._canvas.height;
        this._layerCtx = this.get2dContext(this._layerCanvas);
        if (this._layerCtx) this._layerCtx.imageSmoothingEnabled = false;
        if (!this._overlayTopCanvas) this._overlayTopCanvas = document.createElement('canvas');
        this._overlayTopCanvas.width = this._canvas.width;
        this._overlayTopCanvas.height = this._canvas.height;
        this._overlayTopCtx = this.get2dContext(this._overlayTopCanvas);
        if (this._overlayTopCtx) this._overlayTopCtx.imageSmoothingEnabled = false;
        if (!this._particleUnderlayCanvas) this._particleUnderlayCanvas = document.createElement('canvas');
        this._particleUnderlayCanvas.width = this._canvas.width;
        this._particleUnderlayCanvas.height = this._canvas.height;
        this._particleUnderlayCtx = this.get2dContext(this._particleUnderlayCanvas);
        if (this._particleUnderlayCtx) this._particleUnderlayCtx.imageSmoothingEnabled = true;
        if (!this._particleOverlayCanvas) this._particleOverlayCanvas = document.createElement('canvas');
        this._particleOverlayCanvas.width = this._canvas.width;
        this._particleOverlayCanvas.height = this._canvas.height;
        this._particleOverlayCtx = this.get2dContext(this._particleOverlayCanvas);
        if (this._particleOverlayCtx) this._particleOverlayCtx.imageSmoothingEnabled = true;
        if (!this._effectCanvas) this._effectCanvas = document.createElement('canvas');
        this._effectCanvas.width = this._canvas.width;
        this._effectCanvas.height = this._canvas.height;
        this._effectCtx = this.get2dContext(this._effectCanvas);
        if (this._effectCtx) this._effectCtx.imageSmoothingEnabled = true;
        if (!this._bloomCanvas) this._bloomCanvas = document.createElement('canvas');
        this._bloomCanvas.width = this._canvas.width;
        this._bloomCanvas.height = this._canvas.height;
        this._bloomCtx = this.get2dContext(this._bloomCanvas);
        if (this._bloomCtx) this._bloomCtx.imageSmoothingEnabled = true;
        this.adaptiveCameraRadius();
        // recenter camera if entire world comfortably fits inside current camera radius.
        this.recenterIfWorldFits();
        // Ensure current target is clamped after potential radius change.
        moveCamera(camera.targetQ, camera.targetR);
    }

    draw(opts: DrawOptions, frameTimes: FrameTimes = {
        effectNowMs: Date.now(),
        movementNowMs: Date.now(),
        perfNowMs: performance.now(),
    }) {
        if (Object.getPrototypeOf(this) !== HexMapService.prototype) {
            Object.setPrototypeOf(this, HexMapService.prototype);
        }
        this.ensureRenderArchitecture();
        const renderStartMs = performance.now();
        const frame = this.createRenderFrameContext(opts, frameTimes);
        if (!frame) return;

        const passContext = this.createRendererPassContext(frame, opts);
        this._renderPipeline.render(passContext);
        const motionBlur = (passContext.runtime.motionBlur ?? null) as {
            samples: number;
            strength: number;
        } | null;
        const renderCostMs = performance.now() - renderStartMs;
        this.recordRenderStress(renderCostMs);
        this.publishRenderDebugInfo(frame, passContext, motionBlur);
    }

    private ensureRenderArchitecture() {
        const self = this as any;
        void this._terrainChunkCache;
        void this.drawTilesAndActors;

        if (!self._terrainChunkCache) {
            self._terrainChunkCache = new TerrainChunkCache(() => document.createElement('canvas'));
        }
        if (!self._terrainRenderer) {
        self._terrainRenderer = new TerrainRenderer({
            cache: self._terrainChunkCache,
            builder: new TerrainChunkBuilder({
                get2dContext: (canvas) => this.get2dContext(canvas),
                drawTile: (tile, now, ctx, opacity) => {
                    this.drawTile(tile, now, ctx, opacity);
                },
                getSupportAwareTileOpacity: (tile, opacity) => this.getSupportAwareTileOpacity(tile, opacity),
            }),
        });
        }
        if (!self._entityRenderer) {
            self._entityRenderer = new EntityRenderer();
        }
        if (!self._overlayRenderer) {
            self._overlayRenderer = new OverlayRenderer();
        }
        if (!self._particleRenderer) {
            self._particleRenderer = new ParticleRenderer();
        }
        if (!self._debugRenderer) {
            self._debugRenderer = new DebugRenderer();
        }

        self._effectPipeline = new EffectPipeline([
            new MotionBlurEffect(),
            this._cloudShadowEffect,
            new BloomEffect({
                dpr: this._dpr,
                hexSize: this.HEX_SIZE,
                getBloomSurface: () => (
                    this._bloomCtx && this._bloomCanvas
                        ? this.toRenderSurface(this._bloomCanvas, this._bloomCtx)
                        : null
                ),
                getFrame: (context) => this.getLegacyFrameFromPassContext(context),
                getDrawOptions: (context) => this.getDrawOptionsFromPassContext(context),
                getCanvasCenter: () => this.getCanvasCenter(),
                applyWorldTransform: (ctx, translateX, translateY, cameraFx) => {
                    this.applyWorldTransform(ctx, translateX, translateY, cameraFx as CameraCompositeState);
                },
                computeFade: (dist, inner, radius) => this.computeFade(dist, inner, radius),
                getTileImageKey: (tile) => this.getTileImageKey(tile),
                getTileOverlayKey: (tile) => this.getTileOverlayKey(tile),
                getHeroInterpolatedPixelPosition: (hero, now) => this.getHeroInterpolatedPixelPosition(hero, now),
            }),
            new VignetteEffect({
                getFrame: (context) => this.getLegacyFrameFromPassContext(context),
            }),
            this._fogShimmerEffect,
            this._auraEffect,
            new ResourceFlightEffect<CameraCompositeState>({
                getFrame: (context) => this.getLegacyFrameFromPassContext(context),
                projectWorldToScreenPixels: (worldX, worldY, cameraFx) => this.projectWorldToScreenPixels(worldX, worldY, cameraFx),
            }),
        ]);
        self._renderPipeline = new HexMapRenderer(this.createRenderPasses());
    }

    pickTile(screenX: number, screenY: number): Tile | null {
        if (!this._canvas) return null;
        const rect = this._canvas.getBoundingClientRect();
        const sx = screenX - rect.left;
        const sy = screenY - rect.top;
        const {worldX, worldY} = this.screenToWorld(sx, sy);
        const {q, r} = pixelToAxial(worldX, worldY);
        const results = getTilesInRadius(q, r, 0);
        return results.length ? results[0]! : null;
    }

    pickHero(screenX: number, screenY: number): Hero | null {
        if (!this._canvas) return null;
        const rect = this._canvas.getBoundingClientRect();
        // Iterate in reverse of draw order so visually top hero is picked first
        const layer = this._sortedHeroes.length ? this._sortedHeroes : heroes;
        const bounds = layer.map((hero) => {
            const {x, y} = this.worldToScreen(hero.q, hero.r);
            const layout = this._heroLayouts.get(axialKey(hero.q, hero.r)) || {};
            const pos = layout[hero.id] || {x: 0, y: 0};

            return {
                entityId: hero.id,
                hero,
                left: x - (this.heroFrameSize * this.heroZoom) / 2 + pos.x - (this.heroFrameSize / 2),
                top: y - (this.heroFrameSize * 2) + (this.heroFrameSize / 2) + pos.y,
                width: this.heroFrameSize * this.heroZoom,
                height: this.heroFrameSize * this.heroZoom,
            };
        });

        const picked = MapPicker.pickBoundsFromClientPoint(screenX, screenY, rect, bounds, (bound, localX, localY) => {
            const spriteLocalX = Math.floor(localX / this.heroZoom);
            const spriteLocalY = Math.floor(localY / this.heroZoom);

            if (
                spriteLocalX < 0
                || spriteLocalX >= this.heroFrameSize
                || spriteLocalY < 0
                || spriteLocalY >= this.heroFrameSize
            ) {
                return false;
            }
            const frameIndex = this._lastHeroFrame;
            const facingRowMap: Record<string, number> = {right: 2, left: 2, up: 5, down: 8};
            const row = facingRowMap[bound.hero.facing] ?? 8;
            const rowMasks = this._heroMasksByRow[bound.hero.avatar]?.[row];
            const mask = rowMasks ? rowMasks[Math.min(frameIndex, rowMasks.length - 1)] : null;
            return !!mask && !!mask[spriteLocalY * this.heroFrameSize + spriteLocalX];
        });

        return picked?.hero ?? null;
    }

    pickSettler(screenX: number, screenY: number): Settler | null {
        if (!this._canvas) return null;
        const rect = this._canvas.getBoundingClientRect();
        const visibleSettlers = settlers
            .filter((settler) => isSettlerVisibleOnMap(settler))
            .sort((a, b) => {
                const aCoords = getSettlerRenderCoords(a);
                const bCoords = getSettlerRenderCoords(b);
                if (aCoords.r !== bCoords.r) {
                    return aCoords.r - bCoords.r;
                }
                if (aCoords.q !== bCoords.q) {
                    return aCoords.q - bCoords.q;
                }
                return a.id.localeCompare(b.id);
            });

        const settlerLayoutMap = new Map<string, Settler[]>();
        for (const settler of visibleSettlers) {
            const renderCoords = getSettlerRenderCoords(settler);
            const key = axialKey(renderCoords.q, renderCoords.r);
            let list = settlerLayoutMap.get(key);
            if (!list) {
                list = [];
                settlerLayoutMap.set(key, list);
            }
            list.push(settler);
        }

        const settlerLayouts = new Map<string, Record<string, { x: number; y: number }>>();
        for (const [key, list] of settlerLayoutMap) {
            settlerLayouts.set(key, computeTileSettlerOffsets(list));
        }

        const now = Date.now();
        const bounds = visibleSettlers.map((settler) => {
            const renderCoords = getSettlerRenderCoords(settler);
            const interp = getSettlerInterpolatedPixelPosition(settler, now);
            const screen = this.worldToScreen(renderCoords.q, renderCoords.r);
            const layout = settlerLayouts.get(axialKey(renderCoords.q, renderCoords.r)) || {};
            const pos = layout[settler.id] || { x: -6, y: 7 };
            const offsetX = interp.x - axialToPixel(renderCoords.q, renderCoords.r).x;
            const offsetY = interp.y - axialToPixel(renderCoords.q, renderCoords.r).y;
            const left = screen.x + pos.x + offsetX - 5;
            const top = screen.y + pos.y + offsetY - 15;

            return {
                entityId: settler.id,
                settler,
                left,
                top,
                width: 12,
                height: 16,
            };
        });

        const picked = MapPicker.pickBoundsFromClientPoint(screenX, screenY, rect, bounds, (bound, localX, localY) => {
            const inHead = localX >= 2 && localX <= 7 && localY >= 0 && localY <= 6;
            const inBody = localX >= 1 && localX <= 8 && localY >= 7 && localY <= 13;
            const inLegs = ((localX >= 3 && localX <= 4) || (localX >= 6 && localX <= 7)) && localY >= 12 && localY <= 15;
            const inCargo = !!bound.settler.carryingKind && localX >= 8 && localX <= 11 && localY >= 8 && localY <= 12;
            return inHead || inBody || inLegs || inCargo;
        });

        return picked?.settler ?? null;
    }

    // ---------------- Private helpers ----------------
    private get2dContext(canvas: HTMLCanvasElement) {
        return canvas.getContext('2d', {
            alpha: true,
            desynchronized: true,
        }) ?? canvas.getContext('2d');
    }

    private setupCanvas() {
        if (!this._canvas) return;
        this._ctx = this.get2dContext(this._canvas);
        if (this._ctx) this._ctx.imageSmoothingEnabled = false;
    }

    private createRenderPasses(): RenderPass[] {
        return [
            {
                name: 'BackdropPass',
                isEnabled: () => true,
                execute: (context) => {
                    const frame = this.getLegacyFrameFromPassContext(context);
                    this.prepareFinalFrame(frame);
                    this._backdropRenderer.render(frame);
                },
            },
            {
                name: 'TerrainPass',
                isEnabled: () => true,
                execute: (context) => {
                    this._terrainRenderer.render(context);
                },
            },
            {
                name: 'OverlayPass',
                isEnabled: () => true,
                execute: (context) => {
                    const frame = this.getLegacyFrameFromPassContext(context);
                    const opts = this.getDrawOptionsFromPassContext(context);
                    this._overlayRenderer.renderLayers(context, frame, opts, {
                        canvas: this._canvas,
                        dpr: this._dpr,
                        hexSize: this.HEX_SIZE,
                        tileDrawSize: this.TILE_DRAW_SIZE,
                        heroFrameSize: this.heroFrameSize,
                        resourceIconMap: this.RESOURCE_ICON_MAP,
                        storageIndicatorAlphaByTileId: this._storageIndicatorAlphaByTileId,
                        getCanvasCenter: () => this.getCanvasCenter(),
                        applyWorldTransform: (ctx, translateX, translateY, cameraFx) => {
                            this.applyWorldTransform(ctx, translateX, translateY, cameraFx as CameraCompositeState);
                        },
                        computeFade: (dist, inner, radius) => this.computeFade(dist, inner, radius),
                        getTileOpacity: (dist, applyCameraFade) => this.getTileOpacity(dist, applyCameraFade),
                        drawHexHighlight: (ctx, q, r, fill, stroke, opacity) => {
                            this.drawHexHighlight(ctx, q, r, fill, stroke, opacity);
                        },
                        drawSupportOverlay: (ctx, tiles, applyCameraFade, showSupportOverlay) => {
                            this.drawSupportOverlay(ctx, tiles, applyCameraFade, showSupportOverlay);
                        },
                        drawGameplayWorldImpacts: (ctx, nowMs, applyCameraFade) => {
                            this.drawGameplayWorldImpacts(ctx, nowMs, applyCameraFade);
                        },
                        drawReachOutline: (ctx, boundary, reachSet, alpha, hovered) => {
                            this.drawReachOutline(ctx, boundary, reachSet, alpha, hovered);
                        },
                        drawRoundedRect: (ctx, x, y, w, h, r) => {
                            this.drawRoundedRect(ctx, x, y, w, h, r);
                        },
                        projectWorldToScreenPixels: (worldX, worldY, cameraFx) => (
                            this.projectWorldToScreenPixels(worldX, worldY, cameraFx as CameraCompositeState)
                        ),
                        isHeroIdle: (hero, now) => this.isHeroIdle(hero, now),
                        isHeroWalking: (hero, now) => this.isHeroWalking(hero, now),
                    });
                },
            },
            {
                name: 'EntityPass',
                isEnabled: () => true,
                execute: (context) => {
                    const frame = this.getLegacyFrameFromPassContext(context);
                    const opts = this.getDrawOptionsFromPassContext(context);
                    this._entityRenderer.renderWorldLayer(context, frame, opts, {
                        canvas: this._canvas,
                        dpr: this._dpr,
                        hexSize: this.HEX_SIZE,
                        tileDrawSize: this.TILE_DRAW_SIZE,
                        getCanvasCenter: () => this.getCanvasCenter(),
                        applyWorldTransform: (ctx, translateX, translateY, cameraFx) => {
                            this.applyWorldTransform(ctx, translateX, translateY, cameraFx as CameraCompositeState);
                        },
                        getSupportAwareTileOpacity: (tile, opacity) => this.getSupportAwareTileOpacity(tile, opacity),
                        getTileOpacity: (dist, applyCameraFade) => this.getTileOpacity(dist, applyCameraFade),
                        drawTile: (tile, now, ctx, opacity) => this.drawTile(tile, now, ctx, opacity),
                        drawUndiscoveredTile: (ctx, opacity, tile, inReach) => this.drawUndiscoveredTile(ctx, opacity, tile, inReach),
                        getTileOverlayKey: (tile) => this.getTileOverlayKey(tile),
                        getTileOverlayOffset: (tile) => this.getTileOverlayOffset(tile),
                        getBuildingOverlayKey: (tile) => this.getBuildingOverlayKey(tile),
                        getBuildingOverlayOffset: (tile) => this.getBuildingOverlayOffset(tile),
                        getTileImageKey: (tile) => this.getTileImageKey(tile),
                        buildShadedTileOverlayCanvas: (tile, baseKey, overlayKey, overlayImg, drawWidth, drawHeight) => (
                            this.buildShadedTileOverlayCanvas(tile, baseKey, overlayKey, overlayImg, drawWidth, drawHeight)
                        ),
                        images: this._images,
                        heroRenderer: this._heroRenderer,
                        heroRenderDependencies: {
                            queueMissingHeroAssets: () => this.queueMissingHeroAssets(),
                            heroImagesLoaded: this._heroImagesLoaded,
                            heroImages: this._heroImages,
                            toolImagesLoaded: this._toolImagesLoaded,
                            toolImages: this._toolImages,
                            settlerImagesLoaded: this._settlerImagesLoaded,
                            settlerImages: this._settlerImages,
                            heroLayouts: this._heroLayouts,
                            setHeroLayouts: (next) => {
                                this._heroLayouts = next;
                            },
                            setSortedHeroes: (next) => {
                                this._sortedHeroes = next;
                            },
                            setLastHeroFrame: (frameIndex) => {
                                this._lastHeroFrame = frameIndex;
                            },
                            computeTileHeroOffsets: (list) => this.computeTileHeroOffsets(list),
                            getActorOpacity: (dist, applyCameraFade) => this.getActorOpacity(dist, applyCameraFade),
                            getHeroInterpolatedPixelPosition: (hero, now) => this.getHeroInterpolatedPixelPosition(hero, now),
                            hasMovementStarted: (hero, now) => this.hasMovementStarted(hero, now),
                            isDustyWalkingTerrain: (tile, key) => this.isDustyWalkingTerrain(tile, key),
                            drawWalkingDust: (ctx, hero, interp, pos, opacity, now, tile, tileKey) => {
                                this.drawWalkingDust(ctx, hero, interp, pos, opacity, now, tile, tileKey);
                            },
                            drawHeroSelectionAura: (ctx, interp, pos, opacity, selected, now) => {
                                this._auraEffect.drawHeroSelectionAura(
                                    ctx,
                                    interp,
                                    pos,
                                    opacity,
                                    selected,
                                    now,
                                    this.heroFrameSize,
                                    this.heroShadowYOffset,
                                );
                            },
                            getTileImageKey: (tile) => this.getTileImageKey(tile),
                            heroFrameSize: this.heroFrameSize,
                            heroZoom: this.heroZoom,
                            heroShadowOpacity: this.heroShadowOpacity,
                            heroShadowWidthFactor: this.heroShadowWidthFactor,
                            heroShadowHeightFactor: this.heroShadowHeightFactor,
                            heroShadowYOffset: this.heroShadowYOffset,
                            currentRenderQuality: this._currentRenderQuality,
                            resourceIconMap: this.RESOURCE_ICON_MAP,
                            heroAnimStart: this._heroAnimStart,
                        },
                    });
                },
            },
            {
                name: 'ParticlePass',
                isEnabled: () => true,
                execute: (context) => {
                    const frame = this.getLegacyFrameFromPassContext(context);
                    this._particleRenderer.renderWorldLayer(context, frame, {
                        canvas: this._canvas,
                        dpr: this._dpr,
                        getCanvasCenter: () => this.getCanvasCenter(),
                        applyWorldTransform: (ctx, translateX, translateY, cameraFx) => {
                            this.applyWorldTransform(ctx, translateX, translateY, cameraFx as CameraCompositeState);
                        },
                        projectWorldToScreenPixels: (worldX, worldY, cameraFx) => (
                            this.projectWorldToScreenPixels(worldX, worldY, cameraFx as CameraCompositeState)
                        ),
                        getParticleEdgeFade: (screenX, screenY, applyCameraFade) => this.getParticleEdgeFade(screenX, screenY, applyCameraFade),
                        toRgba: (color, alpha) => this.toRgba(color, alpha),
                        resetParticles: (now) => this.resetParticles(now),
                        updateParticles: (deltaMs, now) => this.updateParticles(deltaMs, now),
                        spawnGameplayBursts: (now) => this.spawnGameplayBursts(now),
                        spawnAmbientParticles: (now, tiles) => this.spawnAmbientParticles(now, tiles),
                        spawnTaskParticles: (now, tiles) => this.spawnTaskParticles(now, tiles),
                        spawnHeroTrailParticles: (now) => this.spawnHeroTrailParticles(now),
                        getParticles: () => this._particles,
                        getLastParticleUpdateMs: () => this._lastParticleUpdateMs,
                        setLastParticleUpdateMs: (now) => {
                            this._lastParticleUpdateMs = now;
                        },
                    });
                },
            },
            {
                name: 'EffectPass',
                isEnabled: () => true,
                execute: (context) => {
                    const frame = this.getLegacyFrameFromPassContext(context);
                    context.runtime.motionBlur = this._compositeRenderer.renderEffects(context, frame, {
                        applyEffectPipeline: (ctx) => this._effectPipeline.apply(ctx),
                    });
                },
            },
            {
                name: 'DebugPass',
                isEnabled: (scene, quality) => quality.debugEnabledByDefault || scene.frameInfo.qualityName !== 'high',
                execute: (context) => {
                    this._debugRenderer.render(context, DEFAULT_DEBUG_FLAGS, () => {});
                },
            },
            {
                name: 'CompositePass',
                isEnabled: () => true,
                execute: (context) => {
                    const frame = this.getLegacyFrameFromPassContext(context);
                    this._compositeRenderer.compositeToFinal(frame);
                },
            },
        ];
    }

    private createRendererPassContext(frame: RenderFrameContext, opts: DrawOptions): RendererPassContext {
        return {
            finalCtx: frame.finalCtx,
            terrainSurface: frame.terrainSurface,
            overlayUnderlaySurface: frame.overlayUnderlaySurface,
            entitySurface: frame.entitySurface,
            overlayTopSurface: frame.overlayTopSurface,
            particleUnderlaySurface: frame.particleUnderlaySurface,
            particleOverlaySurface: frame.particleOverlaySurface,
            effectSurface: frame.effectSurface,
            worldCtx: frame.worldCtx,
            worldCanvas: frame.worldCanvas,
            viewport: frame.viewport,
            scene: frame.scene,
            quality: frame.quality,
            config: this._renderConfig,
            debug: {
                enabled: frame.quality.debugEnabledByDefault,
            },
            runtime: {
                frame,
                drawOptions: opts,
                dirtyChunkKeys: frame.dirtyChunkKeys,
            },
            passTimingsMs: frame.passTimingsMs,
        };
    }

    private getLegacyFrameFromPassContext(context: RendererPassContext) {
        return context.runtime.frame as RenderFrameContext;
    }

    private getDrawOptionsFromPassContext(context: RendererPassContext) {
        return context.runtime.drawOptions as DrawOptions;
    }

    private toRenderSurface(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): RenderSurface {
        return {
            canvas,
            ctx,
        };
    }

    private getCurrentViewportSnapshot(cameraFx: CameraCompositeState = this._currentCameraFx) {
        return this._mapViewport.snapshot(camera, {
            offsetX: cameraFx.offsetX,
            offsetY: cameraFx.offsetY,
            zoom: cameraFx.zoom,
            roll: cameraFx.roll,
        });
    }

    private toRenderDrawOptions(opts: DrawOptions): HexMapDrawOptions {
        return {
            hoveredTile: opts.hoveredTile
                ? {
                    id: opts.hoveredTile.id,
                    q: opts.hoveredTile.q,
                    r: opts.hoveredTile.r,
                    discovered: opts.hoveredTile.discovered,
                }
                : null,
            hoveredHero: opts.hoveredHero
                ? {
                    id: opts.hoveredHero.id,
                }
                : null,
            hoveredSettler: opts.hoveredSettler
                ? {
                    id: opts.hoveredSettler.id,
                }
                : null,
            taskMenuTile: opts.taskMenuTile
                ? {
                    id: opts.taskMenuTile.id,
                    q: opts.taskMenuTile.q,
                    r: opts.taskMenuTile.r,
                }
                : null,
            pathCoords: opts.pathCoords,
            clusterBoundaryTiles: opts.clusterBoundaryTiles?.map((tile) => ({ q: tile.q, r: tile.r })),
            clusterTileIds: opts.clusterTileIds,
            globalReachBoundary: opts.globalReachBoundary,
            globalReachTileIds: opts.globalReachTileIds,
            storyHintTiles: opts.storyHintTiles?.map((tile) => ({ q: tile.q, r: tile.r })),
            showSupportOverlay: opts.showSupportOverlay,
            hoveredTileInReach: opts.hoveredTileInReach,
        };
    }

    private publishRenderDebugInfo(
        frame: RenderFrameContext,
        context: RendererPassContext,
        motionBlur: {
            samples: number;
            strength: number;
        } | null,
    ) {
        const terrainMetrics = (context.runtime.terrainMetrics ?? {
            visibleChunkCount: frame.scene.debug.visibleChunkCount,
            dirtyChunkCount: frame.scene.debug.dirtyChunkCount,
            terrainChunkRebuilds: 0,
        }) as {
            visibleChunkCount: number;
            dirtyChunkCount: number;
            terrainChunkRebuilds: number;
        };
        const particlesEnabled = frame.quality.enableParticles;
        const birdAmbientEnabled = particlesEnabled && this.areBirdAmbientParticlesEnabled();
        const particleCounts = this.getParticleDebugCounts();
        updateRenderDebugState({
            stressTier: frame.stressTier,
            qualityLabel: getRenderDebugLabelForQuality(frame.quality.name),
            qualityProfileName: frame.quality.name,
            smoothedFrameMs: Number(this._renderStress.smoothedFrameMs.toFixed(1)),
            visibleTileCount: frame.visibleTiles.length,
            discoveredVisibleCount: frame.visibleTiles.reduce((count, tile) => count + (tile.discovered ? 1 : 0), 0),
            worldRenderVersion: getWorldRenderVersion(),
            staticTerrainReused: false,
            staticTerrainReason: 'reuse',
            staticTerrainRebuilds: terrainMetrics.terrainChunkRebuilds,
            staticTerrainPaddingPx: 0,
            staticTerrainThresholdPx: 0,
            staticTerrainShiftPx: 0,
            motionBlurEnabled: frame.quality.enableMotionBlur,
            motionBlurActive: !!motionBlur,
            motionBlurSamples: motionBlur?.samples ?? 0,
            motionBlurStrength: Number((motionBlur?.strength ?? frame.quality.motionBlurStrength).toFixed(2)),
            bloomEnabled: frame.quality.enableBloom,
            cloudsEnabled: frame.quality.enableClouds,
            particlesEnabled,
            birdsEnabled: birdAmbientEnabled,
            edgeVignetteEnabled: frame.quality.enableEdgeVignette,
            backdropGlowsEnabled: frame.quality.enableBackdropGlows,
            reachGlowEnabled: frame.quality.enableReachGlow,
            heroAurasEnabled: frame.quality.enableHeroAuras,
            fogShimmerEnabled: frame.quality.enableFogShimmer,
            tileReliefEnabled: frame.quality.enableTileRelief,
            manualShadowComposite: frame.quality.enableManualShadowComposite,
            particleCount: particleCounts.total,
            birdParticleCount: particleCounts.birds,
            visibleChunkCount: terrainMetrics.visibleChunkCount,
            dirtyChunkCount: terrainMetrics.dirtyChunkCount,
            terrainChunkRebuilds: terrainMetrics.terrainChunkRebuilds,
            passTimingsMs: frame.passTimingsMs,
        });
    }

    private createRenderFrameContext(opts: DrawOptions, frameTimes: FrameTimes): RenderFrameContext | null {
        if (
            !this._ctx
            || !this._canvas
            || !this._terrainCtx
            || !this._terrainCanvas
            || !this._worldCtx
            || !this._worldCanvas
            || !this._overlayUnderlayCtx
            || !this._overlayUnderlayCanvas
            || !this._layerCtx
            || !this._layerCanvas
            || !this._overlayTopCtx
            || !this._overlayTopCanvas
            || !this._particleUnderlayCtx
            || !this._particleUnderlayCanvas
            || !this._particleOverlayCtx
            || !this._particleOverlayCanvas
            || !this._effectCtx
            || !this._effectCanvas
        ) return null;
        if (!this._imagesLoaded) return null;

        const { effectNowMs, movementNowMs, perfNowMs } = frameTimes;
        const cameraFx = this.updateCameraCompositeState(perfNowMs);
        const cameraMoving = isCameraMoving();
        const cq = Math.round(camera.q);
        const cr = Math.round(camera.r);
        const storyHintTileIds = new Set((opts.storyHintTiles ?? []).map((tile) => tile.id));
        const radiusTiles = getTilesInRadius(cq, cr, camera.radius)
            .filter((tile) => isVisibleExplorationTile(tile) || storyHintTileIds.has(tile.id));
        const viewport = this.getCurrentViewportSnapshot(cameraFx);
        const visibleTiles = this.filterTilesToViewport(radiusTiles, cameraFx);
        const dirtyChunkKeys = getDirtyChunkKeysForTiles(consumePendingRenderDirtyTiles(), this._renderConfig.terrainChunkSize);
        const discoveredVisibleCount = visibleTiles.reduce((count, tile) => count + (tile.discovered ? 1 : 0), 0);
        const stressTier = this.updateRenderStress(visibleTiles.length, discoveredVisibleCount);
        const quality = this.getRenderQualityProfile(stressTier);
        if (quality.enableTileRelief !== this._currentRenderQuality.enableTileRelief) {
            this._terrainChunkCache.markAllDirty();
        }
        this._currentCameraFx = cameraFx;
        this._currentRenderQuality = quality;
        this.applyPendingCameraNudges(cameraFx);
        const scene = this._sceneBuilder.build({
            viewport,
            quality,
            stressTier,
            drawOptions: this.toRenderDrawOptions(opts),
            frameTimes,
            cameraMoving,
            candidateTiles: radiusTiles,
            candidateHeroes: heroes,
            candidateSettlers: settlers,
            selectedHeroId: selectedHeroId.value,
            worldRenderVersion: getWorldRenderVersion(),
            dirtyChunkKeys,
        });
        return {
            finalCtx: this._ctx,
            terrainSurface: this.toRenderSurface(this._terrainCanvas, this._terrainCtx),
            overlayUnderlaySurface: this.toRenderSurface(this._overlayUnderlayCanvas, this._overlayUnderlayCtx),
            entitySurface: this.toRenderSurface(this._layerCanvas, this._layerCtx),
            overlayTopSurface: this.toRenderSurface(this._overlayTopCanvas, this._overlayTopCtx),
            particleUnderlaySurface: this.toRenderSurface(this._particleUnderlayCanvas, this._particleUnderlayCtx),
            particleOverlaySurface: this.toRenderSurface(this._particleOverlayCanvas, this._particleOverlayCtx),
            effectSurface: this.toRenderSurface(this._effectCanvas, this._effectCtx),
            worldCtx: this._worldCtx,
            worldCanvas: this._worldCanvas,
            viewport,
            scene,
            cameraFx,
            effectNowMs,
            movementNowMs,
            perfNowMs,
            visibleTiles,
            quality,
            stressTier,
            cameraMoving,
            dirtyChunkKeys,
            passTimingsMs: {},
        };
    }

    private prepareFinalFrame(frame: RenderFrameContext) {
        if (!this._canvas) return;

        frame.finalCtx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        if (this._canvas.style.filter) this._canvas.style.filter = 'none';
    }

    private getRenderQualityProfile(stressTier: RenderStressState['tier'] = this._renderStress.tier): RenderQualityProfile {
        return getResolvedRenderQualityProfile(stressTier);
    }

    private filterTilesToViewport(tiles: Tile[], cameraFx: CameraCompositeState) {
        if (!tiles.length) {
            return tiles;
        }
        return filterAxialItemsToViewport(
            tiles,
            this.getCurrentViewportSnapshot(cameraFx),
            Math.max(this.TILE_DRAW_SIZE * 1.5, 72),
            this._renderConfig,
        );
    }

    private computeFade(dist: number, inner: number, radius: number) {
        const span = Math.max(3, (radius - inner));
        let fade = 1 - Math.max(0, (dist - inner) / span);
        fade = Math.min(1, Math.max(0, fade));
        return fade;
    }

    private getTileOpacity(dist: number, applyCameraFade: boolean) {
        if (!applyCameraFade) return 1;
        const fade = this.computeFade(dist, camera.innerRadius, camera.radius);
        return fade * fade;
    }

    private getSupportAwareTileOpacity(tile: Tile, opacity: number) {
        if (!tile.discovered || tile.terrain === 'towncenter') {
            return opacity;
        }

        if (tile.activationState === 'inactive') {
            return opacity * 0.58;
        }

        if (tile.supportBand === 'fragile') {
            return opacity * 0.94;
        }

        return opacity;
    }

    private getActorOpacity(dist: number, applyCameraFade: boolean) {
        if (!applyCameraFade) return 1;
        return this.computeFade(dist, camera.innerRadius, camera.radius);
    }

    private recordRenderStress(renderCostMs: number) {
        const bounded = Math.max(0.5, Math.min(40, renderCostMs));
        this._renderStress.smoothedFrameMs += (bounded - this._renderStress.smoothedFrameMs) * 0.18;
    }

    private updateRenderStress(visibleTileCount: number, discoveredVisibleCount: number) {
        const smoothedFrameMs = this._renderStress.smoothedFrameMs;
        const mediumDensity = discoveredVisibleCount >= 420 || visibleTileCount >= 1400;
        const highDensity = discoveredVisibleCount >= 620 || visibleTileCount >= 1850;
        const extremeDensity = discoveredVisibleCount >= 820 || visibleTileCount >= 2350;

        if (this._renderStress.tier === 0) {
            if (
                smoothedFrameMs >= 13
                || (smoothedFrameMs >= 10.5 && extremeDensity)
            ) {
                this._renderStress.tier = 2;
            } else if (
                smoothedFrameMs >= 8
                || (smoothedFrameMs >= 6 && highDensity)
                || (smoothedFrameMs >= 5.5 && extremeDensity)
            ) {
                this._renderStress.tier = 1;
            }
        } else if (this._renderStress.tier === 1) {
            if (
                smoothedFrameMs >= 14
                || (smoothedFrameMs >= 11.5 && highDensity)
            ) {
                this._renderStress.tier = 2;
            } else if (
                smoothedFrameMs <= 5
                || (smoothedFrameMs <= 5.4 && !mediumDensity)
            ) {
                this._renderStress.tier = 0;
            }
        } else {
            if (!highDensity && smoothedFrameMs <= 9.5) {
                this._renderStress.tier = mediumDensity ? 1 : 0;
            } else if (smoothedFrameMs <= 7.5) {
                this._renderStress.tier = mediumDensity ? 1 : 0;
            }
        }

        return this._renderStress.tier;
    }

    private toRgba(color: GlowColor, alpha: number) {
        const [r, g, b] = color;
        return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
    }

    private getCanvasCenter() {
        if (!this._canvas) return {cx: 0, cy: 0};
        return {cx: this._canvas.width / this._dpr / 2, cy: this._canvas.height / this._dpr / 2};
    }

    private applyPendingCameraNudges(cameraFx: CameraCompositeState) {
        if (!this._canvas) return;

        const nudges = consumePendingCameraNudges();
        if (!nudges.length) return;

        const width = this._canvas.width / this._dpr;
        const height = this._canvas.height / this._dpr;
        const edgeX = width * 0.24;
        const edgeY = height * 0.2;

        for (const nudge of nudges) {
            const point = axialToPixel(nudge.q, nudge.r);
            const screen = this.projectWorldToScreenPixels(point.x, point.y, cameraFx);
            const leftFactor = screen.x < edgeX ? (1 - (screen.x / edgeX)) : 0;
            const rightFactor = screen.x > (width - edgeX) ? ((screen.x - (width - edgeX)) / edgeX) : 0;
            const topFactor = screen.y < edgeY ? (1 - (screen.y / edgeY)) : 0;
            const bottomFactor = screen.y > (height - edgeY) ? ((screen.y - (height - edgeY)) / edgeY) : 0;
            const edgeFactor = Math.max(leftFactor, rightFactor, topFactor, bottomFactor);
            if (edgeFactor <= 0.02) continue;

            nudgeCameraTowards(nudge.q, nudge.r, 0.07 + (edgeFactor * 0.08 * nudge.strength), 0.9 + (0.8 * nudge.strength));
        }
    }

    private resetCameraCompositeState(nowMs: number = 0) {
        this._cameraFx = {
            ...DEFAULT_CAMERA_COMPOSITE_STATE,
            pulse: 0,
            lastUpdateMs: nowMs,
            lastScreenSpeed: 0,
        };
        this._currentCameraFx = {...DEFAULT_CAMERA_COMPOSITE_STATE};
    }

    private updateCameraCompositeState(nowMs: number): CameraCompositeState {
        if (!graphicsStore.screenShake) {
            this.resetCameraCompositeState(nowMs);
            return {...DEFAULT_CAMERA_COMPOSITE_STATE};
        }

        this._cameraFx = {
            ...DEFAULT_CAMERA_COMPOSITE_STATE,
            offsetX: camera.shakeOffsetX,
            offsetY: camera.shakeOffsetY,
            pulse: 0,
            lastUpdateMs: nowMs,
            lastScreenSpeed: 0,
        };

        return {
            offsetX: this._cameraFx.offsetX,
            offsetY: this._cameraFx.offsetY,
            roll: 0,
            zoom: 1,
            vignetteBiasX: 0,
            vignetteBiasY: 0,
            sheenAlpha: 0,
            speedNorm: 0,
            dirX: 0,
            dirY: 0,
        };
    }

    private applyWorldTransform(ctx: CanvasRenderingContext2D, translateX: number, translateY: number, cameraFx: CameraCompositeState) {
        const {cx, cy} = this.getCanvasCenter();
        ctx.translate(cx + cameraFx.offsetX, cy + cameraFx.offsetY);
        if (cameraFx.roll !== 0) {
            ctx.rotate(cameraFx.roll);
        }
        if (cameraFx.zoom !== 1) {
            ctx.scale(cameraFx.zoom, cameraFx.zoom);
        }
        ctx.translate(-cx, -cy);
        ctx.translate(translateX, translateY);
    }

    private projectRelativeToScreen(relX: number, relY: number, cameraFx: CameraCompositeState = this._currentCameraFx) {
        return HexProjection.projectRelativeToScreen(relX, relY, this.getCurrentViewportSnapshot(cameraFx));
    }

    private projectWorldToScreenPixels(worldX: number, worldY: number, cameraFx: CameraCompositeState = this._currentCameraFx) {
        const viewport = this.getCurrentViewportSnapshot(cameraFx);
        return this.projectRelativeToScreen(worldX - viewport.cameraX, worldY - viewport.cameraY, cameraFx);
    }

    private drawGameplayWorldImpacts(ctx: CanvasRenderingContext2D, nowMs: number, applyCameraFade: boolean) {
        const flashes = getActiveTileFlashes(nowMs);
        for (const flash of flashes) {
            const dist = hexDistance(camera, flash);
            if (dist > camera.radius + 1) continue;
            const opacity = this.getTileOpacity(dist, applyCameraFade);
            const progress = Math.min(1, Math.max(0, (nowMs - flash.startedMs) / flash.durationMs));
            const alpha = (1 - progress) * (1 - progress) * flash.maxAlpha * opacity;
            if (alpha <= 0.01) continue;

            const {x, y} = axialToPixel(flash.q, flash.r);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = flash.color;
            ctx.beginPath();
            this.drawHexPath(ctx, x, y);
            ctx.fill();
            ctx.restore();
        }

        const rings = getActiveImpactRings(nowMs);
        for (const ring of rings) {
            const dist = hexDistance(camera, ring);
            if (dist > camera.radius + 2) continue;
            const opacity = this.getActorOpacity(dist, applyCameraFade);
            const progress = Math.min(1, Math.max(0, (nowMs - ring.startedMs) / ring.durationMs));
            const alpha = (1 - progress) * (1 - progress) * ring.maxAlpha * opacity;
            if (alpha <= 0.01) continue;

            const {x, y} = axialToPixel(ring.q, ring.r);
            const radius = ring.startRadius + ((ring.endRadius - ring.startRadius) * progress);
            ctx.save();
            ctx.globalAlpha = alpha * 0.25;
            ctx.fillStyle = ring.color;
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.42, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ring.color;
            ctx.lineWidth = ring.lineWidth + ((1 - progress) * 1.2);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    private screenToWorld(x: number, y: number) {
        return HexProjection.screenToWorld(x, y, this.getCurrentViewportSnapshot());
    }

    private drawHexPath(ctx: CanvasRenderingContext2D, x: number, y: number) {
        const w = this.TILE_DRAW_SIZE;
        const h = this.TILE_DRAW_SIZE;
        ctx.moveTo(x + 0.5 * w - this.HEX_SIZE, y - this.HEX_SIZE);
        ctx.lineTo(x + w - this.HEX_SIZE, y + 0.25 * h - this.HEX_SIZE);
        ctx.lineTo(x + w - this.HEX_SIZE, y + 0.75 * h - this.HEX_SIZE);
        ctx.lineTo(x + 0.5 * w - this.HEX_SIZE, y + h - this.HEX_SIZE);
        ctx.lineTo(x - this.HEX_SIZE, y + 0.75 * h - this.HEX_SIZE);
        ctx.lineTo(x - this.HEX_SIZE, y + 0.25 * h - this.HEX_SIZE);
        ctx.closePath();
    }

    private worldToScreen(q: number, r: number) {
        return HexProjection.axialToScreen(q, r, this.getCurrentViewportSnapshot(), this._renderConfig);
    }

    private drawHexHighlight(ctx: CanvasRenderingContext2D, q: number, r: number, fill: string | null, stroke: string | null, opacity: number) {
        const {x, y} = axialToPixel(q, r);
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        this.drawHexPath(ctx, x, y);
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    private drawSupportOverlay(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        applyCameraFade: boolean,
        showSupportOverlay: boolean,
    ) {
        for (const tile of tiles) {
            if (!tile.discovered || tile.terrain === 'towncenter') {
                continue;
            }

            const band = tile.supportBand ?? (tile.activationState === 'inactive' ? 'inactive' : null);
            if (!band) {
                continue;
            }

            const shouldDraw = showSupportOverlay || band === 'inactive';
            if (!shouldDraw) {
                continue;
            }

            const dist = hexDistance(camera, tile);
            if (dist > camera.radius + 1) {
                continue;
            }

            const opacity = this.getTileOpacity(dist, applyCameraFade);
            if (opacity <= 0.04) {
                continue;
            }

            let fill: string | null = null;
            let stroke: string | null = null;
            let alpha = opacity;

            switch (band) {
                case 'stable':
                    fill = 'rgba(74, 222, 128, 0.16)';
                    stroke = 'rgba(34, 197, 94, 0.55)';
                    alpha *= 0.42;
                    break;
                case 'fragile':
                    fill = 'rgba(245, 158, 11, 0.18)';
                    stroke = 'rgba(251, 191, 36, 0.72)';
                    alpha *= 0.58;
                    break;
                case 'uncontrolled':
                    fill = 'rgba(100, 116, 139, 0.2)';
                    stroke = 'rgba(148, 163, 184, 0.55)';
                    alpha *= 0.52;
                    break;
                case 'inactive':
                default:
                    fill = showSupportOverlay ? 'rgba(120, 53, 15, 0.34)' : 'rgba(38, 32, 30, 0.42)';
                    stroke = showSupportOverlay ? 'rgba(217, 119, 6, 0.8)' : 'rgba(140, 102, 94, 0.64)';
                    alpha *= showSupportOverlay ? 0.72 : 0.68;
                    break;
            }

            this.drawHexHighlight(ctx, tile.q, tile.r, fill, stroke, alpha);
        }
    }

    private drawReachOutline(
        ctx: CanvasRenderingContext2D,
        boundary: Array<{q: number; r: number}>,
        reachSet: Set<string>,
        alpha: number,
        hovered: boolean = false,
    ) {
        const DELTAS: Array<[number, number]> = [[0,-1],[1,-1],[1,0],[0,1],[-1,1],[-1,0]];

        // Canonical vertex position: centroid of the 3 hex centers sharing the vertex.
        // This ensures adjacent tiles compute identical pixel coords for shared vertices,
        // which is critical for chaining boundary segments into continuous loops.
        const vertexCache = new Map<string, {x: number; y: number}>();
        const getVertex = (q: number, r: number, vi: number): {x: number; y: number} => {
            // Vertex vi is shared by (q,r), neighbor_vi, and neighbor_{(vi+1)%6}
            const [dq1, dr1] = DELTAS[vi]!;
            const [dq2, dr2] = DELTAS[(vi + 1) % 6]!;
            const hexes: Array<[number, number]> = [
                [q, r], [q + dq1, r + dr1], [q + dq2, r + dr2],
            ];
            hexes.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
            const key = `${hexes[0]![0]},${hexes[0]![1]};${hexes[1]![0]},${hexes[1]![1]};${hexes[2]![0]},${hexes[2]![1]}`;
            let pos = vertexCache.get(key);
            if (pos) return pos;
            const c0 = axialToPixel(q, r);
            const c1 = axialToPixel(q + dq1, r + dr1);
            const c2 = axialToPixel(q + dq2, r + dr2);
            pos = { x: (c0.x + c1.x + c2.x) / 3, y: (c0.y + c1.y + c2.y) / 3 };
            vertexCache.set(key, pos);
            return pos;
        };

        // 1. Collect all outer edge segments as pairs of canonical vertex positions
        const segments: Array<[number, number, number, number]> = []; // x1,y1,x2,y2
        for (const bt of boundary) {
            for (let i = 0; i < DELTAS.length; i++) {
                const [dq, dr] = DELTAS[i]!;
                if (reachSet.has(`${bt.q + dq},${bt.r + dr}`)) continue;
                // Edge i goes from vertex (i+5)%6 to vertex i
                const p1 = getVertex(bt.q, bt.r, (i + 5) % 6);
                const p2 = getVertex(bt.q, bt.r, i);
                segments.push([p1.x, p1.y, p2.x, p2.y]);
            }
        }
        if (!segments.length) return;

        // 2. Chain segments into closed loops via point adjacency
        const ptKey = (x: number, y: number) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
        const adj = new Map<string, Array<{x: number; y: number; si: number}>>();
        for (let si = 0; si < segments.length; si++) {
            const [x1, y1, x2, y2] = segments[si]!;
            const k1 = ptKey(x1, y1);
            const k2 = ptKey(x2, y2);
            if (!adj.has(k1)) adj.set(k1, []);
            if (!adj.has(k2)) adj.set(k2, []);
            adj.get(k1)!.push({x: x2, y: y2, si});
            adj.get(k2)!.push({x: x1, y: y1, si});
        }

        const used = new Set<number>();
        const loops: Array<Array<{x: number; y: number}>> = [];
        for (let si = 0; si < segments.length; si++) {
            if (used.has(si)) continue;
            used.add(si);
            const [x1, y1, x2, y2] = segments[si]!;
            const loop: Array<{x: number; y: number}> = [{x: x1, y: y1}, {x: x2, y: y2}];
            let cur = {x: x2, y: y2};
            for (let safety = 0; safety < segments.length; safety++) {
                const neighbors = adj.get(ptKey(cur.x, cur.y));
                if (!neighbors) break;
                let found = false;
                for (const n of neighbors) {
                    if (used.has(n.si)) continue;
                    used.add(n.si);
                    cur = {x: n.x, y: n.y};
                    loop.push(cur);
                    found = true;
                    break;
                }
                if (!found) break;
            }
            // Remove duplicate closing point
            if (loop.length > 2 && ptKey(loop[0]!.x, loop[0]!.y) === ptKey(loop[loop.length - 1]!.x, loop[loop.length - 1]!.y)) {
                loop.pop();
            }
            if (loop.length >= 3) loops.push(loop);
        }

        // 3. Draw each loop with drop shadow, diffuse glow, and core stroke.
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const loop of loops) {
            const expandedLoop = this.offsetLoopOutward(loop, hovered ? 5 : 4);
            if (!this._currentRenderQuality.enableReachGlow) {
                ctx.globalAlpha = alpha * 0.9;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = hovered ? 'rgba(255,230,80,0.72)' : 'rgba(210,190,70,0.58)';
                ctx.lineWidth = hovered ? 2.4 : 1.4;
                this.strokeSmoothLoop(ctx, expandedLoop);
                continue;
            }

            // Dark drop shadow for contrast against tiles
            ctx.globalAlpha = alpha * 0.7;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.strokeStyle = 'rgba(0,0,0,0.01)';
            ctx.lineWidth = hovered ? 8 : 6;
            this.strokeSmoothLoop(ctx, expandedLoop);

            // Diffuse glow pass
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.globalAlpha = alpha;
            ctx.shadowColor = hovered ? 'rgba(220,200,60,0.7)' : 'rgba(180,160,50,0.6)';
            ctx.shadowBlur = hovered ? 24 : 18;
            ctx.strokeStyle = hovered ? 'rgba(220,200,60,0.5)' : 'rgba(180,160,50,0.4)';
            ctx.lineWidth = hovered ? 7 : 5;
            this.strokeSmoothLoop(ctx, expandedLoop);

            // Core line — bright and crisp
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.globalAlpha = alpha * 0.85;
            ctx.strokeStyle = hovered ? 'rgba(255,230,80,0.6)' : 'rgba(210,190,70,0.5)';
            ctx.lineWidth = hovered ? 2.5 : 1.5;
            this.strokeSmoothLoop(ctx, expandedLoop);
        }
        ctx.restore();
    }

    private offsetLoopOutward(pts: Array<{x: number; y: number}>, amount: number) {
        if (pts.length < 3 || amount === 0) {
            return pts;
        }

        const centroid = this.getLoopCentroid(pts);
        return pts.map((point) => {
            const dx = point.x - centroid.x;
            const dy = point.y - centroid.y;
            const length = Math.hypot(dx, dy);

            if (length <= 0.001) {
                return point;
            }

            return {
                x: point.x + ((dx / length) * amount),
                y: point.y + ((dy / length) * amount),
            };
        });
    }

    private getLoopCentroid(pts: Array<{x: number; y: number}>) {
        let signedArea = 0;
        let cx = 0;
        let cy = 0;

        for (let i = 0; i < pts.length; i++) {
            const current = pts[i]!;
            const next = pts[(i + 1) % pts.length]!;
            const cross = (current.x * next.y) - (next.x * current.y);
            signedArea += cross;
            cx += (current.x + next.x) * cross;
            cy += (current.y + next.y) * cross;
        }

        if (Math.abs(signedArea) < 0.001) {
            const average = pts.reduce((acc, point) => {
                acc.x += point.x;
                acc.y += point.y;
                return acc;
            }, { x: 0, y: 0 });

            return {
                x: average.x / pts.length,
                y: average.y / pts.length,
            };
        }

        return {
            x: cx / (3 * signedArea),
            y: cy / (3 * signedArea),
        };
    }

    /** Draw a closed smooth curve through the given points using quadratic beziers. */
    private strokeSmoothLoop(ctx: CanvasRenderingContext2D, pts: Array<{x: number; y: number}>) {
        const n = pts.length;
        if (n < 3) return;
        ctx.beginPath();
        // Start at midpoint between last and first point
        const mx = (pts[n - 1]!.x + pts[0]!.x) / 2;
        const my = (pts[n - 1]!.y + pts[0]!.y) / 2;
        ctx.moveTo(mx, my);
        // Each original point becomes a quadratic control point;
        // anchors are midpoints between consecutive original points.
        for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            const nmx = (pts[i]!.x + pts[next]!.x) / 2;
            const nmy = (pts[i]!.y + pts[next]!.y) / 2;
            ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, nmx, nmy);
        }
        ctx.closePath();
        ctx.stroke();
    }

    private drawTilesAndActors(ctx: CanvasRenderingContext2D, opts: DrawOptions, applyCameraFade: boolean = true, forMotionBlur: boolean = false, cameraFx: CameraCompositeState = this._currentCameraFx, effectNowMs: number = Date.now(), movementNowMs: number = effectNowMs, precomputedVisibleTiles: Tile[] | null = null, includeDiscoveredTerrain: boolean = true, suppressWorldUi: boolean = false) {
        if (!this._canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const {cx, cy} = this.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;
        const cq = Math.round(camera.q);
        const cr = Math.round(camera.r);
        const storyHintTileIds = new Set((opts.storyHintTiles ?? []).map((tile) => tile.id));
        const visibleTiles = precomputedVisibleTiles ?? getTilesInRadius(cq, cr, camera.radius)
            .filter((tile) => isVisibleExplorationTile(tile) || storyHintTileIds.has(tile.id));
        const allowInteractiveHighlights = !forMotionBlur;
        const allowPersistentWorldUi = allowInteractiveHighlights && !suppressWorldUi;
        ctx.save();
        ctx.scale(this._dpr, this._dpr);
        this.applyWorldTransform(ctx, translateX, translateY, cameraFx);

        const overlayRecords: OverlayRecord[] = [];
        this.drawTiles(ctx, overlayRecords, visibleTiles, effectNowMs, applyCameraFade, opts.globalReachTileIds, includeDiscoveredTerrain, suppressWorldUi);
        if (allowPersistentWorldUi) {
            this.drawGameplayWorldImpacts(ctx, effectNowMs, applyCameraFade);
            this.drawSupportOverlay(ctx, visibleTiles, applyCameraFade, opts.showSupportOverlay === true);
        }

        // Determine if selected hero is idle (gate path and selected highlight)
        const selectedHero = selectedHeroId.value ? heroes.find(h => h.id === selectedHeroId.value) || null : null;
        const selectedHeroIdle = selectedHero ? this.isHeroIdle(selectedHero, movementNowMs) : false;
        const selectedHeroWalking = selectedHero ? this.isHeroWalking(selectedHero, movementNowMs) : false;

        // Path highlight only when selected hero idle
        if (allowInteractiveHighlights && (selectedHeroIdle || selectedHeroWalking) && opts.pathCoords.length) {
            const first = opts.pathCoords[0];
            const drawPath = selectedHero && first && (first.q !== selectedHero.q || first.r !== selectedHero.r)
                ? [{q: selectedHero.q, r: selectedHero.r}, ...opts.pathCoords]
                : opts.pathCoords;

            for (const pc of drawPath) {
                const dist = hexDistance(camera, pc);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                if (hexDistance(camera, pc) > camera.radius + 1) continue;
                const last = pc === drawPath[drawPath.length - 1];
                this.drawHexHighlight(ctx, pc.q, pc.r,
                    last ? 'rgba(216,244,255,0.0)' : 'rgba(250,253,255,0.0)',
                    last ? '#dbedff' : '#daf0ff',
                    opacity);
            }
        } else if (allowInteractiveHighlights && selectedHero && selectedHero.movement) {
            // Movement in progress: show remaining planned path & target tile
            const m = selectedHero.movement;
            // Find current index within path (hero.q/r should be some path entry or origin before first step)
            let currentIndex = m.path.findIndex(p => p.q === selectedHero.q && p.r === selectedHero.r);
            if (currentIndex < 0) {
                // If hero at origin before first step, treat as -1 so we show full path
                if (selectedHero.q === m.origin.q && selectedHero.r === m.origin.r) currentIndex = -1;
            }
            const remaining = m.path.slice(Math.max(0, currentIndex + 1));
            if (remaining.length) {
                for (let i = 0; i < remaining.length; i++) {
                    const pc = remaining[i]!;
                    if (hexDistance(camera, pc) > camera.radius + 1) continue;
                    const dist = hexDistance(camera, pc);
                    const opacity = (() => {
                        const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                        return f * f;
                    })();
                    const isLast = i === remaining.length - 1; // destination/target
                    // Slightly different color scheme for active movement path
                    this.drawHexHighlight(ctx, pc.q, pc.r,
                        isLast ? 'rgba(132,196,255,0.0)' : 'rgba(132,196,255,0.0)',
                        isLast ? '#6fb8ff' : '#9fd8ff',
                        opacity);
                }
            } else {
                // No remaining steps but movement object exists (edge case right before arrival): highlight target explicitly if in radius
                const tgt = m.target;
                if (hexDistance(camera, tgt) <= camera.radius + 1) {
                    const dist = hexDistance(camera, tgt);
                    const opacity = (() => {
                        const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                        return f * f;
                    })();
                    this.drawHexHighlight(ctx, tgt.q, tgt.r, 'rgba(132,196,255,0.0)', '#9fd8ff', opacity);
                }
            }
        }

        // Hover highlight
        if (allowInteractiveHighlights && opts.hoveredTile) {
            const ht = opts.hoveredTile;
            if (hexDistance(camera, ht) <= camera.radius + 1) {
                const dist = hexDistance(camera, ht);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                const inReach = opts.hoveredTileInReach !== false;
                const stroke = inReach ? '#d0b23d' : '#6a4a4a';
                const fill = inReach ? 'rgba(255, 227, 122, 0)' : 'rgba(100, 60, 60, 0)';
                this.drawHexHighlight(ctx, ht.q, ht.r, fill, stroke, opacity);
            }
        }

        // Existing task menu tile highlight retained; add cluster border if provided
        if (allowPersistentWorldUi && opts.taskMenuTile && opts.clusterBoundaryTiles && opts.clusterBoundaryTiles.length) {
            const clusterSet = opts.clusterTileIds || new Set<string>();
            // Draw only outer edges (outline) for the cluster
            for (const bt of opts.clusterBoundaryTiles) {
                if (hexDistance(camera, bt) > camera.radius + 1) continue;
                const dist = hexDistance(camera, bt);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                // Compute corners for this hex
                const {x: cx, y: cy} = axialToPixel(bt.q, bt.r);
                const w = this.TILE_DRAW_SIZE;
                const h = this.TILE_DRAW_SIZE;
                const corners: Array<[number, number]> = [
                    [cx + 0.5 * w - this.HEX_SIZE, cy - this.HEX_SIZE], // 0 top
                    [cx + w - this.HEX_SIZE, cy + 0.25 * h - this.HEX_SIZE], // 1 upper-right
                    [cx + w - this.HEX_SIZE, cy + 0.75 * h - this.HEX_SIZE], // 2 lower-right
                    [cx + 0.5 * w - this.HEX_SIZE, cy + h - this.HEX_SIZE], // 3 bottom
                    [cx - this.HEX_SIZE, cy + 0.75 * h - this.HEX_SIZE], // 4 lower-left
                    [cx - this.HEX_SIZE, cy + 0.25 * h - this.HEX_SIZE], // 5 upper-left
                ];
                const nm = bt.neighbors;
                const SIDE_ORDER = ['a','b','c','d','e','f'] as const;
                for (let i = 0; i < SIDE_ORDER.length; i++) {
                    const side = SIDE_ORDER[i]!;
                    const nTile = nm ? nm[side] : null;
                    const outside = !nTile || !nTile.discovered || !nTile.terrain || !clusterSet.has(nTile.id);
                    if (!outside) continue; // skip interior edge
                    // Rotate edge mapping one step CCW: use previous corner -> current corner
                    const p1 = corners[(i + 5) % 6];
                    const p2 = corners[i];
                    if (!p1 || !p2) continue;
                    ctx.save();
                    ctx.globalAlpha = opacity;
                    ctx.beginPath();
                    ctx.moveTo(p1[0], p1[1]);
                    ctx.lineTo(p2[0], p2[1]);
                    ctx.strokeStyle = 'rgba(255,201,77,0.95)';
                    ctx.lineWidth = 3;
                    ctx.lineJoin = 'round';
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // Hover highlight
        if (allowPersistentWorldUi && opts.taskMenuTile) {
            const ht = opts.taskMenuTile;
            if (hexDistance(camera, ht) <= camera.radius + 1) {
                const dist = hexDistance(camera, ht);
                const opacity = (() => {
                    const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                    return f * f;
                })();
                this.drawHexHighlight(ctx, ht.q, ht.r, 'rgba(163,255,61,0.00)', '#91fa31', opacity);
            }
        }

        if (allowPersistentWorldUi && this._currentRenderQuality.enableParticles) {
            this.updateAndDrawParticles(ctx, effectNowMs, visibleTiles, applyCameraFade);
        } else if (allowInteractiveHighlights && this._particles.length) {
            this._particles.length = 0;
        }

        // Reach outline — rendered on top of tiles, particles, and highlights.
        // Draws smooth bezier curves through hex boundary corners.
        if (allowPersistentWorldUi) {
            // Global reach (all TCs combined) — always visible
            if (opts.globalReachBoundary && opts.globalReachBoundary.length) {
                const reachSet = opts.globalReachTileIds || new Set<string>();
                this.drawReachOutline(ctx, opts.globalReachBoundary, reachSet, 0.45, false);
            }
        }

        // Heroes & overlays combined layering
        this.drawHeroes(ctx, forMotionBlur ? null : opts.hoveredHero, overlayRecords, applyCameraFade, movementNowMs);
        if (allowPersistentWorldUi) {
            this.drawTaskIndicators(ctx, visibleTiles, applyCameraFade, forMotionBlur ? null : opts.hoveredTile);
        }
        ctx.restore();

        if (allowPersistentWorldUi) {
            ctx.save();
            ctx.scale(this._dpr, this._dpr);
            this.drawTextIndicators(ctx, effectNowMs, cameraFx);
            ctx.restore();
        }
    }

    private drawTiles(
        ctx: CanvasRenderingContext2D,
        overlayRecords: OverlayRecord[],
        tiles: Tile[],
        now: number,
        applyCameraFade: boolean = true,
        reachTileIds?: Set<string>,
        includeDiscoveredTerrain: boolean = true,
        suppressWorldUi: boolean = false,
    ) {
        return ;
        for (const t of tiles) {
            const dist = hexDistance(camera, t);
            const opacity = this.getSupportAwareTileOpacity(t, this.getTileOpacity(dist, applyCameraFade));

            if (t.discovered) {
                if (includeDiscoveredTerrain) {
                    this.drawTile(t, now, ctx, opacity);
                }
            } else {
                const inReach = !reachTileIds || reachTileIds.has(`${t.q},${t.r}`);
                this.drawUndiscoveredTile(ctx, opacity, t, inReach);
            }

            const {x, y} = axialToPixel(t.q, t.r);

            // collect optional overlay second layer (only for discovered tiles)
            if (t.discovered) {
                const overlayKey = this.shouldRenderTileOverlayInline(t) ? null : this.getTileOverlayKey(t);
                if (overlayKey) {
                    const ovImg = this._images[overlayKey];
                    if (ovImg) {
                        const off = this.getTileOverlayOffset(t);
                        const baseKey = this.getTileImageKey(t) ?? t.terrain ?? 'plains';
                        const sourceWidth = ovImg.naturalWidth || ovImg.width || this.TILE_DRAW_SIZE;
                        const sourceHeight = ovImg.naturalHeight || ovImg.height || this.TILE_DRAW_SIZE;
                        const drawWidth = this.TILE_DRAW_SIZE;
                        const drawHeight = Math.round((sourceHeight / sourceWidth) * drawWidth);
                        const overlaySource = this.buildShadedTileOverlayCanvas(
                            t,
                            baseKey,
                            overlayKey,
                            ovImg,
                            drawWidth,
                            drawHeight,
                        ) ?? ovImg;
                        // store axial coords for later layering sort (r,q)
                        overlayRecords.push({
                            source: overlaySource,
                            x: x - this.HEX_SIZE + off.x,
                            y: y - this.HEX_SIZE + off.y,
                            width: drawWidth,
                            height: drawHeight,
                            q: t.q,
                            r: t.r,
                            opacity,
                            z: 0,
                        });
                    }
                }

                const buildingOverlayKey = this.getBuildingOverlayKey(t);
                if (buildingOverlayKey) {
                    const buildingImg = this._images[buildingOverlayKey];
                    if (buildingImg) {
                        const off = this.getBuildingOverlayOffset(t);
                        const sourceWidth = buildingImg.naturalWidth || buildingImg.width || this.TILE_DRAW_SIZE;
                        const sourceHeight = buildingImg.naturalHeight || buildingImg.height || this.TILE_DRAW_SIZE;
                        const drawWidth = this.TILE_DRAW_SIZE;
                        const drawHeight = Math.round((sourceHeight / sourceWidth) * drawWidth);
                        overlayRecords.push({
                            source: buildingImg,
                            x: x - this.HEX_SIZE + off.x,
                            y: y + this.HEX_SIZE - drawHeight + off.y,
                            width: drawWidth,
                            height: drawHeight,
                            q: t.q,
                            r: t.r,
                            opacity,
                            z: 1,
                        });
                    }
                }
            }

            // active task highlight overlay (after drawing base tile)
            const activeTasksForTile = suppressWorldUi ? null : taskStore.tasksByTile[t.id];
            const scoutSurveyProgress = suppressWorldUi ? null : this.getScoutSurveyProgressForTile(t, now);
            if (activeTasksForTile) {
                // If any active task instances are still incomplete, draw a subtle pulsating border
                let chosenTask: TaskInstance | null = null; // for progress bar
                for (const taskId of Object.values(activeTasksForTile)) {
                    const inst = taskStore.taskIndex[taskId];
                    if (inst && !inst.completedMs) {

                        // select task with highest progress ratio (tie break earliest createdMs)
                        const ratio = inst.requiredXp > 0 ? (inst.progressXp / inst.requiredXp) : 0;
                        if (!chosenTask) {
                            chosenTask = inst;
                        } else {
                            const chosenRatio = chosenTask.requiredXp > 0 ? (chosenTask.progressXp / chosenTask.requiredXp) : 0;
                            if (ratio > chosenRatio || (Math.abs(ratio - chosenRatio) < 0.0001 && inst.createdMs < chosenTask.createdMs)) {
                                chosenTask = inst;
                            }
                        }
                    }
                }

                if (chosenTask) {
                    const pulse = (Math.sin(now / 400) + 1) / 2; // 0..1
                    this.drawHexHighlight(ctx, t.q, t.r, null,'rgba(0, 225, 255, 1)',  opacity * (0.5 + 0.4 * pulse));

                    if (chosenTask && opacity > 0.05) {
                        if(chosenTask.active) {
                            const progressRatioRaw = chosenTask.requiredXp > 0 ? (chosenTask.progressXp / chosenTask.requiredXp) : 0;
                            this.drawProgressBar(ctx, t, Math.min(1, Math.max(0, progressRatioRaw)), 'rgba(255,223,12,0.9)', opacity)
                        } else {
                            // Progress is total required resources vs. collected resources
                            const totalRequired = chosenTask.requiredResources?.reduce((sum, req) => sum + req.amount, 0) || 0;
                            const totalCollected = chosenTask.collectedResources?.reduce((sum, col) => sum + col.amount, 0) || 0;
                            const progressRatioRaw = totalRequired > 0 ? (totalCollected / totalRequired) : 0;
                            this.drawProgressBar(ctx, t, Math.min(1, Math.max(0, progressRatioRaw)), 'rgba(129,134,154,0.9)', opacity)
                        }
                    }
                }
            }
            if (!activeTasksForTile && scoutSurveyProgress !== null) {
                const pulse = (Math.sin(now / 400) + 1) / 2;
                this.drawHexHighlight(ctx, t.q, t.r, null, 'rgba(244, 114, 182, 1)', opacity * (0.5 + 0.4 * pulse));
                if (opacity > 0.05) {
                    this.drawProgressBar(ctx, t, scoutSurveyProgress, 'rgba(244,114,182,0.92)', opacity);
                }
            }
        }
    }

    private getScoutSurveyProgressForTile(tile: Tile, now: number) {
        let bestProgress: number | null = null;

        for (const hero of heroes) {
            const progress = getScoutSurveyProgress(hero, tile.id, now);
            if (progress === null) {
                continue;
            }

            bestProgress = bestProgress === null ? progress : Math.max(bestProgress, progress);
        }

        return bestProgress;
    }

    private drawProgressBar(ctx: CanvasRenderingContext2D, t: Tile, progressRatio: number, fillStyle: string, opacity: number) {
        // Tile bounds
        const {x, y} = axialToPixel(t.q, t.r);
        const tileLeft = x - this.HEX_SIZE;
        const tileTop = y - this.HEX_SIZE;
        const tileWidth = this.TILE_DRAW_SIZE;
        const tileHeight = this.TILE_DRAW_SIZE;
        // Bar dimensions
        const barWidth = Math.round(tileWidth * 0.55);
        const barHeight = 7; // small bar
        const marginBottom = 8; // space from bottom edge
        let barX = x - barWidth / 2; // center
        const barY = tileTop + tileHeight - marginBottom - barHeight;
        // Clamp horizontally within tile
        const minX = tileLeft + 4;
        const maxX = tileLeft + tileWidth - barWidth - 4;
        if (barX < minX) barX = minX;
        if (barX > maxX) barX = maxX;

        ctx.save();
        ctx.globalAlpha = opacity; // integrate camera fade
        // Background with rounded corners
        const radius = 16;
        this.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
        ctx.fillStyle = 'rgba(8,24,36,0.55)';
        ctx.fill();
        // Border
        ctx.strokeStyle = fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Fill portion (rounded left, full rounding if complete)
        const filled = Math.max(1, Math.round(barWidth * progressRatio)); // ensure at least 1px if >0
        if (progressRatio > 0) {
            ctx.fillStyle = fillStyle;
            if (progressRatio >= 0.999) {
                this.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
            } else {
                this.drawLeftRoundedRect(ctx, barX, barY, filled, barHeight, radius);
            }
            ctx.fill();
        }
        ctx.restore();
    }

    private drawTaskIndicators(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        applyCameraFade: boolean = true,
        hoveredTile: Tile | null = null,
    ) {
        for (const t of tiles) {
            const dist = hexDistance(camera, t);
            const opacity = this.getTileOpacity(dist, applyCameraFade);

            if (canUseWarehouseAtTile(t)) {
                this.drawStorageIndicator(ctx, t, opacity, hoveredTile);
            }

            const activeTasksForTile = taskStore.tasksByTile[t.id];
            if (activeTasksForTile) {
                for (const taskId of Object.values(activeTasksForTile)) {
                    const inst = taskStore.taskIndex[taskId];
                    if (inst && !inst.completedMs) {
                        this.drawResourceIndicator(ctx, t, inst, opacity);
                    }
                }
            }
        }
    }

    private drawStorageIndicator(ctx: CanvasRenderingContext2D, tile: Tile, opacity: number, hoveredTile: Tile | null = null) {
        const storageKind = getStorageKindForTile(tile);
        if (!storageKind) return;

        const isHoveredStorageTile = hoveredTile?.id === tile.id && !!getStorageKindForTile(hoveredTile);
        const currentAlpha = this._storageIndicatorAlphaByTileId.get(tile.id) ?? 0;
        const targetAlpha = isHoveredStorageTile ? 1 : 0;
        const lerpSpeed = isHoveredStorageTile ? 0.24 : 0.18;
        const nextAlpha = currentAlpha + ((targetAlpha - currentAlpha) * lerpSpeed);

        if (nextAlpha <= 0.02 && targetAlpha === 0) {
            this._storageIndicatorAlphaByTileId.delete(tile.id);
            return;
        }

        this._storageIndicatorAlphaByTileId.set(tile.id, nextAlpha);

        const usedCapacity = getStorageUsedCapacity(tile.id);
        const freeCapacity = getStorageFreeCapacity(tile.id);
        const capacity = Math.max(usedCapacity + freeCapacity, getStorageCapacity(storageKind));
        if (capacity <= 0) return;

        const snapshot = storageInventories[tile.id];
        const topResources = snapshot
            ? (Object.entries(snapshot.resources) as Array<[ResourceType, number]>)
                .filter(([, amount]) => amount > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
            : [];

        const textParts = [`${usedCapacity}/${capacity}`];
        if (topResources.length) {
            textParts.push(topResources.map(([type, amount]) => `${this.RESOURCE_ICON_MAP[type] ?? '?'}${amount}`).join(' '));
        }
        const text = textParts.join('  ');

        const {x, y} = axialToPixel(tile.q, tile.r);
        const accent = usedCapacity >= capacity
            ? 'rgba(248, 113, 113, 0.95)'
            : storageKind === 'towncenter'
                ? 'rgba(245, 204, 96, 0.95)'
                : storageKind === 'depot'
                    ? 'rgba(125, 211, 252, 0.95)'
                    : 'rgba(226, 232, 240, 0.95)';

        ctx.save();
        ctx.font = '8px \'Press Start 2P\', \'VT323\', \'Courier New\', monospace';
        const metrics = ctx.measureText(text);
        const width = Math.max(44, metrics.width + 14);
        const height = 17;
        const drawX = x - (width / 2);
        const drawY = y - this.HEX_SIZE - 19;

        ctx.globalAlpha = opacity * nextAlpha * 0.72;
        this.drawRoundedRect(ctx, drawX, drawY, width, height, 6);
        ctx.fillStyle = 'rgba(7, 16, 29, 0.88)';
        ctx.fill();

        ctx.globalAlpha = opacity * nextAlpha * 0.95;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.globalAlpha = opacity * nextAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(246, 250, 255, 0.94)';
        ctx.fillText(text, x, drawY + (height / 2) + 0.5);
        ctx.restore();
    }

    private updateAndDrawParticles(ctx: CanvasRenderingContext2D, now: number, tiles: Tile[], applyCameraFade: boolean) {
        if (!this._canvas) return;

        if (!graphicsStore.particles) {
            consumePendingTerrainBursts();
            this.resetParticles(now);
            return;
        }

        const deltaMs = Math.max(0, Math.min(48, now - this._lastParticleUpdateMs));
        this._lastParticleUpdateMs = now;

        this.updateParticles(deltaMs, now);
        this.spawnGameplayBursts(now);
        this.spawnAmbientParticles(now, tiles);
        this.spawnTaskParticles(now, tiles);
        this.spawnHeroTrailParticles(now);

        if (!this._particles.length) return;

        const canvasWidth = this._canvas.width / this._dpr;
        const canvasHeight = this._canvas.height / this._dpr;
        const drawableParticles: Array<{ particle: Particle; alpha: number; progress: number }> = [];

        for (const particle of this._particles) {
            const age = now - particle.bornMs;
            if (age >= particle.lifeMs) continue;

            const {x: screenX, y: screenY} = this.projectWorldToScreenPixels(particle.x, particle.y);
            if (screenX < -40 || screenX > canvasWidth + 40 || screenY < -40 || screenY > canvasHeight + 40) continue;

            const edgeFade = this.getParticleEdgeFade(screenX, screenY, applyCameraFade);
            if (edgeFade <= 0.01) continue;

            const progress = age / particle.lifeMs;
            const fade = particle.renderMode === 'smoke'
                ? (1 - (progress * 0.58))
                : (1 - (progress * 0.82));
            const flicker = particle.renderMode === 'smoke'
                ? 0.97 + (Math.sin((now + particle.twinkle) / 280) * 0.05)
                : 0.9 + (Math.sin((now + particle.twinkle) / 120) * 0.22);
            const alpha = particle.alpha * fade * flicker * edgeFade;
            if (alpha <= 0.02) continue;

            drawableParticles.push({ particle, alpha, progress });
        }

        if (!drawableParticles.length) return;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if (shouldUseParticleGlowPass()) {
            ctx.globalCompositeOperation = 'screen';
            for (const { particle, alpha } of drawableParticles) {
                if (particle.renderMode === 'smoke') continue;
                if (particle.shape === 'ring') continue;
                const glowRadius = particle.size * particle.glow;
                const glow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowRadius);
                glow.addColorStop(0, this.toRgba(particle.color, alpha * 1.25));
                glow.addColorStop(0.4, this.toRgba(particle.color, alpha * 0.68));
                glow.addColorStop(1, this.toRgba(particle.color, 0));
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        for (const { particle, alpha, progress } of drawableParticles) {
            if (particle.shape === 'cloud') {
                this.drawSmokeParticle(ctx, particle, alpha, progress);
                continue;
            }

            if (particle.shape === 'ring') {
                // Expanding ripple ring
                const maxRadius = particle.size * (particle.growth ?? 4);
                const radius = particle.size + (maxRadius - particle.size) * progress;
                const ringAlpha = alpha * (1.18 - (progress * 0.52));
                const lineWidth = Math.max(0.55, 1.75 * (1 - progress * 0.62));

                const ringGlow = ctx.createRadialGradient(
                    particle.x,
                    particle.y,
                    Math.max(0, radius * 0.62),
                    particle.x,
                    particle.y,
                    radius + (particle.size * 1.7),
                );
                ringGlow.addColorStop(0, this.toRgba(particle.color, 0));
                ringGlow.addColorStop(0.62, this.toRgba(particle.color, ringAlpha * 0.28));
                ringGlow.addColorStop(1, this.toRgba(particle.color, 0));
                ctx.fillStyle = ringGlow;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, radius + (particle.size * 1.7), 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = this.toRgba([255, 255, 255], ringAlpha * 0.18);
                ctx.lineWidth = lineWidth + 0.85;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = this.toRgba(particle.color, ringAlpha);
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }

            const coreAlpha = Math.min(1, alpha * (particle.shape === 'diamond' ? 0.98 : 0.78));
            ctx.fillStyle = this.toRgba(particle.color, coreAlpha);
            if (particle.shape === 'diamond') {
                ctx.save();
                ctx.translate(particle.x, particle.y);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-particle.size * 0.42, -particle.size * 0.42, particle.size * 0.84, particle.size * 0.84);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size * 0.48, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    private drawSmokeParticle(
        ctx: CanvasRenderingContext2D,
        particle: Particle,
        alpha: number,
        progress: number,
    ) {
        const growth = particle.growth ?? 1.45;
        const radius = particle.size * (0.88 + (progress * growth));
        const drift = Math.sin((particle.twinkle + (progress * 1200)) / 230) * radius * 0.08;
        const puffs = [
            { ox: (-radius * 0.36) + drift, oy: radius * 0.1, rx: radius * 0.72, ry: radius * 0.56, a: 0.72 },
            { ox: drift * -0.3, oy: -radius * 0.16, rx: radius * 0.94, ry: radius * 0.7, a: 0.92 },
            { ox: (radius * 0.34) - (drift * 0.5), oy: radius * 0.04, rx: radius * 0.66, ry: radius * 0.5, a: 0.68 },
        ];

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        for (const puff of puffs) {
            const puffAlpha = alpha * puff.a;
            const puffX = particle.x + puff.ox;
            const puffY = particle.y + puff.oy;
            const gradient = ctx.createRadialGradient(puffX, puffY, 0, puffX, puffY, Math.max(puff.rx, puff.ry));
            gradient.addColorStop(0, this.toRgba(particle.color, puffAlpha));
            gradient.addColorStop(0.62, this.toRgba(particle.color, puffAlpha * 0.52));
            gradient.addColorStop(1, this.toRgba(particle.color, 0));
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(puffX, puffY, puff.rx, puff.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    private resetParticles(now: number) {
        this._particles = [];
        this._nextBirdFlockSpawnMs = 0;
        this._heroTrailEmitMs.clear();
        this._taskParticleEmitMs.clear();
        this._lastParticleUpdateMs = now;
    }

    private updateParticles(deltaMs: number, now: number) {
        this.pruneDisabledSkyAmbientParticles();
        if (!deltaMs && !this._particles.length) return;

        const deltaSeconds = deltaMs / 1000;
        this._particles = this._particles.filter((particle) => {
            if ((now - particle.bornMs) >= particle.lifeMs) return false;

            particle.x += particle.vx * deltaSeconds;
            particle.y += particle.vy * deltaSeconds;
            const dragFactor = Math.max(0, 1 - (particle.drag * deltaSeconds));
            particle.vx *= dragFactor;
            particle.vy = (particle.vy + (particle.gravity * deltaSeconds)) * dragFactor;
            return true;
        });
    }

    private spawnGameplayBursts(now: number) {
        const bursts = consumePendingTerrainBursts();
        if (!bursts.length) return;

        for (const burst of bursts) {
            const terrain = burst.terrain ?? tileIndex[axialKey(burst.q, burst.r)]?.terrain ?? null;
            const origin = axialToPixel(burst.q, burst.r);
            const intensity = burst.intensity;
            const count = burst.kind === 'complete' ? 10 : 6;
            const glowScale = burst.kind === 'complete' ? 3.4 : 2.7;
            let colors: GlowColor[] = [[210, 230, 255], [148, 210, 255], [255, 235, 180]];

            if (terrain === 'forest' || terrain === 'plains' || terrain === 'grain') {
                colors = [[202, 255, 176], [255, 233,171], [160, 232, 159]];
            } else if (terrain === 'mountain' || terrain === 'dirt') {
                colors = [[221, 193, 150], [182, 166, 151], [210, 225, 255]];
            } else if (terrain === 'water' || terrain === 'towncenter') {
                colors = [[140, 214, 255], [226, 247, 255], [255, 226, 163]];
            } else if (terrain === 'snow') {
                colors = [[255, 255, 255], [218, 241, 255], [186, 219, 255]];
            } else if (terrain === 'vulcano') {
                colors = [[255, 205, 126], [255, 150, 92], [255, 103, 65]];
            }

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + this.randomBetween(-0.2, 0.2);
                const speed = this.randomBetween(34, 72) * intensity;
                this.emitParticle({
                    x: origin.x + this.randomBetween(-8, 8),
                    y: origin.y + this.randomBetween(-8, 8),
                    vx: Math.cos(angle) * speed,
                    vy: (Math.sin(angle) * speed) - this.randomBetween(14, 34),
                    size: this.randomBetween(1.5, 2.8) * Math.min(1.5, intensity),
                    bornMs: now,
                    lifeMs: this.randomBetween(440, 860),
                    alpha: this.randomBetween(0.18, 0.34) * Math.min(1.3, intensity),
                    glow: this.randomBetween(glowScale - 0.5, glowScale + 0.45),
                    color: this.pickGlow(colors),
                    gravity: 22,
                    drag: 1.5,
                    twinkle: this.randomBetween(0, 1000),
                    shape: Math.random() > 0.45 ? 'diamond' : 'circle',
                });
            }
        }
    }

    private spawnAmbientParticles(now: number, tiles: Tile[]) {
        if (this._particles.length >= this.getMaxParticleBudget() || !tiles.length) return;

        this.spawnSkyAmbientParticles(now, tiles);

        const attempts = Math.min(
            6,
            Math.max(2, Math.round((tiles.length / 18) * this.AMBIENT_PARTICLE_DENSITY)),
        );
        for (let i = 0; i < attempts; i++) {
            if (this._particles.length >= this.getMaxParticleBudget()) return;

            const tile = tiles[Math.floor(Math.random() * tiles.length)];
            if (!tile?.discovered || !tile.terrain) continue;
            this.spawnAmbientParticleForTile(tile, now);
        }
    }

    private shouldSpawnAmbientParticle(baseChance: number) {
        return Math.random() <= Math.max(0, Math.min(1, baseChance * this.AMBIENT_PARTICLE_DENSITY));
    }

    private spawnSkyAmbientParticles(now: number, tiles: Tile[]) {
        if (this._currentRenderQuality.name === 'low') return;
        const birdsEnabled = this.areBirdAmbientParticlesEnabled();
        if (!birdsEnabled) return;
        if ((this.getMaxParticleBudget() - this._particles.length) < 6) return;

        const discoveredTiles = tiles.filter((tile) => tile.discovered && !!tile.terrain);
        if (discoveredTiles.length < 10) return;

        const bounds = this.getSkyAmbientBounds(discoveredTiles);
        if (!bounds) return;

        if (birdsEnabled && this._nextBirdFlockSpawnMs <= now && this.spawnBirdFlock(now, discoveredTiles, bounds)) {
            const [minDelay, maxDelay] = this._currentRenderQuality.expensiveAtmosphere
                ? [3400, 5600]
                : [5200, 7600];
            this._nextBirdFlockSpawnMs = now + this.randomBetween(minDelay, maxDelay);
        }
    }

    private getSkyAmbientBounds(tiles: Tile[]) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (const tile of tiles) {
            const { x, y } = axialToPixel(tile.q, tile.r);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
            return null;
        }

        return {
            minX,
            maxX,
            minY,
            maxY,
            width: Math.max(this.TILE_DRAW_SIZE * 2, maxX - minX),
        };
    }

    private spawnBirdFlock(
        now: number,
        tiles: Tile[],
        bounds: { minX: number; maxX: number; minY: number; maxY: number; width: number },
    ) {
        const availableBudget = this.getMaxParticleBudget() - this._particles.length;
        if (availableBudget <= 0) return false;

        const anchorTile = tiles[Math.floor(Math.random() * tiles.length)];
        if (!anchorTile) return false;

        const anchor = axialToPixel(anchorTile.q, anchorTile.r);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const baseSpeed = this.randomBetween(34, 64);
        const flockSize = Math.min(
            availableBudget,
            this._currentRenderQuality.expensiveAtmosphere
                ? Math.round(this.randomBetween(2, 6))
                : Math.round(this.randomBetween(2, 4)),
        );
        const travelDistance = bounds.width + this.randomBetween(220, 360);
        const colors: GlowColor[] = [[10, 10, 10], [18, 18, 18], [26, 24, 24], [38, 34, 34]];
        let emitted = 0;

        for (let i = 0; i < flockSize; i++) {
            if (this._particles.length >= this.getMaxParticleBudget()) break;

            const speed = baseSpeed * this.randomBetween(0.88, 1.16);
            const trailOffset = i * this.randomBetween(16, 28);
            this.emitParticle({
                x: direction > 0
                    ? bounds.minX - this.randomBetween(36, 92) - trailOffset
                    : bounds.maxX + this.randomBetween(36, 92) + trailOffset,
                y: anchor.y - this.randomBetween(56, 124) + this.randomBetween(-18, 18),
                vx: direction * speed,
                vy: this.randomBetween(-2.6, 2.4),
                size: this.randomBetween(4.8, 12.8),
                bornMs: now,
                lifeMs: Math.max(2800, ((travelDistance + trailOffset) / speed) * 1000),
                alpha: this.randomBetween(0.14, 0.46),
                glow: 0,
                color: this.pickGlow(colors),
                gravity: 0,
                drag: 0.02,
                twinkle: this.randomBetween(0, 2000),
                shape: 'bird',
                layer: 'overlay',
                wobbleX: this.randomBetween(8, 22),
                wobbleY: this.randomBetween(5, 14),
                wobbleSpeed: this.randomBetween(0.72, 1.32),
                flapSpeed: this.randomBetween(0.8, 1.5),
            });
            emitted += 1;
        }

        return emitted > 0;
    }

    private spawnAmbientParticleForTile(tile: Tile, now: number) {
        const {x, y} = axialToPixel(tile.q, tile.r);
        const key = this.getTileImageKey(tile) ?? tile.terrain ?? '';

        if (tile.terrain === 'water' || key.startsWith('water')) {
            if (!this.shouldSpawnAmbientParticle(0.42)) return;
            const colors: GlowColor[] = [[208, 247, 255], [165, 230, 255], [130, 210, 255]];
            this.emitParticle({
                x: x + this.randomBetween(-18, 18),
                y: y + this.randomBetween(-10, 10),
                vx: 0,
                vy: 0,
                size: this.randomBetween(1.05, 1.75),
                bornMs: now,
                lifeMs: this.randomBetween(1400, 2400),
                alpha: this.randomBetween(0.28, 0.46),
                glow: 1.35,
                color: this.pickGlow(colors),
                gravity: 0,
                drag: 0,
                twinkle: this.randomBetween(0, 1000),
                shape: 'ring',
                growth: this.randomBetween(3.5, 5.5),
            });
            return;
        }

        if (tile.terrain === 'towncenter') {
            if (!this.shouldSpawnAmbientParticle(0.46)) return;
            const colors: GlowColor[] = [[255, 228, 168], [255, 188, 112], [188, 247, 218]];
            this.emitParticle({
                x: x + this.randomBetween(-14, 14),
                y: y + this.randomBetween(-8, 6),
                vx: this.randomBetween(-6, 6),
                vy: this.randomBetween(-20, -6),
                size: this.randomBetween(1.3, 2.2),
                bornMs: now,
                lifeMs: this.randomBetween(900, 1600),
                alpha: this.randomBetween(0.16, 0.3),
                glow: this.randomBetween(2.3, 3.4),
                color: this.pickGlow(colors),
                gravity: -4,
                drag: 0.9,
                twinkle: this.randomBetween(0, 900),
                shape: Math.random() > 0.4 ? 'diamond' : 'circle',
            });
            return;
        }

        if (tile.terrain === 'vulcano') {
            this.spawnVolcanoAmbientParticles(x, y, now);
            return;
        }

        if (tile.terrain === 'snow' || key.startsWith('snow')) {
            if (!this.shouldSpawnAmbientParticle(0.42)) return;
            const colors: GlowColor[] = [[255, 255, 255], [216, 239, 255], [196, 228, 255]];
            this.emitParticle({
                x: x + this.randomBetween(-20, 20),
                y: y - this.randomBetween(6, 26),
                vx: this.randomBetween(-8, 8),
                vy: this.randomBetween(8, 18),
                size: this.randomBetween(1.4, 2.2),
                bornMs: now,
                lifeMs: this.randomBetween(1500, 2400),
                alpha: this.randomBetween(0.18, 0.34),
                glow: this.randomBetween(2.1, 3.2),
                color: this.pickGlow(colors),
                gravity: 6,
                drag: 0.45,
                twinkle: this.randomBetween(0, 800),
                shape: 'circle',
            });
            return;
        }

        if (key === 'grain_bloom') {
            if (!this.shouldSpawnAmbientParticle(0.35)) return;
            const colors: GlowColor[] = [[255, 236, 168], [255, 222, 120], [214, 246, 161]];
            this.emitParticle({
                x: x + this.randomBetween(-14, 14),
                y: y + this.randomBetween(-8, 10),
                vx: this.randomBetween(-7, 7),
                vy: this.randomBetween(-18, -6),
                size: this.randomBetween(1.3, 2.1),
                bornMs: now,
                lifeMs: this.randomBetween(1100, 1800),
                alpha: this.randomBetween(0.18, 0.34),
                glow: this.randomBetween(2.4, 3.4),
                color: this.pickGlow(colors),
                gravity: -3,
                drag: 0.9,
                twinkle: this.randomBetween(0, 1000),
                shape: 'diamond',
            });
            return;
        }

        // Forest: drifting leaves
        if (tile.terrain === 'forest' || key.startsWith('forest')) {
            if (!this.shouldSpawnAmbientParticle(0.55)) return;
            const colors: GlowColor[] = [[110, 190, 75], [145, 200, 65], [85, 155, 55], [180, 160, 60]];
            this.emitParticle({
                x: x + this.randomBetween(-16, 16),
                y: y + this.randomBetween(-14, 4),
                vx: this.randomBetween(-12, 12),
                vy: this.randomBetween(4, 14),
                size: this.randomBetween(1.35, 2.2),
                bornMs: now,
                lifeMs: this.randomBetween(1800, 3200),
                alpha: this.randomBetween(0.44, 0.62),
                glow: this.randomBetween(1.45, 1.9),
                color: this.pickGlow(colors),
                gravity: 3,
                drag: 0.35,
                twinkle: this.randomBetween(0, 1200),
                shape: 'diamond',
            });
            return;
        }

        // Grain (non-bloom): gentle golden pollen
        if (tile.terrain === 'grain' || key.startsWith('grain')) {
            if (!this.shouldSpawnAmbientParticle(0.6)) return;
            const colors: GlowColor[] = [[255, 228, 140], [240, 210, 110], [255, 242, 180]];
            this.emitParticle({
                x: x + this.randomBetween(-14, 14),
                y: y + this.randomBetween(-6, 8),
                vx: this.randomBetween(-5, 5),
                vy: this.randomBetween(-14, -4),
                size: this.randomBetween(1.0, 1.7),
                bornMs: now,
                lifeMs: this.randomBetween(1200, 2000),
                alpha: this.randomBetween(0.12, 0.24),
                glow: this.randomBetween(2.0, 2.8),
                color: this.pickGlow(colors),
                gravity: -2,
                drag: 0.7,
                twinkle: this.randomBetween(0, 900),
                shape: 'circle',
            });
            return;
        }

        // Dessert: wind-blown sand particles
        if (tile.terrain === 'dessert' || key.startsWith('dessert') || key === 'cactus') {
            if (!this.shouldSpawnAmbientParticle(0.52)) return;
            const colors: GlowColor[] = [[210, 185, 140], [190, 165, 120], [225, 200, 155]];
            this.emitParticle({
                x: x + this.randomBetween(-18, 18),
                y: y + this.randomBetween(-4, 12),
                vx: this.randomBetween(6, 22),
                vy: this.randomBetween(-6, 4),
                size: this.randomBetween(1.0, 1.8),
                bornMs: now,
                lifeMs: this.randomBetween(600, 1100),
                alpha: this.randomBetween(0.1, 0.2),
                glow: this.randomBetween(1.6, 2.4),
                color: this.pickGlow(colors),
                gravity: 4,
                drag: 1.1,
                twinkle: this.randomBetween(0, 700),
                shape: 'circle',
            });
        }
    }

    private spawnVolcanoAmbientParticles(x: number, y: number, now: number) {
        if (!this.shouldSpawnAmbientParticle(0.16)) {
            return;
        }

        const ventY = y + this.randomBetween(-34, -24);
        const smokeColors: GlowColor[] = [[74, 69, 67], [92, 86, 84], [116, 108, 103]];
        const smokeBursts = Math.random() > 0.42 ? 2 : 3;
        for (let i = 0; i < smokeBursts; i++) {
            this.emitParticle({
                x: x + this.randomBetween(-9, 9),
                y: ventY + this.randomBetween(-4, 5),
                vx: this.randomBetween(-5, 5),
                vy: this.randomBetween(-12, -5),
                size: this.randomBetween(4.6, 7.4),
                bornMs: now,
                lifeMs: this.randomBetween(2400, 4200),
                alpha: this.randomBetween(0.14, 0.24),
                glow: this.randomBetween(0.55, 1.2),
                color: this.pickGlow(smokeColors),
                gravity: -0.18,
                drag: 0.14,
                twinkle: this.randomBetween(0, 1800),
                shape: 'cloud',
                renderMode: 'smoke',
                growth: this.randomBetween(1.15, 1.85),
            });
        }

        if (!this.shouldSpawnAmbientParticle(0.28)) {
            return;
        }

        const emberColors: GlowColor[] = [[255, 205, 126], [255, 150, 92], [255, 103, 65]];
        this.emitParticle({
            x: x + this.randomBetween(-12, 12),
            y: ventY + this.randomBetween(4, 12),
            vx: this.randomBetween(-11, 11),
            vy: this.randomBetween(-36, -14),
            size: this.randomBetween(1.7, 2.8),
            bornMs: now,
            lifeMs: this.randomBetween(700, 1200),
            alpha: this.randomBetween(0.26, 0.48),
            glow: this.randomBetween(2.8, 4.1),
            color: this.pickGlow(emberColors),
            gravity: -8,
            drag: 1.2,
            twinkle: this.randomBetween(0, 1200),
            shape: 'diamond',
        });
    }

    private spawnTaskParticles(now: number, tiles: Tile[]) {
        if (this._particles.length >= this.getMaxParticleBudget()) return;

        for (const tile of tiles) {
            if (this._particles.length >= this.getMaxParticleBudget()) return;

            const task = this.getPrimaryIncompleteTask(tile);
            if (!task) continue;

            if (!task.active) continue;

            const interval = 360;
            const lastEmit = this._taskParticleEmitMs.get(tile.id) ?? 0;
            if ((now - lastEmit) < interval) continue;

            this._taskParticleEmitMs.set(tile.id, now);
            const {x, y} = axialToPixel(tile.q, tile.r);
            const colors: GlowColor[] = [[255, 232, 138], [255, 212, 92], [254, 188, 114]];
            for (let i = 0; i < 1; i++) {
                this.emitParticle({
                    x: x + this.randomBetween(-10, 10),
                    y: y + this.randomBetween(-10, 6),
                    vx: this.randomBetween(-9, 9),
                    vy: this.randomBetween(-22, -8),
                    size: this.randomBetween(1.5, 2.2),
                    bornMs: now,
                    lifeMs: this.randomBetween(700, 1050),
                    alpha: this.randomBetween(0.24, 0.4),
                    glow: this.randomBetween(2.4, 3.2),
                    color: this.pickGlow(colors),
                    gravity: -8,
                    drag: 1.35,
                    twinkle: this.randomBetween(0, 1200),
                    shape: 'diamond',
                });
            }
        }
    }

    private spawnHeroTrailParticles(now: number) {
        if (this._particles.length >= this.getMaxParticleBudget()) return;

        const movingHeroes = new Set<string>();
        for (const hero of heroes) {
            if (!this.hasMovementStarted(hero, now)) continue;
            movingHeroes.add(hero.id);

            const tile = tileIndex[axialKey(hero.q, hero.r)];
            const tileKey = tile ? (this.getTileImageKey(tile) ?? tile.terrain ?? '') : '';
            const dustyGround = tile ? this.isDustyWalkingTerrain(tile, tileKey) : false;
            const interval = tile?.terrain === 'water' ? 90 : dustyGround ? 82 : 115;
            const lastEmit = this._heroTrailEmitMs.get(hero.id) ?? 0;
            if ((now - lastEmit) < interval) continue;

            this._heroTrailEmitMs.set(hero.id, now);
            const interp = this.getHeroInterpolatedPixelPosition(hero, now);
            const baseX = interp.x + this.randomBetween(-6, 6);
            const baseY = interp.y + this.randomBetween(8, 15);

            if (tile?.terrain === 'water') {
                const colors: GlowColor[] = [[220, 247, 255], [180, 230, 255], [132, 207, 255]];
                for (let i = 0; i < 2; i++) {
                    this.emitParticle({
                        x: baseX + this.randomBetween(-4, 4),
                        y: baseY + this.randomBetween(-2, 2),
                        vx: this.randomBetween(-14, 14),
                        vy: this.randomBetween(-24, -10),
                        size: this.randomBetween(1.8, 2.8),
                        bornMs: now,
                        lifeMs: this.randomBetween(420, 720),
                        alpha: this.randomBetween(0.22, 0.38),
                        glow: this.randomBetween(2.6, 3.6),
                        color: this.pickGlow(colors),
                        gravity: 18,
                        drag: 1.75,
                        twinkle: this.randomBetween(0, 900),
                        shape: 'circle',
                    });
                }
                continue;
            }

            if (tile?.terrain === 'snow') {
                const colors: GlowColor[] = [[255, 255, 255], [230, 243, 255], [203, 226, 255]];
                for (let i = 0; i < 1; i++) {
                    this.emitParticle({
                        x: baseX + this.randomBetween(-4, 4),
                        y: baseY + this.randomBetween(-2, 2),
                        vx: this.randomBetween(-10, 10),
                        vy: this.randomBetween(-18, -6),
                        size: this.randomBetween(1.5, 2.3),
                        bornMs: now,
                        lifeMs: this.randomBetween(520, 860),
                        alpha: this.randomBetween(0.18, 0.3),
                        glow: this.randomBetween(2.2, 3.1),
                        color: this.pickGlow(colors),
                        gravity: 10,
                        drag: 1.4,
                        twinkle: this.randomBetween(0, 600),
                        shape: 'circle',
                    });
                }
                continue;
            }

            if (tile && dustyGround) {
                continue;
            }
        }

        for (const heroId of Array.from(this._heroTrailEmitMs.keys())) {
            if (!movingHeroes.has(heroId)) {
                this._heroTrailEmitMs.delete(heroId);
            }
        }
    }

    private drawWalkingDust(
        ctx: CanvasRenderingContext2D,
        hero: Hero,
        interp: { x: number; y: number },
        pos: { x: number; y: number },
        opacity: number,
        now: number,
        tile: Tile,
        tileKey: string,
    ) {
        const seed = this.seedFromString(hero.id);
        const phase = ((now + seed) % 320) / 320;
        const dustColor = this.getDustColor(tile, tileKey);
        const shadowColor = this.getDustShadowColor(tile, tileKey);
        const baseX = interp.x + pos.x - 14;
        const baseY = interp.y + pos.y + 12;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'source-over';

        for (let i = 0; i < 2; i++) {
            const footPhase = (phase + (i * 0.5)) % 1;
            const pulse = Math.sin(footPhase * Math.PI);
            if (pulse <= 0.05) continue;

            const side = i === 0 ? -1 : 1;
            const driftX = hero.facing === 'left' ? 2 : hero.facing === 'right' ? -2 : side * 1.5;
            const puffX = baseX + (side * (7 + (pulse * 2))) + driftX;
            const puffY = baseY - (pulse * 2.5);
            const puffWidth = 6 + (pulse * 9);
            const puffHeight = 2.5 + (pulse * 4);
            const puffAlpha = opacity * (0.08 + (pulse * 0.16));

            const shadowGradient = ctx.createRadialGradient(puffX, puffY + 1, 0, puffX, puffY + 1, puffWidth);
            shadowGradient.addColorStop(0, this.toRgba(shadowColor, puffAlpha * 0.55));
            shadowGradient.addColorStop(1, this.toRgba(shadowColor, 0));
            ctx.fillStyle = shadowGradient;
            ctx.beginPath();
            ctx.ellipse(puffX, puffY + 1, puffWidth, puffHeight, 0, 0, Math.PI * 2);
            ctx.fill();

            const dustGradient = ctx.createRadialGradient(puffX, puffY, 0, puffX, puffY, puffWidth * 0.9);
            dustGradient.addColorStop(0, this.toRgba(dustColor, puffAlpha));
            dustGradient.addColorStop(0.75, this.toRgba(dustColor, puffAlpha * 0.32));
            dustGradient.addColorStop(1, this.toRgba(dustColor, 0));
            ctx.fillStyle = dustGradient;
            ctx.beginPath();
            ctx.ellipse(puffX, puffY, puffWidth, puffHeight, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    private isDustyWalkingTerrain(tile: Tile, key: string) {
        if (tile.terrain === 'dirt' || tile.terrain === 'dessert' || tile.terrain === 'mountain') {
            return true;
        }

        return (
            key === 'plains_drygrass' ||
            key === 'plains_stones' ||
            key === 'plains_rock' ||
            key === 'dirt_cracked' ||
            key === 'dirt_pebbles'
        );
    }

    private getDustColor(tile: Tile, key: string): GlowColor {
        if (tile.terrain === 'mountain') {
            return [176, 166, 160];
        }
        if (tile.terrain === 'dessert') {
            return [224, 193, 146];
        }
        if (key === 'plains_stones' || key === 'plains_rock') {
            return [194, 176, 152];
        }
        if (key === 'plains_drygrass') {
            return [202, 186, 134];
        }
        return [198, 167, 126];
    }

    private getDustShadowColor(tile: Tile, key: string): GlowColor {
        if (tile.terrain === 'mountain') {
            return [102, 96, 94];
        }
        if (tile.terrain === 'dessert') {
            return [138, 114, 82];
        }
        if (key === 'plains_stones' || key === 'plains_rock') {
            return [122, 108, 92];
        }
        if (key === 'plains_drygrass') {
            return [126, 113, 83];
        }
        return [118, 98, 74];
    }

    private getPrimaryIncompleteTask(tile: Tile): TaskInstance | null {
        const tasks = taskStore.tasksByTile[tile.id];
        if (!tasks) return null;

        let fallback: TaskInstance | null = null;
        for (const taskId of Object.values(tasks)) {
            const task = taskStore.taskIndex[taskId];
            if (!task || task.completedMs) continue;
            if (task.active) return task;
            if (!fallback) fallback = task;
        }

        return fallback;
    }

    private getParticleEdgeFade(screenX: number, screenY: number, applyCameraFade: boolean) {
        if (!this._canvas || !applyCameraFade) return 1;

        const {cx, cy} = this.getCanvasCenter();
        const width = this._canvas.width / this._dpr;
        const height = this._canvas.height / this._dpr;
        const outerRadius = Math.min(width, height) * 0.74;
        const innerRadius = outerRadius * 0.34;
        return 0.35 + (this.computeFade(Math.hypot(screenX - cx, screenY - cy), innerRadius, outerRadius) * 0.65);
    }

    private emitParticle(particle: Particle) {
        const budget = this.getMaxParticleBudget();
        if (budget <= 0) return;

        if (this._particles.length >= budget) {
            this._particles.shift();
        }
        this._particles.push({
            layer: 'underlay',
            ...particle,
        });
    }

    private areBirdAmbientParticlesEnabled() {
        return resolveRenderFeatureEnabled('birds', true);
    }

    private pruneDisabledSkyAmbientParticles() {
        const keepBirds = this.areBirdAmbientParticlesEnabled();
        if (keepBirds) return;

        if (!keepBirds) {
            this._nextBirdFlockSpawnMs = 0;
        }

        this._particles = this._particles.filter((particle) => {
            if (!keepBirds && particle.shape === 'bird') return false;
            return true;
        });
    }

    private getParticleDebugCounts() {
        let birds = 0;

        for (const particle of this._particles) {
            if (particle.shape === 'bird') {
                birds += 1;
            }
        }

        return {
            total: this._particles.length,
            birds,
        };
    }

    private getMaxParticleBudget() {
        return Math.round(getEffectiveParticleBudget() * this._currentRenderQuality.particleBudgetScale);
    }

    private pickGlow(colors: GlowColor[]): GlowColor {
        return colors[Math.floor(Math.random() * colors.length)]!;
    }

    private seedFromString(value: string) {
        let seed = 0;
        for (let i = 0; i < value.length; i++) {
            seed = ((seed * 31) + value.charCodeAt(i)) % 10000;
        }
        return seed;
    }

    private randomBetween(min: number, max: number) {
        return min + (Math.random() * (max - min));
    }

    private drawResourceIndicator(ctx: CanvasRenderingContext2D, t: Tile, task: TaskInstance, opacity: number) {
        if (!task.requiredResources || task.requiredResources.length === 0) return;

        const {x, y} = axialToPixel(t.q, t.r);

        // Check which resources still need to be collected
        const pendingResources = task.requiredResources.filter(required => {
            const collected = task.collectedResources?.find(c => c.type === required.type)?.amount || 0;
            return collected < required.amount;
        });

        if (pendingResources.length === 0) return; // All resources collected

        // Build display text
        const resourceTexts = pendingResources.map(required => {
            const collected = task.collectedResources?.find(c => c.type === required.type)?.amount || 0;
            const icon = this.RESOURCE_ICON_MAP[required.type] ?? '?';
            return `${icon} ${collected}/${required.amount}`;
        });

        const text = resourceTexts.join('  ');

        // Draw the text above the tile
        ctx.save();

        // Add a rounded rectangle background with some padding
        const paddingX = 10;
        const paddingY = 6;
        const textMetrics = ctx.measureText(text);
        const rectWidth = textMetrics.width + paddingX * 2;
        const rectHeight = 12 + paddingY * 2; // Approximate height for 9px font

        ctx.globalAlpha = opacity * 0.6;
        this.drawRoundedRect(ctx, x - rectWidth / 2, y - this.HEX_SIZE - rectHeight + 7, rectWidth, rectHeight, 6);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.font = '8px \'Press Start 2P\', \'VT323\', \'Courier New\', monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        ctx.fillStyle = '#fff6d7aa';
        ctx.fillText(text, x, y - this.HEX_SIZE);

        ctx.restore();
    }

    private getTileMaskedCanvasKey(t: Tile, key: string, now: number) {
        const def: any = t.terrain ? (TERRAIN_DEFS as any)[t.terrain] : null;
        const frames = (def?.frames && def.frames >= 2) ? def.frames : 0;
        if (!frames) {
            return key;
        }

        const frameTime = (def.frameTime && def.frameTime > 0) ? def.frameTime : 250;
        const elapsed = now - this._tileAnimStart;
        const frameIndex = Math.floor(elapsed / frameTime) % frames;
        return key + '__f' + frameIndex;
    }

    private resolveTileMaskedCanvas(t: Tile, key: string, baseImg: HTMLImageElement, now: number): HTMLCanvasElement | null {
        const cacheKey = this.getTileMaskedCanvasKey(t, key, now);
        const existingCanvas = this.getCachedCanvas(this._maskedImages, cacheKey);
        if (existingCanvas) {
            return existingCanvas;
        }

        const def: any = t.terrain ? (TERRAIN_DEFS as any)[t.terrain] : null;
        const frames = (def?.frames && def.frames >= 2) ? def.frames : 0;
        if (!frames) {
            return null;
        }

        const frameIndexText = cacheKey.split('__f')[1] ?? '0';
        const frameIndex = Number.parseInt(frameIndexText, 10) || 0;
        const frameWidth = baseImg.width / frames;
        const sx = frameIndex * frameWidth;
        const c = document.createElement('canvas');
        c.width = this.TILE_DRAW_SIZE;
        c.height = this.TILE_DRAW_SIZE;
        const g = c.getContext('2d');
        if (!g) {
            return null;
        }

        g.save();
        this.traceHexClipPath(g, this.HEX_SIZE, this.HEX_SIZE);
        g.clip();
        g.drawImage(baseImg, sx, 0, frameWidth, baseImg.height, 0, 0, this.TILE_DRAW_SIZE, this.TILE_DRAW_SIZE);
        g.restore();
        return this.storeCachedCanvas(
            this._maskedImages,
            cacheKey,
            c,
            HexMapService.MASKED_TILE_CANVAS_CACHE_MAX,
        );
    }

    private createTileRenderState(t: Tile, now: number, opacity: number): TileRenderState | null {
        const key = this.getTileImageKey(t);
        const resolvedKey = key ?? 'plains';
        const baseImg = this._images[resolvedKey];
        if (!baseImg) return null;

        const maskedCanvasKey = this.getTileMaskedCanvasKey(t, resolvedKey, now);
        const maskedCanvas = this.resolveTileMaskedCanvas(t, resolvedKey, baseImg, now);
        const {x, y} = axialToPixel(t.q, t.r);
        return {
            tile: t,
            key: resolvedKey,
            x,
            y,
            now,
            opacity,
            maskedCanvasKey,
            maskedCanvas,
        };
    }

    private drawTileBaseStage(ctx: CanvasRenderingContext2D, state: TileRenderState) {
        const baseCanvas = this.buildTileColorVariantCanvas(state) ?? state.maskedCanvas;
        ctx.globalAlpha = state.opacity;
        if (baseCanvas) {
            ctx.drawImage(baseCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
        }
    }

    private shouldRenderTileOverlayInline(tile: Tile) {
        const band = tile.supportBand ?? (tile.activationState === 'inactive' ? 'inactive' : null);
        return band === 'inactive' && !!this.getTileOverlayKey(tile);
    }

    private getSignedTileNoise(q: number, r: number, salt: number, scale: number = 1) {
        const scaledQ = Math.floor(q / Math.max(1, scale));
        const scaledR = Math.floor(r / Math.max(1, scale));
        const value = hash32(
            scaledQ + (salt * 193),
            scaledR - (salt * 389),
        ) / 0xffffffff;
        return (value * 2) - 1;
    }

    private getTileColorAdjustment(tile: Tile, key: string, variant: TileShaderVariant = this.getTileShaderVariant(tile, key)): TileColorAdjustment {
        const regionalHueNoise = this.getSignedTileNoise(tile.q, tile.r, key.length + 11, 3);
        const localHueNoise = this.getSignedTileNoise(tile.q, tile.r, key.length + 29, 1);
        const regionalSatNoise = this.getSignedTileNoise(tile.q, tile.r, key.length + 37, 3);
        const localSatNoise = this.getSignedTileNoise(tile.q, tile.r, key.length + 47, 1);
        const regionalBrightnessNoise = this.getSignedTileNoise(tile.q, tile.r, key.length + 59, 3);
        const localBrightnessNoise = this.getSignedTileNoise(tile.q, tile.r, key.length + 71, 1);
        const hueBlend = Math.max(
            -1,
            Math.min(
                1,
                (regionalHueNoise * 0.58)
                + (localHueNoise * 0.5)
                + ((variant.regionVariant - 0.5) * 0.56)
                + ((variant.accentVariant - 0.5) * 0.34),
            ),
        );
        const saturationBlend = Math.max(
            0,
            Math.min(
                1,
                0.5
                + (regionalSatNoise * 0.24)
                + (localSatNoise * 0.3)
                + ((variant.regionVariant - 0.5) * 0.18)
                + ((variant.accentVariant - 0.5) * 0.14),
            ),
        );
        const brightnessBlend = Math.max(
            0,
            Math.min(
                1,
                0.5
                + (regionalBrightnessNoise * 0.2)
                + (localBrightnessNoise * 0.24)
                + ((variant.regionVariant - 0.5) * 0.12)
                - ((variant.accentVariant - 0.5) * 0.08),
            ),
        );

        return {
            hueDeg: hueBlend * 12.5,
            saturate: 0.75 + (saturationBlend * 0.75),
            brightness: 1 - (brightnessBlend * 0.25),
        };
    }

    private normalizeTileColorAdjustment(adjustment: TileColorAdjustment): TileColorAdjustment {
        const hueDeg = Math.round(adjustment.hueDeg / 1) * 1;
        const saturate = Math.round(adjustment.saturate / 0.02) * 0.02;
        const brightness = Math.round(adjustment.brightness / 0.02) * 0.02;
        return {
            hueDeg,
            saturate,
            brightness,
        };
    }

    private getTileColorAdjustmentKey(adjustment: TileColorAdjustment) {
        return `h${Math.round(adjustment.hueDeg)}:s${Math.round(adjustment.saturate * 100)}:b${Math.round(adjustment.brightness * 100)}`;
    }

    private getTileColorFilter(adjustment: TileColorAdjustment) {
        const hue = Math.max(-12.5, Math.min(12.5, adjustment.hueDeg));
        const saturate = Math.max(0.75, Math.min(1.5, adjustment.saturate));
        const brightness = Math.max(0.75, Math.min(1, adjustment.brightness));

        return `hue-rotate(${hue.toFixed(2)}deg) saturate(${(saturate * 100).toFixed(1)}%) brightness(${(brightness * 100).toFixed(1)}%)`;
    }

    private buildTileColorVariantCanvas(state: TileRenderState): HTMLCanvasElement | null {
        if (!state.maskedCanvas) {
            return null;
        }

        const variant = this.getTileShaderVariant(state.tile, state.key);
        const adjustment = this.normalizeTileColorAdjustment(this.getTileColorAdjustment(state.tile, state.key, variant));
        const cacheKey = `v${HexMapService.TILE_COLOR_VARIANT_VERSION}:${state.maskedCanvasKey}:${this.getTileColorAdjustmentKey(adjustment)}`;
        const cached = this.getCachedCanvas(this._tileColorVariantCache, cacheKey);
        if (cached) {
            return cached;
        }

        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.filter = this.getTileColorFilter(adjustment);
        ctx.drawImage(state.maskedCanvas, 0, 0);
        ctx.filter = 'none';
        return this.storeCachedCanvas(
            this._tileColorVariantCache,
            cacheKey,
            canvas,
            HexMapService.TILE_COLOR_VARIANT_CACHE_MAX,
        );
    }

    private mixGlowColor(from: GlowColor, to: GlowColor, amount: number): GlowColor {
        const t = Math.max(0, Math.min(1, amount));
        return [
            Math.round(from[0] + ((to[0] - from[0]) * t)),
            Math.round(from[1] + ((to[1] - from[1]) * t)),
            Math.round(from[2] + ((to[2] - from[2]) * t)),
        ] as GlowColor;
    }

    private getTileShaderVariant(tile: Tile, key: string): TileShaderVariant {
        const accentBucket = hash32(tile.q + key.length, tile.r - key.length) % 6;
        const regionBucket = hash32(
            Math.floor(tile.q / 4) + (key.length * 3),
            Math.floor(tile.r / 4) - (key.length * 5),
        ) % 4;

        return {
            accentBucket,
            accentVariant: accentBucket / 5,
            regionBucket,
            regionVariant: regionBucket / 3,
        };
    }

    private shouldUseOverlaySafeTileShader(tile: Tile) {
        return !!this.getTileOverlayKey(tile);
    }

    private isTileReliefEnabled() {
        return this._currentRenderQuality.enableTileRelief;
    }

    private getTileShaderCacheKey(tile: Tile, key: string) {
        const terrain = tile.terrain ?? 'plains';
        const variant = this.getTileShaderVariant(tile, key);
        const reliefMode = this.shouldUseOverlaySafeTileShader(tile) ? 'overlay-safe' : 'full';
        const reliefState = this.isTileReliefEnabled() ? reliefMode : 'off';
        return `v${HexMapService.TILE_SHADER_VERSION}:${terrain}:${key}:${reliefState}:r${variant.regionBucket}:a${variant.accentBucket}`;
    }

    private getTileShaderTone(terrain: string, key: string, regionBucket: number) {
        if (terrain === 'water' || key.startsWith('water')) {
            return [
                {
                    wash: [88, 152, 214] as GlowColor,
                    patch: [138, 208, 238] as GlowColor,
                    shadow: [14, 42, 78] as GlowColor,
                    highlight: [232, 248, 255] as GlowColor,
                },
                {
                    wash: [72, 164, 184] as GlowColor,
                    patch: [126, 214, 210] as GlowColor,
                    shadow: [12, 58, 68] as GlowColor,
                    highlight: [226, 252, 246] as GlowColor,
                },
                {
                    wash: [118, 164, 216] as GlowColor,
                    patch: [190, 222, 242] as GlowColor,
                    shadow: [26, 54, 92] as GlowColor,
                    highlight: [244, 250, 255] as GlowColor,
                },
                {
                    wash: [92, 170, 210] as GlowColor,
                    patch: [176, 224, 232] as GlowColor,
                    shadow: [18, 56, 82] as GlowColor,
                    highlight: [242, 250, 250] as GlowColor,
                },
            ][regionBucket]!;
        }

        if (terrain === 'forest' || key.startsWith('forest')) {
            return [
                {
                    wash: [66, 118, 62] as GlowColor,
                    patch: [112, 166, 90] as GlowColor,
                    shadow: [18, 38, 16] as GlowColor,
                    highlight: [206, 210, 140] as GlowColor,
                },
                {
                    wash: [58, 128, 54] as GlowColor,
                    patch: [102, 178, 88] as GlowColor,
                    shadow: [18, 42, 16] as GlowColor,
                    highlight: [200, 220, 140] as GlowColor,
                },
                {
                    wash: [92, 126, 60] as GlowColor,
                    patch: [152, 182, 98] as GlowColor,
                    shadow: [26, 42, 18] as GlowColor,
                    highlight: [220, 208, 138] as GlowColor,
                },
                {
                    wash: [84, 114, 66] as GlowColor,
                    patch: [136, 164, 100] as GlowColor,
                    shadow: [24, 40, 20] as GlowColor,
                    highlight: [214, 204, 146] as GlowColor,
                },
            ][regionBucket]!;
        }

        if (terrain === 'grain' || key.startsWith('grain')) {
            return [
                {
                    wash: [166, 164, 84] as GlowColor,
                    patch: [222, 204, 114] as GlowColor,
                    shadow: [88, 72, 26] as GlowColor,
                    highlight: [248, 236, 180] as GlowColor,
                },
                {
                    wash: [186, 176, 76] as GlowColor,
                    patch: [232, 212, 106] as GlowColor,
                    shadow: [94, 76, 24] as GlowColor,
                    highlight: [252, 240, 174] as GlowColor,
                },
                {
                    wash: [204, 168, 78] as GlowColor,
                    patch: [242, 206, 108] as GlowColor,
                    shadow: [104, 72, 22] as GlowColor,
                    highlight: [255, 236, 172] as GlowColor,
                },
                {
                    wash: [194, 152, 92] as GlowColor,
                    patch: [236, 198, 122] as GlowColor,
                    shadow: [102, 66, 28] as GlowColor,
                    highlight: [255, 232, 182] as GlowColor,
                },
            ][regionBucket]!;
        }

        if (terrain === 'dirt' || key.startsWith('dirt') || terrain === 'dessert' || key.startsWith('dessert')) {
            const isDessert = terrain === 'dessert' || key.startsWith('dessert');
            return isDessert
                ? [
                    {
                        wash: [204, 170, 118] as GlowColor,
                        patch: [236, 206, 150] as GlowColor,
                        shadow: [88, 62, 34] as GlowColor,
                        highlight: [255, 234, 194] as GlowColor,
                    },
                    {
                        wash: [214, 178, 126] as GlowColor,
                        patch: [244, 212, 156] as GlowColor,
                        shadow: [92, 66, 36] as GlowColor,
                        highlight: [255, 236, 198] as GlowColor,
                    },
                    {
                        wash: [222, 182, 118] as GlowColor,
                        patch: [248, 214, 146] as GlowColor,
                        shadow: [94, 64, 30] as GlowColor,
                        highlight: [255, 238, 188] as GlowColor,
                    },
                    {
                        wash: [198, 166, 124] as GlowColor,
                        patch: [232, 204, 160] as GlowColor,
                        shadow: [84, 60, 38] as GlowColor,
                        highlight: [250, 232, 200] as GlowColor,
                    },
                ][regionBucket]!
                : [
                    {
                        wash: [136, 98, 72] as GlowColor,
                        patch: [178, 136, 106] as GlowColor,
                        shadow: [62, 44, 28] as GlowColor,
                        highlight: [228, 206, 176] as GlowColor,
                    },
                    {
                        wash: [146, 104, 70] as GlowColor,
                        patch: [190, 144, 102] as GlowColor,
                        shadow: [68, 46, 26] as GlowColor,
                        highlight: [236, 212, 176] as GlowColor,
                    },
                    {
                        wash: [158, 110, 68] as GlowColor,
                        patch: [204, 150, 98] as GlowColor,
                        shadow: [72, 46, 24] as GlowColor,
                        highlight: [242, 214, 170] as GlowColor,
                    },
                    {
                        wash: [128, 96, 78] as GlowColor,
                        patch: [172, 136, 112] as GlowColor,
                        shadow: [60, 44, 30] as GlowColor,
                        highlight: [224, 206, 184] as GlowColor,
                    },
                ][regionBucket]!;
        }

        return [
            {
                wash: [94, 160, 82] as GlowColor,
                patch: [156, 204, 98] as GlowColor,
                shadow: [28, 60, 24] as GlowColor,
                highlight: [226, 232, 154] as GlowColor,
            },
            {
                wash: [82, 170, 76] as GlowColor,
                patch: [150, 212, 92] as GlowColor,
                shadow: [24, 66, 22] as GlowColor,
                highlight: [216, 238, 150] as GlowColor,
            },
            {
                wash: [126, 170, 82] as GlowColor,
                patch: [192, 208, 108] as GlowColor,
                shadow: [42, 68, 22] as GlowColor,
                highlight: [242, 232, 152] as GlowColor,
            },
            {
                wash: [142, 164, 86] as GlowColor,
                patch: [210, 202, 116] as GlowColor,
                shadow: [54, 66, 24] as GlowColor,
                highlight: [246, 226, 158] as GlowColor,
            },
        ][regionBucket]!;
    }

    private getTileShaderPalette(terrain: string, key: string, variant: TileShaderVariant): TileShaderPalette {
        const tone = this.getTileShaderTone(terrain, key, variant.regionBucket);
        const accentAlphaBoost = 1 + (variant.accentVariant * 0.18);

        if (terrain === 'water' || key.startsWith('water')) {
            return {
                ...tone,
                regionGlow: this.mixGlowColor(tone.patch, tone.highlight, 0.38),
                regionGlowAlpha: 0.13 + (variant.regionVariant * 0.04),
                washAlpha: 0.17 + (variant.regionVariant * 0.04),
                patchAlpha: (0.12 + ((1 - variant.accentVariant) * 0.04)) * accentAlphaBoost,
                shadowAlpha: 0.08 + (variant.accentVariant * 0.026),
                highlightAlpha: 0.06 + ((1 - variant.regionVariant) * 0.02),
            };
        }

        return {
            ...tone,
            regionGlow: this.mixGlowColor(tone.patch, tone.highlight, 0.26 + (variant.regionVariant * 0.18)),
            regionGlowAlpha:
                terrain === 'forest' || key.startsWith('forest')
                    ? 0.11 + (variant.regionVariant * 0.035)
                    : terrain === 'grain' || key.startsWith('grain')
                        ? 0.14 + (variant.regionVariant * 0.035)
                        : terrain === 'dirt' || key.startsWith('dirt') || terrain === 'dessert' || key.startsWith('dessert')
                            ? 0.12 + (variant.regionVariant * 0.03)
                            : 0.13 + (variant.regionVariant * 0.035),
            washAlpha:
                terrain === 'forest' || key.startsWith('forest')
                    ? 0.16 + (variant.regionVariant * 0.035)
                    : terrain === 'grain' || key.startsWith('grain')
                        ? 0.18 + (variant.regionVariant * 0.03)
                        : terrain === 'dirt' || key.startsWith('dirt') || terrain === 'dessert' || key.startsWith('dessert')
                            ? 0.16 + (variant.regionVariant * 0.03)
                            : 0.17 + (variant.regionVariant * 0.035),
            patchAlpha:
                (terrain === 'forest' || key.startsWith('forest')
                    ? 0.1
                    : terrain === 'grain' || key.startsWith('grain')
                        ? 0.12
                        : terrain === 'dirt' || key.startsWith('dirt') || terrain === 'dessert' || key.startsWith('dessert')
                            ? 0.11
                            : 0.12) + ((1 - variant.accentVariant) * 0.04),
            shadowAlpha:
                terrain === 'forest' || key.startsWith('forest')
                    ? 0.095 + (variant.accentVariant * 0.03)
                    : terrain === 'grain' || key.startsWith('grain')
                        ? 0.08 + (variant.accentVariant * 0.026)
                        : terrain === 'dirt' || key.startsWith('dirt') || terrain === 'dessert' || key.startsWith('dessert')
                            ? 0.085 + (variant.accentVariant * 0.026)
                            : 0.09 + (variant.accentVariant * 0.028),
            highlightAlpha:
                terrain === 'forest' || key.startsWith('forest')
                    ? 0.05 + ((1 - variant.regionVariant) * 0.018)
                    : terrain === 'grain' || key.startsWith('grain')
                        ? 0.064 + ((1 - variant.regionVariant) * 0.02)
                        : terrain === 'dirt' || key.startsWith('dirt') || terrain === 'dessert' || key.startsWith('dessert')
                            ? 0.05 + ((1 - variant.regionVariant) * 0.016)
                            : 0.058 + ((1 - variant.regionVariant) * 0.018),
        };
    }

    private getTileShaderGeometry(variant: TileShaderVariant, width: number, height: number): TileShaderGeometry {
        return {
            width,
            height,
            accentX: width * (0.2 + ((((variant.accentBucket * 37) + (variant.regionBucket * 13)) % 38) / 100)),
            accentY: height * (0.18 + ((((variant.accentBucket * 31) + (variant.regionBucket * 17)) % 34) / 100)),
            accentRadius: width * (0.32 + ((((variant.accentBucket * 23) + (variant.regionBucket * 11)) % 10) / 100)),
            accentX2: width * (0.44 + ((((variant.accentBucket * 19) + (variant.regionBucket * 29)) % 24) / 100)),
            accentY2: height * (0.42 + ((((variant.accentBucket * 41) + (variant.regionBucket * 7)) % 18) / 100)),
            accentRadius2: width * (0.24 + ((((variant.accentBucket * 13) + (variant.regionBucket * 19)) % 12) / 100)),
            regionShiftX: width * (0.14 + (variant.regionVariant * 0.12)),
            sunX: width * (0.18 + (variant.regionVariant * 0.08)),
            sunY: height * (0.12 + (variant.accentVariant * 0.05)),
            sunRadius: width * (0.66 + (variant.regionVariant * 0.08)),
            shadeX: width * (0.8 - (variant.regionVariant * 0.04)),
            shadeY: height * (0.82 - (variant.accentVariant * 0.05)),
            shadeRadius: width * (0.56 + (variant.accentVariant * 0.08)),
        };
    }

    private drawTileShaderBackdrop(
        ctx: CanvasRenderingContext2D,
        palette: TileShaderPalette,
        geometry: TileShaderGeometry,
    ) {
        const wash = ctx.createLinearGradient(0, 0, geometry.width, geometry.height);
        wash.addColorStop(0, this.toRgba(palette.highlight, palette.highlightAlpha * 1.15));
        wash.addColorStop(0.28, this.toRgba(palette.patch, palette.patchAlpha * 0.9));
        wash.addColorStop(0.66, this.toRgba(palette.wash, palette.washAlpha));
        wash.addColorStop(1, this.toRgba(palette.shadow, palette.shadowAlpha * 1.08));
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const regionSweep = ctx.createLinearGradient(
            geometry.regionShiftX,
            0,
            geometry.width - geometry.regionShiftX,
            geometry.height,
        );
        regionSweep.addColorStop(0, this.toRgba(palette.regionGlow, palette.regionGlowAlpha));
        regionSweep.addColorStop(0.5, this.toRgba(palette.patch, palette.patchAlpha * 0.38));
        regionSweep.addColorStop(1, this.toRgba(palette.shadow, palette.shadowAlpha * 0.4));
        ctx.fillStyle = regionSweep;
        ctx.fillRect(0, 0, geometry.width, geometry.height);
    }

    private drawTileShaderDirectionalRelief(
        ctx: CanvasRenderingContext2D,
        palette: TileShaderPalette,
        geometry: TileShaderGeometry,
    ) {
        const sunlight = this.mixGlowColor(palette.highlight, palette.patch, 0.34);
        const shadeTint = this.mixGlowColor(palette.shadow, palette.wash, 0.18);

        const lightSweep = ctx.createLinearGradient(
            geometry.sunX,
            geometry.sunY,
            geometry.shadeX,
            geometry.shadeY,
        );
        lightSweep.addColorStop(0, this.toRgba(sunlight, palette.highlightAlpha * 0.92));
        lightSweep.addColorStop(0.34, this.toRgba(palette.highlight, palette.highlightAlpha * 0.28));
        lightSweep.addColorStop(0.62, this.toRgba(palette.wash, palette.washAlpha * 0.06));
        lightSweep.addColorStop(1, this.toRgba(shadeTint, palette.shadowAlpha * 0.7));
        ctx.fillStyle = lightSweep;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const sunPool = ctx.createRadialGradient(
            geometry.sunX,
            geometry.sunY,
            0,
            geometry.sunX,
            geometry.sunY,
            geometry.sunRadius,
        );
        sunPool.addColorStop(0, this.toRgba(sunlight, palette.highlightAlpha * 1.1));
        sunPool.addColorStop(0.5, this.toRgba(palette.highlight, palette.highlightAlpha * 0.34));
        sunPool.addColorStop(1, this.toRgba(palette.highlight, 0));
        ctx.fillStyle = sunPool;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const shadePool = ctx.createRadialGradient(
            geometry.shadeX,
            geometry.shadeY,
            0,
            geometry.shadeX,
            geometry.shadeY,
            geometry.shadeRadius,
        );
        shadePool.addColorStop(0, this.toRgba(shadeTint, palette.shadowAlpha * 0.5));
        shadePool.addColorStop(0.62, this.toRgba(palette.shadow, palette.shadowAlpha * 0.18));
        shadePool.addColorStop(1, this.toRgba(palette.shadow, 0));
        ctx.fillStyle = shadePool;
        ctx.fillRect(0, 0, geometry.width, geometry.height);
    }

    private drawTileShaderAccentRelief(
        ctx: CanvasRenderingContext2D,
        palette: TileShaderPalette,
        geometry: TileShaderGeometry,
    ) {
        ctx.save();
        ctx.globalCompositeOperation = 'color-burn';

        const accent = ctx.createRadialGradient(
            geometry.accentX,
            geometry.accentY,
            0,
            geometry.accentX,
            geometry.accentY,
            geometry.accentRadius,
        );
        accent.addColorStop(0, this.toRgba(palette.patch, palette.patchAlpha));
        accent.addColorStop(0.4, this.toRgba(palette.regionGlow, palette.regionGlowAlpha * 0.5));
        accent.addColorStop(1, this.toRgba(palette.wash, 0));
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const accentTwo = ctx.createRadialGradient(
            geometry.accentX2,
            geometry.accentY2,
            0,
            geometry.accentX2,
            geometry.accentY2,
            geometry.accentRadius2,
        );
        accentTwo.addColorStop(0, this.toRgba(palette.highlight, palette.highlightAlpha));
        accentTwo.addColorStop(0.74, this.toRgba(palette.patch, palette.patchAlpha * 0.5));
        accentTwo.addColorStop(1, this.toRgba(palette.patch, 0));

        ctx.fillStyle = accentTwo;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const shadowPool = ctx.createRadialGradient(
            geometry.width * 0.64,
            geometry.height * 0.72,
            0,
            geometry.width * 0.64,
            geometry.height * 0.72,
            geometry.width * 0.44,
        );
        shadowPool.addColorStop(0, this.toRgba(palette.shadow, palette.shadowAlpha * 0.58));
        shadowPool.addColorStop(0.7, this.toRgba(palette.shadow, palette.shadowAlpha * 0.22));
        shadowPool.addColorStop(1, this.toRgba(palette.shadow, 0));
        ctx.fillStyle = shadowPool;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        ctx.restore();
    }

    private drawTileShaderEdgeRelief(
        ctx: CanvasRenderingContext2D,
        palette: TileShaderPalette,
        geometry: TileShaderGeometry,
    ) {
        const rimLight = ctx.createLinearGradient(
            geometry.width * 0.08,
            geometry.height * 0.06,
            geometry.width * 0.58,
            geometry.height * 0.56,
        );
        rimLight.addColorStop(0, this.toRgba(palette.highlight, palette.highlightAlpha * 0.7));
        rimLight.addColorStop(0.45, this.toRgba(palette.regionGlow, palette.regionGlowAlpha * 0.34));
        rimLight.addColorStop(1, this.toRgba(palette.regionGlow, 0));
        ctx.fillStyle = rimLight;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const edgeShade = ctx.createLinearGradient(
            geometry.width * 0.18,
            geometry.height * 0.1,
            geometry.width * 0.88,
            geometry.height * 0.92,
        );
        edgeShade.addColorStop(0, this.toRgba(palette.highlight, palette.highlightAlpha * 0.56));
        edgeShade.addColorStop(0.52, this.toRgba(palette.wash, palette.washAlpha * 0.24));
        edgeShade.addColorStop(1, this.toRgba(palette.shadow, palette.shadowAlpha * 0.96));
        ctx.fillStyle = edgeShade;
        ctx.fillRect(0, 0, geometry.width, geometry.height);
    }

    private buildTileShaderCanvas(tile: Tile, key: string): HTMLCanvasElement | null {
        if (!this.isTileReliefEnabled()) {
            return null;
        }

        const cacheKey = this.getTileShaderCacheKey(tile, key);
        const cached = this.getCachedCanvas(this._tileShaderCache, cacheKey);
        if (cached) {
            return cached;
        }

        const variant = this.getTileShaderVariant(tile, key);
        const palette = this.getTileShaderPalette(tile.terrain ?? 'plains', key, variant);
        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const geometry = this.getTileShaderGeometry(variant, this.TILE_DRAW_SIZE, this.TILE_DRAW_SIZE);
        const applyExtendedRelief = !this.shouldUseOverlaySafeTileShader(tile);

        ctx.save();
        this.traceHexClipPath(ctx, this.HEX_SIZE, this.HEX_SIZE);
        ctx.clip();

        this.drawTileShaderBackdrop(ctx, palette, geometry);
        if (applyExtendedRelief) {
            this.drawTileShaderDirectionalRelief(ctx, palette, geometry);
            this.drawTileShaderAccentRelief(ctx, palette, geometry);
            this.drawTileShaderEdgeRelief(ctx, palette, geometry);
        }

        ctx.restore();
        return this.storeCachedCanvas(this._tileShaderCache, cacheKey, canvas, HexMapService.TILE_SHADER_CACHE_MAX);
    }

    private buildShadedTileOverlayCanvas(
        tile: Tile,
        baseKey: string,
        overlayKey: string,
        overlayImg: HTMLImageElement,
        drawWidth: number,
        drawHeight: number,
    ): HTMLCanvasElement | null {
        const variant = this.getTileShaderVariant(tile, baseKey);
        const palette = this.getTileShaderPalette(tile.terrain ?? 'plains', baseKey, variant);
        const geometry = this.getTileShaderGeometry(variant, drawWidth, drawHeight);
        const adjustment = this.normalizeTileColorAdjustment(this.getTileColorAdjustment(tile, baseKey, variant));
        const cacheKey = `v${HexMapService.TILE_OVERLAY_SHADER_VERSION}:${overlayKey}:${drawWidth}x${drawHeight}:${this.getTileShaderCacheKey(tile, baseKey)}:${this.getTileColorAdjustmentKey(adjustment)}`;
        const cached = this.getCachedCanvas(this._tileOverlayShaderCache, cacheKey);
        if (cached) {
            return cached;
        }

        const canvas = document.createElement('canvas');
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.filter = this.getTileColorFilter(adjustment);
        ctx.drawImage(overlayImg, 0, 0, drawWidth, drawHeight);
        ctx.filter = 'none';

        const harmonySweep = ctx.createLinearGradient(
            geometry.regionShiftX,
            0,
            geometry.width - geometry.regionShiftX,
            geometry.height,
        );
        harmonySweep.addColorStop(0, this.toRgba(palette.regionGlow, 0.12));
        harmonySweep.addColorStop(0.52, this.toRgba(palette.patch, 0.06));
        harmonySweep.addColorStop(1, this.toRgba(palette.wash, 0.08));
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = harmonySweep;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        const shadeSweep = ctx.createLinearGradient(
            geometry.sunX,
            geometry.sunY,
            geometry.shadeX,
            geometry.shadeY,
        );
        shadeSweep.addColorStop(0, this.toRgba(palette.highlight, 0.025));
        shadeSweep.addColorStop(0.58, this.toRgba(palette.wash, 0));
        shadeSweep.addColorStop(1, this.toRgba(palette.shadow, 0.095));
        ctx.fillStyle = shadeSweep;
        ctx.fillRect(0, 0, geometry.width, geometry.height);

        this.applyOverlayFeatherMask(ctx, overlayKey, overlayImg, drawWidth, drawHeight);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        return this.storeCachedCanvas(
            this._tileOverlayShaderCache,
            cacheKey,
            canvas,
            HexMapService.TILE_OVERLAY_SHADER_CACHE_MAX,
        );
    }

    private drawTileShaderStage(ctx: CanvasRenderingContext2D, state: TileRenderState) {
        if (!state.tile.terrain || state.opacity <= 0.03) {
            return;
        }

        const shaderCanvas = this.buildTileShaderCanvas(state.tile, state.key);
        if (!shaderCanvas) {
            return;
        }

        this.drawTileShaderCanvas(ctx, shaderCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE, state.opacity);
    }

    private drawTileShaderCanvas(
        ctx: CanvasRenderingContext2D,
        shaderCanvas: HTMLCanvasElement,
        x: number,
        y: number,
        opacity: number,
    ) {
        ctx.save();
        ctx.globalAlpha = opacity * 0.82;
        ctx.globalCompositeOperation = 'soft-light'
        ctx.drawImage(shaderCanvas, x, y);
        ctx.restore();
    }

    private shouldRenderWaterReflections(tile: Tile) {
        if (tile.terrain !== 'water') {
            return false;
        }

        if (isBridgeTile(tile)) {
            return false;
        }

        return !(typeof tile.variant === 'string' && tile.variant.startsWith('water_dock_'));
    }

    private getWaterReflectionEdgeVertexIndexes(side: TileSide): [number, number] {
        switch (side) {
            case 'a':
                return [5, 0];
            case 'b':
                return [0, 1];
            case 'c':
                return [1, 2];
            case 'd':
                return [2, 3];
            case 'e':
                return [3, 4];
            case 'f':
                return [4, 5];
            default:
                return [5, 0];
        }
    }

    private shouldRenderWaterReflectionSide(side: TileSide) {
        return side === 'f' || side === 'a' || side === 'b';
    }

    private getWaterReflectionSampleStrength(tile: Tile) {
        switch (tile.terrain) {
            case 'snow':
                return 0.46;
            case 'mountain':
            case 'vulcano':
                return 0.42;
            case 'towncenter':
                return 0.41;
            case 'forest':
                return 0.39;
            case 'grain':
                return 0.37;
            case 'plains':
                return 0.36;
            case 'dessert':
            case 'dirt':
                return 0.34;
            default:
                return 0.36;
        }
    }

    private buildReflectableTileCanvas(tile: Tile, now: number): { canvas: HTMLCanvasElement; signature: string } | null {
        const state = this.createTileRenderState(tile, now, 1);
        if (!state) {
            return null;
        }

        const variant = this.getTileShaderVariant(tile, state.key);
        const adjustment = this.normalizeTileColorAdjustment(
            this.getTileColorAdjustment(tile, state.key, variant),
        );
        const baseCanvas = this.buildTileColorVariantCanvas(state) ?? state.maskedCanvas;
        if (!baseCanvas) {
            return null;
        }

        const shaderCanvas = this.buildTileShaderCanvas(tile, state.key);
        const roadCanvas = this.getProceduralRoadCanvas(tile);
        const bridgeCanvas = this.getProceduralBridgeCanvas(tile);
        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(baseCanvas, 0, 0);
        if (shaderCanvas) {
            this.drawTileShaderCanvas(ctx, shaderCanvas, 0, 0, 1);
        }
        if (roadCanvas) {
            ctx.drawImage(roadCanvas, 0, 0);
        }
        if (bridgeCanvas) {
            ctx.drawImage(bridgeCanvas, 0, 0);
        }

        const roadKey = this.getProceduralRoadCacheKey(tile) ?? '-';
        const bridgeKey = this.getProceduralBridgeCacheKey(tile) ?? '-';
        const signature = [
            tile.id,
            state.key,
            state.maskedCanvasKey,
            this.getTileColorAdjustmentKey(adjustment),
            this.getTileShaderCacheKey(tile, state.key),
            roadKey,
            bridgeKey,
        ].join(':');

        return { canvas, signature };
    }

    private collectWaterReflectionSamples(tile: Tile, now: number): { signature: string; samples: WaterReflectionSample[] } {
        const signatureParts: string[] = [`tile:${tile.id}:${tile.variant ?? '-'}`];
        const samples: WaterReflectionSample[] = [];

        for (const side of SIDE_NAMES) {
            if (!this.shouldRenderWaterReflectionSide(side)) {
                signatureParts.push(`${side}:disabled`);
                continue;
            }

            const neighbor = tile.neighbors?.[side];
            if (!neighbor?.discovered || !neighbor.terrain || neighbor.terrain === 'water') {
                signatureParts.push(`${side}:-`);
                continue;
            }

            const reflectionSource = this.buildReflectableTileCanvas(neighbor, now);
            if (!reflectionSource) {
                signatureParts.push(`${side}:missing`);
                continue;
            }
            const signature = `${side}:${reflectionSource.signature}`;
            signatureParts.push(signature);
            samples.push({
                side,
                source: reflectionSource.canvas,
                signature,
                alpha: this.getWaterReflectionSampleStrength(neighbor),
            });
        }

        return {
            signature: signatureParts.join('|'),
            samples,
        };
    }

    private drawWaterReflectionSample(
        ctx: CanvasRenderingContext2D,
        sample: WaterReflectionSample,
    ) {
        const vertices = this.getHexVertices(this.HEX_SIZE, this.HEX_SIZE);
        const [startIndex, endIndex] = this.getWaterReflectionEdgeVertexIndexes(sample.side);
        const start = vertices[startIndex]!;
        const end = vertices[endIndex]!;
        const mid = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
        };
        const center = {
            x: this.TILE_DRAW_SIZE / 2,
            y: this.TILE_DRAW_SIZE / 2,
        };

        let angle = Math.atan2(end.y - start.y, end.x - start.x);
        const inwardX = center.x - mid.x;
        const inwardY = center.y - mid.y;
        const inwardLocalY = (inwardX * -Math.sin(angle)) + (inwardY * Math.cos(angle));
        if (inwardLocalY < 0) {
            angle += Math.PI;
        }

        const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
        const depth = Math.max(18, Math.round(this.TILE_DRAW_SIZE * 0.38));
        const outerHalfWidth = edgeLength * 0.63;
        const innerHalfWidth = edgeLength * 0.56;
        const drawSize = Math.round(this.TILE_DRAW_SIZE * 1.16);
        const verticalInset = 1;
        const neighborOffsetX = mid.x - center.x;
        const neighborOffsetY = mid.y - center.y;

        ctx.save();
        ctx.translate(mid.x, mid.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-outerHalfWidth, 0);
        ctx.lineTo(outerHalfWidth, 0);
        ctx.lineTo(innerHalfWidth, depth);
        ctx.lineTo(-innerHalfWidth, depth);
        ctx.closePath();
        ctx.clip();

        ctx.globalAlpha = sample.alpha;
        ctx.save();
        ctx.scale(1, -1);
        ctx.rotate(-angle);
        ctx.drawImage(
            sample.source,
            neighborOffsetX - (drawSize / 2),
            neighborOffsetY - (drawSize / 2) + verticalInset,
            drawSize,
            drawSize,
        );
        ctx.restore();
        ctx.globalAlpha = 1;

        const fade = ctx.createLinearGradient(0, 0, 0, depth);
        fade.addColorStop(0, 'rgba(255,255,255,1)');
        fade.addColorStop(0.24, 'rgba(255,255,255,0.98)');
        fade.addColorStop(0.72, 'rgba(255,255,255,0.5)');
        fade.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = fade;
        ctx.fillRect(-outerHalfWidth - 2, 0, (outerHalfWidth * 2) + 4, depth);
        ctx.restore();
    }

    private buildWaterReflectionCanvas(tile: Tile, now: number): HTMLCanvasElement | null {
        if (!this.shouldRenderWaterReflections(tile)) {
            return null;
        }

        const { signature, samples } = this.collectWaterReflectionSamples(tile, now);
        if (!samples.length) {
            return null;
        }

        const cacheKey = `v${HexMapService.TILE_SHORELINE_VERSION}:${signature}`;
        const cached = this.getCachedCanvas(this._tileShorelineCache, cacheKey);
        if (cached) {
            return cached;
        }

        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        ctx.imageSmoothingEnabled = false;
        for (const sample of samples) {
            this.drawWaterReflectionSample(ctx, sample);
        }

        return this.storeCachedCanvas(
            this._tileShorelineCache,
            cacheKey,
            canvas,
            HexMapService.TILE_SHORELINE_CACHE_MAX,
        );
    }

    private drawTileWaterReflectionStage(ctx: CanvasRenderingContext2D, state: TileRenderState) {
        if (state.opacity <= 0.03) {
            return;
        }

        const reflectionCanvas = this.buildWaterReflectionCanvas(state.tile, state.now);
        if (!reflectionCanvas) {
            return;
        }

        ctx.globalAlpha = state.opacity;
        ctx.drawImage(reflectionCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
    }

    private drawTileTerrainOverlayStage(ctx: CanvasRenderingContext2D, state: TileRenderState) {
        const overlayKey = this.getTileOverlayKey(state.tile);
        if (!overlayKey) {
            return;
        }

        const overlayImg = this._images[overlayKey];
        if (!overlayImg) {
            return;
        }

        const off = this.getTileOverlayOffset(state.tile);
        const baseKey = this.getTileImageKey(state.tile) ?? state.tile.terrain ?? 'plains';
        const sourceWidth = overlayImg.naturalWidth || overlayImg.width || this.TILE_DRAW_SIZE;
        const sourceHeight = overlayImg.naturalHeight || overlayImg.height || this.TILE_DRAW_SIZE;
        const drawWidth = this.TILE_DRAW_SIZE;
        const drawHeight = Math.round((sourceHeight / sourceWidth) * drawWidth);
        const overlaySource = this.buildShadedTileOverlayCanvas(
            state.tile,
            baseKey,
            overlayKey,
            overlayImg,
            drawWidth,
            drawHeight,
        ) ?? overlayImg;

        ctx.globalAlpha = state.opacity;
        ctx.drawImage(
            overlaySource,
            state.x - this.HEX_SIZE + off.x,
            state.y - this.HEX_SIZE + off.y,
            drawWidth,
            drawHeight,
        );
    }

    private drawTileProceduralStage(ctx: CanvasRenderingContext2D, state: TileRenderState) {
        const proceduralRoadCanvas = this.getProceduralRoadCanvas(state.tile);
        if (proceduralRoadCanvas) {
            ctx.drawImage(proceduralRoadCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
        }

        const proceduralBridgeCanvas = this.getProceduralBridgeCanvas(state.tile);
        if (proceduralBridgeCanvas) {
            ctx.drawImage(proceduralBridgeCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
        }
    }

    private ensureTileCompositeScratchSurface() {
        if (!this._tileCompositeScratchCanvas) {
            this._tileCompositeScratchCanvas = this.createTileSizedCanvas();
            this._tileCompositeScratchCtx = this._tileCompositeScratchCanvas.getContext('2d');
            if (this._tileCompositeScratchCtx) {
                this._tileCompositeScratchCtx.imageSmoothingEnabled = false;
            }
        }

        return this._tileCompositeScratchCanvas && this._tileCompositeScratchCtx
            ? {
                canvas: this._tileCompositeScratchCanvas,
                ctx: this._tileCompositeScratchCtx,
            }
            : null;
    }

    private drawTileCompositeOnce(
        ctx: CanvasRenderingContext2D,
        state: TileRenderState,
        includeTerrainOverlay: boolean,
    ) {
        const scratch = this.ensureTileCompositeScratchSurface();
        if (!scratch) {
            return false;
        }

        scratch.ctx.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
        const localState: TileRenderState = {
            ...state,
            x: this.HEX_SIZE,
            y: this.HEX_SIZE,
            opacity: 1,
        };

        this.drawTileBaseStage(scratch.ctx, localState);
        this.drawTileShaderStage(scratch.ctx, localState);
        this.drawTileWaterReflectionStage(scratch.ctx, localState);
        this.drawTileProceduralStage(scratch.ctx, localState);
        if (includeTerrainOverlay) {
            this.drawTileTerrainOverlayStage(scratch.ctx, localState);
        }

        ctx.globalAlpha = state.opacity;
        ctx.drawImage(scratch.canvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
        return true;
    }

    private drawTile(t: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number) {
        const state = this.createTileRenderState(t, now, opacity);
        if (!state) return;

        const inlineTerrainOverlay = this.shouldRenderTileOverlayInline(t);
        if (inlineTerrainOverlay && state.opacity < 0.999 && this.drawTileCompositeOnce(ctx, state, true)) {
            ctx.globalAlpha = 1;
            return;
        }

        this.drawTileBaseStage(ctx, state);
        this.drawTileShaderStage(ctx, state);
        this.drawTileWaterReflectionStage(ctx, state);
        this.drawTileProceduralStage(ctx, state);
        if (inlineTerrainOverlay) {
            this.drawTileTerrainOverlayStage(ctx, state);
        }
        ctx.globalAlpha = 1;
    }

    private getCachedCanvas(cache: Map<string, HTMLCanvasElement>, key: string) {
        const canvas = cache.get(key);
        if (!canvas) return null;

        cache.delete(key);
        cache.set(key, canvas);
        return canvas;
    }

    private storeCachedCanvas(
        cache: Map<string, HTMLCanvasElement>,
        key: string,
        canvas: HTMLCanvasElement,
        maxSize: number,
    ) {
        cache.set(key, canvas);
        if (cache.size > maxSize) {
            const firstKey = cache.keys().next().value;
            if (firstKey !== undefined) cache.delete(firstKey);
        }
        return canvas;
    }

    private getOverlayOpaqueBounds(overlayKey: string, overlayImg: HTMLImageElement) {
        if (this._tileOverlayAlphaBoundsCache.has(overlayKey)) {
            return this._tileOverlayAlphaBoundsCache.get(overlayKey) ?? null;
        }

        const sourceWidth = overlayImg.naturalWidth || overlayImg.width;
        const sourceHeight = overlayImg.naturalHeight || overlayImg.height;
        if (!sourceWidth || !sourceHeight) {
            this._tileOverlayAlphaBoundsCache.set(overlayKey, null);
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            this._tileOverlayAlphaBoundsCache.set(overlayKey, null);
            return null;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(overlayImg, 0, 0, sourceWidth, sourceHeight);
        const data = ctx.getImageData(0, 0, sourceWidth, sourceHeight).data;

        let top = -1;
        let bottom = -1;
        for (let y = 0; y < sourceHeight; y++) {
            for (let x = 0; x < sourceWidth; x++) {
                const alpha = data[((y * sourceWidth) + x) * 4 + 3] ?? 0;
                if (alpha > 0) {
                    if (top === -1) top = y;
                    bottom = y;
                    break;
                }
            }
        }

        const bounds = top === -1 || bottom === -1 ? null : { top, bottom };
        this._tileOverlayAlphaBoundsCache.set(overlayKey, bounds);
        return bounds;
    }

    private applyOverlayFeatherMask(
        ctx: CanvasRenderingContext2D,
        overlayKey: string,
        overlayImg: HTMLImageElement,
        drawWidth: number,
        drawHeight: number,
    ) {
        const bounds = this.getOverlayOpaqueBounds(overlayKey, overlayImg);
        if (!bounds) {
            return;
        }

        const sourceHeight = overlayImg.naturalHeight || overlayImg.height || drawHeight;
        if (!sourceHeight) {
            return;
        }

        const scaleY = drawHeight / sourceHeight;
        const top = bounds.top * scaleY;
        const bottom = (bounds.bottom + 1) * scaleY;
        const opaqueHeight = Math.max(1, bottom - top);
        const featherPx = Math.max(3, Math.min(12, opaqueHeight * 0.36));
        const fadeStart = Math.max(top, bottom - featherPx);
        const span = Math.max(1, bottom - top);
        const fadeStop = Math.max(0, Math.min(1, (fadeStart - top) / span));

        const mask = ctx.createLinearGradient(0, top, 0, bottom);
        mask.addColorStop(0, 'rgba(255,255,255,1)');
        mask.addColorStop(fadeStop, 'rgba(255,255,255,1)');
        mask.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = mask;
        ctx.fillRect(0, 0, drawWidth, drawHeight);
    }

    private createTileSizedCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = this.TILE_DRAW_SIZE;
        canvas.height = this.TILE_DRAW_SIZE;
        return canvas;
    }

    private getProceduralRoadCacheKey(tile: Tile) {
        if (!isRoadTile(tile)) return null;

        const roadMask = SIDE_NAMES
            .map((side) => (isRoadConnectionTarget(tile.neighbors?.[side], OPPOSITE_SIDE[side]) ? side : '-'))
            .join('');

        return `${tile.q},${tile.r}:${tile.variant ?? ''}:${roadMask}`;
    }

    private getProceduralRoadCanvas(tile: Tile) {
        const cacheKey = this.getProceduralRoadCacheKey(tile);
        if (!cacheKey) return null;

        const cached = this.getCachedCanvas(this._proceduralRoadCache, cacheKey);
        if (cached) return cached;

        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        this.drawProceduralRoad(ctx, tile, this.HEX_SIZE, this.HEX_SIZE, 1);
        return this.storeCachedCanvas(
            this._proceduralRoadCache,
            cacheKey,
            canvas,
            HexMapService.PROCEDURAL_ROAD_CACHE_MAX,
        );
    }

    private getProceduralBridgeCacheKey(tile: Tile) {
        if (!isBridgeTile(tile) && !isTunnelTile(tile)) return null;
        return `${tile.q},${tile.r}:${tile.variant ?? ''}`;
    }

    private getProceduralBridgeCanvas(tile: Tile) {
        const cacheKey = this.getProceduralBridgeCacheKey(tile);
        if (!cacheKey) return null;

        const cached = this.getCachedCanvas(this._proceduralBridgeCache, cacheKey);
        if (cached) return cached;

        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        this.drawProceduralBridge(ctx, tile, this.HEX_SIZE, this.HEX_SIZE, 1);
        return this.storeCachedCanvas(
            this._proceduralBridgeCache,
            cacheKey,
            canvas,
            HexMapService.PROCEDURAL_BRIDGE_CACHE_MAX,
        );
    }
    private _fogTileCanvas: HTMLCanvasElement | null = null;
    private _proceduralRoadCache = new Map<string, HTMLCanvasElement>();
    private _proceduralBridgeCache = new Map<string, HTMLCanvasElement>();
    private static readonly PROCEDURAL_ROAD_CACHE_MAX = 768;
    private static readonly PROCEDURAL_BRIDGE_CACHE_MAX = 512;
    private static readonly MASKED_TILE_CANVAS_CACHE_MAX = 384;
    private static readonly TILE_COLOR_VARIANT_VERSION = 7;
    private static readonly TILE_COLOR_VARIANT_CACHE_MAX = 2048;
    private static readonly TILE_SHADER_VERSION = 4;
    private static readonly TILE_SHADER_CACHE_MAX = 192;
    private static readonly TILE_SHORELINE_VERSION = 4;
    private static readonly TILE_SHORELINE_CACHE_MAX = 1024;
    private static readonly TILE_OVERLAY_SHADER_CACHE_MAX = 1024;
    private static readonly TILE_OVERLAY_SHADER_VERSION = 10;

    private ensureFogTileCanvas(): HTMLCanvasElement {
        if (this._fogTileCanvas) return this._fogTileCanvas;
        const w = this.TILE_DRAW_SIZE;
        const h = this.TILE_DRAW_SIZE;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d')!;

        // Clip to hex shape
        g.save();
        g.beginPath();
        g.moveTo(0.5 * w, 0);
        g.lineTo(w, 0.25 * h);
        g.lineTo(w, 0.75 * h);
        g.lineTo(0.5 * w, h);
        g.lineTo(0, 0.75 * h);
        g.lineTo(0, 0.25 * h);
        g.closePath();
        g.clip();

        // Dark atmospheric base
        const baseFill = g.createLinearGradient(0, 0, w, h);
        baseFill.addColorStop(0, '#2d3a52');
        baseFill.addColorStop(0.5, '#323e58');
        baseFill.addColorStop(1, '#283248');
        g.fillStyle = baseFill;
        g.fillRect(0, 0, w, h);

        // Soft procedural fog wisps using overlapping radial gradients
        const fogSpots = [
            { cx: 0.28 * w, cy: 0.22 * h, r: 0.38 * w, a: 0.12 },
            { cx: 0.72 * w, cy: 0.65 * h, r: 0.34 * w, a: 0.10 },
            { cx: 0.5 * w,  cy: 0.48 * h, r: 0.42 * w, a: 0.08 },
            { cx: 0.18 * w, cy: 0.72 * h, r: 0.28 * w, a: 0.06 },
        ];
        for (const spot of fogSpots) {
            const grad = g.createRadialGradient(spot.cx, spot.cy, 0, spot.cx, spot.cy, spot.r);
            grad.addColorStop(0, `rgba(140, 160, 200, ${spot.a})`);
            grad.addColorStop(0.6, `rgba(100, 120, 160, ${spot.a * 0.5})`);
            grad.addColorStop(1, `rgba(80, 100, 140, 0)`);
            g.fillStyle = grad;
            g.beginPath();
            g.arc(spot.cx, spot.cy, spot.r, 0, Math.PI * 2);
            g.fill();
        }

        // Inner edge darkening vignette
        const vignette = g.createRadialGradient(w * 0.5, h * 0.5, w * 0.15, w * 0.5, h * 0.5, w * 0.55);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(10,14,24,0.28)');
        g.fillStyle = vignette;
        g.fillRect(0, 0, w, h);

        g.restore();

        // Subtle hex border
        g.strokeStyle = 'rgba(90, 110, 145, 0.25)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0.5 * w, 0.5);
        g.lineTo(w - 0.5, 0.25 * h);
        g.lineTo(w - 0.5, 0.75 * h);
        g.lineTo(0.5 * w, h - 0.5);
        g.lineTo(0.5, 0.75 * h);
        g.lineTo(0.5, 0.25 * h);
        g.closePath();
        g.stroke();

        this._fogTileCanvas = c;
        return c;
    }

    private drawUndiscoveredTile(ctx: CanvasRenderingContext2D, opacity: number, t: Tile, inReach: boolean = true) {
        const {x, y} = axialToPixel(t.q, t.r);
        const fogCanvas = this.ensureFogTileCanvas();
        const reachDim = inReach ? 1 : 0.35;

        ctx.globalAlpha = opacity * 0.85 * reachDim;
        ctx.drawImage(fogCanvas, x - this.HEX_SIZE, y - this.HEX_SIZE);

        if (this._currentRenderQuality.enableFogShimmer) {
            this._fogShimmerEffect.drawTileShimmer(
                ctx,
                t.q,
                t.r,
                x,
                y,
                this.TILE_DRAW_SIZE,
                this.HEX_SIZE,
                reachDim,
                (targetCtx, hexX, hexY) => this.drawHexPath(targetCtx, hexX, hexY),
            );
        }

        if (t.scouted) {
            this.drawHexHighlight(
                ctx,
                t.q,
                t.r,
                SCOUTED_TILE_STYLE.fill,
                t.scoutFoundResource ? SCOUTED_TILE_STYLE.foundStroke : SCOUTED_TILE_STYLE.stroke,
                opacity * (t.scoutFoundResource ? 0.78 : 0.55) * reachDim,
            );
        }

        // Distance label with glow
        const centerDist = getDistanceToNearestTowncenter(t.q, t.r);
        ctx.save();
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(80, 130, 200, 0.5)';
        ctx.shadowBlur = 4;
        ctx.globalAlpha = 0.42 * opacity * reachDim;
        ctx.fillStyle = 'rgba(180, 200, 240, 0.9)';
        ctx.fillText(String(centerDist), x, y);
        ctx.restore();
    }

    private drawHeroes(ctx: CanvasRenderingContext2D, hoveredHero: Hero | null, overlayRecords: OverlayRecord[] = [], applyCameraFade: boolean = true, now: number = Date.now()) {
        this.queueMissingHeroAssets();

        // If hero assets not yet loaded, just draw overlays and return
        if (!this._heroImagesLoaded) {
            for (const ov of overlayRecords) {
                ctx.globalAlpha = ov.opacity;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(ov.source, ov.x, ov.y, ov.width, ov.height);
            }
            ctx.globalAlpha = 1;
            return;
        }

        const radius = camera.radius + 1;
        // Rebuild layout map (group heroes by tile first)
        const map = new Map<string, Hero[]>();
        for (const h of heroes) {
            const key = axialKey(h.q, h.r);
            let list = map.get(key);
            if (!list) {
                list = [];
                map.set(key, list);
            }
            list.push(h);
        }
        this._heroLayouts = new Map();
        for (const [k, list] of map) this._heroLayouts.set(k, this.computeTileHeroOffsets(list));

        // Build hero render records
        // Note: Hero activities are updated by the movement system, not here in the draw loop
        const renderRecords: Array<{
            hero: Hero;
            dist: number;
            img: HTMLImageElement;
            pos: { x: number; y: number };
            interp: { x: number; y: number };
            destX: number;
            destY: number;
            opacity: number;
            activity: string;
            animRow: number;
            frameIndex: number;
        }> = [];

        for (const h of heroes) {
            const dist = hexDistance(camera, h);
            if (dist > radius) continue;
            const img = this._heroImages[h.avatar];
            if (!img) continue;
            const layout = this._heroLayouts.get(axialKey(h.q, h.r)) || {};
            const pos = layout[h.id] || {x: 0, y: 0};
            const opacity = this.getActorOpacity(dist, applyCameraFade);
            const interp = this.getHeroInterpolatedPixelPosition(h, now);
            const heroImpactOffset = getHeroImpactOffset(h.id, h.facing, now);
            const x = interp.x + heroImpactOffset.x;
            const y = interp.y + heroImpactOffset.y;
            const destX = x - (this.heroFrameSize * this.heroZoom) / 2 + pos.x - (this.heroFrameSize / 2);
            const destY = y - (this.heroFrameSize * 2) + (this.heroFrameSize / 2) + pos.y;
            const movementStarted = this.hasMovementStarted(h, now);
            let remaining = movementStarted && h.movement ? h.movement.path.length : 0;
            let activity = resolveActivity(remaining);
            if (!h.movement && h.currentTaskId) {
                const inst = taskStore.taskIndex[h.currentTaskId];
                if (isHeroWorkingTask(h, inst)) activity = 'attack';
            } else if (!h.movement && isHeroSurveyingScoutResource(h, now)) {
                activity = 'attack';
            }
            const animName = heroAnimName(activity, h.facing);
            const anim = heroAnimationSet.get(animName) || heroAnimationSet.get('idleDown')!;
            const elapsed = now - this._heroAnimStart;
            const frames = anim.frames;
            const frameDuration = anim.frameDuration;
            const cycle = frames * frameDuration + (anim.cooldown || 0);
            const inCycle = elapsed % cycle;
            const frameIndex = (frames <= 1) ? 0 : (inCycle >= frames * frameDuration ? frames - 1 : Math.floor(inCycle / frameDuration));
            this._lastHeroFrame = frameIndex; // keep updated (last processed frame suffices for picking accuracy)
            renderRecords.push({
                hero: h,
                dist,
                img,
                pos,
                interp,
                destX,
                destY,
                opacity,
                activity,
                animRow: anim.row,
                frameIndex
            });
        }

        // Merge overlays and heroes using axial coordinate ordering (r then q ascending).
        type LayerRec = { kind: 'overlay'; ov: OverlayRecord } | { kind: 'hero'; rec: typeof renderRecords[number] };
        const layers: LayerRec[] = [];
        for (const ov of overlayRecords) layers.push({ kind: 'overlay', ov });
        for (const rr of renderRecords) layers.push({ kind: 'hero', rec: rr });
        layers.sort((a, b) => {
            const ar = a.kind === 'overlay' ? a.ov.r : tileIndex[axialKey(a.rec.hero.q, a.rec.hero.r)] ? a.rec.hero.r+1 : a.rec.destY; // hero.r available
            const br = b.kind === 'overlay' ? b.ov.r : tileIndex[axialKey(b.rec.hero.q, b.rec.hero.r)] ? b.rec.hero.r : b.rec.destY;
            if (ar !== br) return ar - br; // smaller r ("lower" coord) first
            const aq = a.kind === 'overlay' ? a.ov.q : a.rec.hero.q;
            const bq = b.kind === 'overlay' ? b.ov.q : b.rec.hero.q;
            if (aq !== bq) return aq - bq; // then q
            if (a.kind === 'overlay' && b.kind === 'overlay' && a.ov.z !== b.ov.z) return a.ov.z - b.ov.z;
            // Tie-break: if same tile, draw overlay before hero so hero remains on top (overlay NOT above hero on same tile)
            if (a.kind !== b.kind) return a.kind === 'overlay' ? -1 : 1;
            if (a.kind === 'hero' && b.kind === 'hero') return a.rec.hero.id.localeCompare(b.rec.hero.id);
            return 0;
        });
        this._sortedHeroes = layers.filter(l => l.kind === 'hero').map(l => (l as any).rec.hero);
        for (const layer of layers) {
            if (layer.kind === 'overlay') {
                const {ov} = layer;
                ctx.globalAlpha = ov.opacity;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(ov.source, ov.x, ov.y, ov.width, ov.height);
                continue;
            }
            const { hero: h, img, pos, interp, destX, destY, opacity, frameIndex, animRow } = layer.rec;
            const x = interp.x;
            const y = interp.y;
            // Shadow first
            ctx.save();
            const shadowScale = this.heroZoom;
            const shadowW = this.heroFrameSize * shadowScale * this.heroShadowWidthFactor;
            const shadowH = this.heroFrameSize * shadowScale * this.heroShadowHeightFactor;
            const baseX = x + pos.x - 15;
            const baseY = y + pos.y + this.heroFrameSize * this.heroShadowYOffset;
            ctx.globalAlpha = opacity * this.heroShadowOpacity;
            ctx.translate(baseX, baseY);
            ctx.beginPath();
            ctx.ellipse(0, 0, shadowW / 2.8, shadowH / 2.2, 0, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(0, 0, shadowH * 0.05, 0, 0, shadowW / 2);
            grad.addColorStop(0, 'rgba(0,0,0,0.8)');
            grad.addColorStop(0.8, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();

            const tile = tileIndex[axialKey(h.q, h.r)];
            const tileKey = tile ? (this.getTileImageKey(tile) ?? tile.terrain ?? '') : '';
            if (h.movement && tile && this.isDustyWalkingTerrain(tile, tileKey)) {
                this.drawWalkingDust(ctx, h, interp, pos, opacity, now, tile, tileKey);
            }

            const selected = (selectedHeroId.value === h.id);
            const hovered = hoveredHero && hoveredHero.id === h.id;
            if (selected || (this._currentRenderQuality.enableHeroAuras && hovered)) {
                this._auraEffect.drawHeroSelectionAura(
                    ctx,
                    interp,
                    pos,
                    opacity,
                    selected,
                    now,
                    this.heroFrameSize,
                    this.heroShadowYOffset,
                );
            }

            ctx.globalAlpha = opacity;
            ctx.imageSmoothingEnabled = false;
            const frameSize = this.heroFrameSize;
            let sx = frameIndex * frameSize;
            const sy = animRow * frameSize;
            if (shouldFlip(h.facing)) {
                ctx.save();
                ctx.translate(destX + frameSize * this.heroZoom, destY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, frameSize * this.heroZoom, frameSize * this.heroZoom);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy, frameSize, frameSize, destX, destY, frameSize * this.heroZoom, frameSize * this.heroZoom);
            }
            // payload carry indicator
            if (h.carryingPayload) {
                ctx.save();
                ctx.globalAlpha = opacity;
                const iconY = destY; // above head
                const iconX = destX + (this.heroFrameSize * this.heroZoom) / 2;
                ctx.beginPath();
                ctx.arc(iconX, iconY, 14, 0, Math.PI * 2);
                ctx.fillStyle = h.carryingPayload.amount > 0 ?  'rgba(29,29,33,0.95)' : 'rgba(122,122,122,0.55)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = h.carryingPayload.amount > 0 ? 'rgba(70,70,70,0.9)' : 'rgba(75,0,0,0.85)';
                ctx.stroke();
                ctx.font = '700 16px system-ui';
                ctx.fillStyle = '#fff6d7';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.RESOURCE_ICON_MAP[h.carryingPayload.type], iconX, iconY + 1);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    }

    RESOURCE_ICON_MAP: Record<ResourceType, string> = {
        wood: '🪵',
        ore: '⛏️',
        stone: '🪨',
        tools: '🛠️',
        food: '🍎',
        crystal: '🔮',
        artifact: '🗿',
        water: '💧',
        grain: '🌾',
        water_lily: '🪷',
    };

    private getTileOverlayKey(t: Tile): string | null {
        if (!t.terrain) return null;
        const def: any = (TERRAIN_DEFS as any)[t.terrain];
        let overlayKey: string | undefined = def?.overlayAssetKey;
        if (t.variant && def?.variations) {
            const vDef = def.variations.find((v: any) => v.key === t.variant);
            if (vDef?.overlayAssetKey) overlayKey = vDef.overlayAssetKey;
            if(vDef?.overlayAssetKey === false) overlayKey = undefined;
        } else {
            const decorative = getDecorativeSelectionForTile(t);
            if (decorative?.overlayKey) overlayKey = decorative.overlayKey;
            if (decorative?.overlayKey === null) overlayKey = undefined;
        }
        if (!overlayKey) return null;
        return this.tileImgSources[overlayKey] ? overlayKey : null;
    }

    private getTileOverlayOffset(t: Tile): { x: number; y: number } {
        if (!t.terrain) return {x:0,y:0};
        const def: any = (TERRAIN_DEFS as any)[t.terrain];
        let offset = def?.overlayOffset || {x:0,y:0};
        if (t.variant && def?.variations) {
            const vDef = def.variations.find((v: any) => v.key === t.variant);
            if (vDef?.overlayOffset) offset = vDef.overlayOffset;
        } else {
            const decorative = getDecorativeSelectionForTile(t);
            if (decorative?.overlayOffset) offset = decorative.overlayOffset;
        }
        return offset || {x:0,y:0};
    }

    private getBuildingOverlayKey(tile: Tile): string | null {
        const building = getBuildingDefinitionForTile(tile);
        const overlayKey = building?.overlayAssetKey;
        if (!overlayKey) return null;
        return this.tileImgSources[overlayKey] ? overlayKey : null;
    }

    private getBuildingOverlayOffset(tile: Tile): { x: number; y: number } {
        return getBuildingDefinitionForTile(tile)?.overlayOffset ?? { x: 0, y: 0 };
    }

    private async loadTileImages() {
        // Pre-mask all static images; if animated frames needed later, handled per draw.
        const canvasCache = new Map<string, HTMLCanvasElement>();
        for (const [key, src] of Object.entries(this.tileImgSources)) {
            const img = new Image();
            img.src = src;
            await img.decode().catch(() => {});
            this._images[key] = img;
            // Build masked hex canvas
            const c = document.createElement('canvas');
            c.width = this.TILE_DRAW_SIZE;
            c.height = this.TILE_DRAW_SIZE;
            const g = c.getContext('2d')!;
            g.save();
            g.beginPath();
            const w = this.TILE_DRAW_SIZE;
            const h = this.TILE_DRAW_SIZE;
            g.moveTo(0.5 * w, 0);
            g.lineTo(w, 0.25 * h);
            g.lineTo(w, 0.75 * h);
            g.lineTo(0.5 * w, h);
            g.lineTo(0, 0.75 * h);
            g.lineTo(0, 0.25 * h);
            g.closePath();
            g.clip();
            g.drawImage(img, 0, 0, w, h);
            g.restore();
            canvasCache.set(key, c);
        }
        this._maskedImages = canvasCache;
        this._imagesLoaded = true;
    }

    private async loadToolImages() {
        for (const [key, src] of Object.entries(this.toolImgSources)) {
            const img = new Image();
            img.src = src;
            await img.decode().catch(() => {});
            this._toolImages[key] = img;
        }
        this._toolImagesLoaded = true;
    }

    private async loadSettlerImages() {
        for (const [key, src] of Object.entries(this.settlerImgSources)) {
            const img = new Image();
            img.src = src;
            await img.decode().catch(() => {});
            this._settlerImages[key] = img;
        }
        this._settlerImagesLoaded = true;
    }

    private buildHeroMasks(img: HTMLImageElement, avatar: string) {
        if (!this._heroMasksByRow[avatar]) this._heroMasksByRow[avatar] = {};
        if (!this._heroEdgePixelsByRow[avatar]) this._heroEdgePixelsByRow[avatar] = {};
        const processedRows = new Set<number>();
        for (const anim of heroAnimationSet.list()) {
            const row = anim.row;
            if (processedRows.has(row)) continue;
            processedRows.add(row);
            const frames = anim.frames;
            const masks: Uint8Array[] = [];
            const edges: { x: number; y: number }[][] = [];
            for (let f = 0; f < frames; f++) {
                const sx = f * this.heroFrameSize;
                const sy = row * this.heroFrameSize;
                const c = document.createElement('canvas');
                c.width = this.heroFrameSize;
                c.height = this.heroFrameSize;
                const g = c.getContext('2d')!;
                g.drawImage(img, sx, sy, this.heroFrameSize, this.heroFrameSize, 0, 0, this.heroFrameSize, this.heroFrameSize);
                const data = g.getImageData(0, 0, this.heroFrameSize, this.heroFrameSize);
                const mask = new Uint8Array(this.heroFrameSize * this.heroFrameSize);
                const edgeList: { x: number; y: number }[] = [];
                for (let y = 0; y < this.heroFrameSize; y++) {
                    for (let x = 0; x < this.heroFrameSize; x++) {
                        const idx = (y * this.heroFrameSize + x) * 4;
                        const alpha = data.data[idx + 3]!;
                        if (alpha > 20) mask[y * this.heroFrameSize + x] = 1;
                    }
                }
                for (let y = 0; y < this.heroFrameSize; y++) {
                    for (let x = 0; x < this.heroFrameSize; x++) {
                        if (!mask[y * this.heroFrameSize + x]) continue;
                        let edge = false;
                        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
                        for (const [dx, dy] of dirs) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || nx >= this.heroFrameSize || ny < 0 || ny >= this.heroFrameSize || !mask[ny * this.heroFrameSize + nx]) {
                                edge = true;
                                break;
                            }
                        }
                        if (edge) edgeList.push({x, y});
                    }
                }
                masks.push(mask);
                edges.push(edgeList);
            }
            this._heroMasksByRow[avatar][row] = masks;
            this._heroEdgePixelsByRow[avatar][row] = edges;
        }
    }

    private drawTextIndicators(ctx: CanvasRenderingContext2D, nowMs: number, cameraFx: CameraCompositeState = this._currentCameraFx) {
        for (const ind of getTextIndicators()) {
            const anchorQ = ind.position.q;
            const anchorR = ind.position.r;
            const dist = hexDistance(camera, {q: anchorQ, r: anchorR});
            if (dist > camera.radius + 1) continue;

            let worldAnchor = ind.worldAnchor;

            if (!worldAnchor) {
                const {x, y} = axialToPixel(anchorQ, anchorR);
                const pos = ind.position.currentOffset || {x: 0, y: 0};
                worldAnchor = {
                    x: x + pos.x - (this.heroFrameSize / 2),
                    y: y + pos.y - (this.heroFrameSize * 1.5) - 8,
                };
                ind.worldAnchor = worldAnchor;
            }

            const progress = Math.min(1, (nowMs - ind.created) / ind.duration);
            const anchor = worldAnchor
                ? this.projectWorldToScreenPixels(worldAnchor.x, worldAnchor.y, cameraFx)
                : null;
            if (!anchor) continue;
            const floatY = anchor.y - (progress * 28);
            const alpha = 1 - progress;
            if (this._canvas) {
                const width = this._canvas.width / this._dpr;
                const height = this._canvas.height / this._dpr;
                const margin = 48;
                if (anchor.x < -margin || anchor.x > width + margin || floatY < -margin || floatY > height + margin) {
                    continue;
                }
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = "12px 'Press Start 2P', 'VT323', 'Courier New', monospace";
            ctx.fillStyle = ind.color || '#ffe066';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(24, 16, 8, 0.45)';
            ctx.strokeText(ind.text, anchor.x, floatY);
            ctx.shadowColor = 'rgba(24, 16, 8, 0.7)';
            ctx.shadowBlur = 4;
            ctx.fillText(ind.text, anchor.x, floatY);
            ctx.restore();
        }
    }

    private adaptiveCameraRadius() {
        if (!this._container) return;
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        const diag = Math.min(w, h);
        const tilePixelSpan = this.HEX_SIZE * 2;
        const targetRadius = Math.max(8, Math.min(64, Math.round(diag / tilePixelSpan * 1.25)));
        const inner = Math.max(3, Math.round(targetRadius * 0.33));
        updateCameraRadius(targetRadius, inner);
    }

    private loadHeroAsset(avatar: string): Promise<void> {
        if (this._heroImages[avatar]) {
            this.buildHeroMasks(this._heroImages[avatar], avatar);
            return Promise.resolve();
        }

        const existingPromise = this._pendingHeroImageLoads.get(avatar);
        if (existingPromise) {
            return existingPromise;
        }

        const source = this.heroImgSources[avatar];
        if (!source) {
            return Promise.resolve();
        }

        const promise = new Promise<void>((resolve) => {
            const img = new Image();
            const finalize = () => {
                this._pendingHeroImageLoads.delete(avatar);
                resolve();
            };

            img.onload = () => {
                this._heroImages[avatar] = img;
                this.buildHeroMasks(img, avatar);
                finalize();
            };
            img.onerror = finalize;
            img.src = source;
        });

        this._pendingHeroImageLoads.set(avatar, promise);
        return promise;
    }

    private queueMissingHeroAssets() {
        const uniqueAvatars = Array.from(new Set(heroes.map((hero) => hero.avatar)));
        for (const avatar of uniqueAvatars) {
            if (this._heroImages[avatar] || this._pendingHeroImageLoads.has(avatar)) {
                continue;
            }

            void this.loadHeroAsset(avatar);
        }
    }

    private async ensureHeroAssets() {
        const uniqueAvatars = Array.from(new Set(heroes.map((hero) => hero.avatar)));
        await Promise.all(uniqueAvatars.map((avatar) => this.loadHeroAsset(avatar)));
        this._heroImagesLoaded = true;
    }

    // Recenter camera when world smaller than view radius so map stays centered on resize.
    private recenterIfWorldFits() {
        // Margin so we don't over-recenter for worlds just barely smaller than radius.
        const margin = 3;
        if (camera.radius >= worldOuterRadius + margin) {
            centerCamera();
        }
    }

    private isHeroIdle(hero: Hero, now: number = Date.now()): boolean {
        if (this.hasMovementStarted(hero, now)) return false;
        if (hero.currentTaskId) {
            const inst = taskStore.taskIndex[hero.currentTaskId];
            if (isHeroWorkingTask(hero, inst)) return false;
        }
        if (isHeroSurveyingScoutResource(hero, now)) return false;
        return true;
    }

    private isHeroWalking(hero: Hero, now: number = Date.now()): boolean {
        return this.hasMovementStarted(hero, now);
    }

    private hasMovementStarted(hero: Hero, now: number = Date.now()) {
        return !!hero.movement && now >= hero.movement.startMs;
    }

    private getHeroInterpolatedPixelPosition(hero: Hero, now: number) {
        if (!hero.movement) return axialToPixel(hero.q, hero.r);
        const m = hero.movement;
        const elapsed = now - m.startMs;
        if (elapsed < 0) return axialToPixel(m.origin.q, m.origin.r);

        const total = m.cumulative[m.cumulative.length - 1]!;
        if (elapsed >= total) return axialToPixel(m.target.q, m.target.r);
        // Find current step index (first cumulative > elapsed)
        let stepIndex = 0;
        while (stepIndex < m.cumulative.length && elapsed >= m.cumulative[stepIndex]!) stepIndex++;
        if (stepIndex >= m.path.length) return axialToPixel(hero.q, hero.r);
        const prevEnd = stepIndex === 0 ? 0 : m.cumulative[stepIndex - 1]!;
        const stepElapsed = elapsed - prevEnd;
        const stepDuration = m.stepDurations[stepIndex] as number;
        const progress = Math.min(1, Math.max(0, stepElapsed / stepDuration));
        const from = stepIndex === 0 ? m.origin : m.path[stepIndex - 1];
        const to = m.path[stepIndex];
        if (!from || !to) return axialToPixel(hero.q, hero.r);
        const fromPx = axialToPixel(from.q, from.r);
        const toPx = axialToPixel(to.q, to.r);

        return {x: fromPx.x + (toPx.x - fromPx.x) * progress, y: fromPx.y + (toPx.y - fromPx.y) * progress};

    }

    // Helper: draw rounded rectangle (all corners)
    private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // Helper: draw rounded rectangle only on left side (used for partial progress fill)
    private drawLeftRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    private computeTileHeroOffsets(list: Hero[]): Record<string, { x: number; y: number }> {
        const mutliplayerTileOffset = this.computeMultiplayerTileHeroOffsets(list);
        // Apply tile (variant) heroOffset if defined
        const result: Record<string, { x: number; y: number }> = {};
        for (const h of list) {
            const t = tileIndex[axialKey(h.q, h.r)];
            let variantOffset: { x: number; y: number } | null = null;
            if (t && t.terrain) {
                const def: any = (TERRAIN_DEFS as any)[t.terrain];
                if (t.variant && def?.variations) {
                    const vDef = def.variations.find((v: any) => v.key === t.variant);
                    if (vDef?.heroOffset) variantOffset = vDef.heroOffset;
                }
                if (!variantOffset && def?.heroOffset) variantOffset = def.heroOffset;
            }
            const multiOffset = mutliplayerTileOffset[h.id] || {x: 0, y: 0};
            let offset = {
                x: multiOffset.x + (variantOffset ? variantOffset.x : 0),
                y: multiOffset.y + (variantOffset ? variantOffset.y : 0),
            }
            result[h.id] = offset;
            h.currentOffset = offset;
        }
        return result;
    }

    private computeMultiplayerTileHeroOffsets(list: Hero[]): Record<string, { x: number; y: number }> {
        const result: Record<string, { x: number; y: number }> = {};
        const count = list.length;
        if (count === 0) return result;
        if (count === 1) { result[list[0]!.id] = {x: 12, y: 0}; return result; }
        if (count === 2) { result[list[0]!.id] = {x: -5, y: 0}; result[list[1]!.id] = {x: 32, y: 0}; return result; }
        if (count === 3) { result[list[0]!.id] = {x: -5, y: -2}; result[list[1]!.id] = {x: 12, y: 8}; result[list[2]!.id] = {x: 32, y: -2}; return result; }
        if (count === 4) { result[list[0]!.id] = {x: 12, y: -10}; result[list[1]!.id] = {x: -7, y: 4}; result[list[2]!.id] = {x: 32, y: 4}; result[list[3]!.id] = {x: 12, y: 18}; return result; }
        if (count === 5) { result[list[0]!.id] = {x: 16, y: -10}; result[list[1]!.id] = {x: -7, y: 4}; result[list[2]!.id] = {x: 32, y: 4}; result[list[3]!.id] = {x: 10, y: 8}; result[list[4]!.id] = {x: 16, y: 22}; return result; }
        if (count === 6) { result[list[0]!.id] = {x: 16, y: -12}; result[list[1]!.id] = {x: -10, y: 0}; result[list[2]!.id] = {x: 38, y: 0}; result[list[3]!.id] = {x: 0, y: 12}; result[list[4]!.id] = {x: 28, y: 16}; result[list[5]!.id] = {x: 16, y: 28}; return result; }
        const span = count - 1;
        for (let i = 0; i < count; i++) {
            const offset = (i - span / 2) * this.HERO_OFFSET_SPACING;
            result[list[i]!.id] = {x: offset, y: 0};
        }
        return result;
    }

    private getLegacyRoadFallbackConnections(variant: string | null | undefined): TileSide[] | null {
        switch (variant) {
            case 'road_ad':
            case 'stone_road_ad':
                return ['a', 'd'];
            case 'road_be':
            case 'stone_road_be':
                return ['b', 'e'];
            case 'road_ce':
            case 'stone_road_ce':
                return ['c', 'e'];
            case 'road_cf':
            case 'stone_road_cf':
                return ['c', 'f'];
            default:
                return null;
        }
    }

    private isStoneRoadTile(tile: Tile) {
        return typeof tile.variant === 'string' && tile.variant.startsWith('stone_road');
    }

    private getRoadConnectionSides(tile: Tile): TileSide[] {
        const connections = SIDE_NAMES.filter(side => isRoadConnectionTarget(tile.neighbors?.[side], OPPOSITE_SIDE[side]));
        if (connections.length >= 2) {
            return connections;
        }

        if (connections.length === 1) {
            const [first] = connections;
            return first ? [first] : [];
        }

        return [];
    }

    private getRoadInteriorStubSides(tile: Tile): TileSide[] {
        const legacyFallback = this.getLegacyRoadFallbackConnections(tile.variant);
        if (legacyFallback) {
            return legacyFallback;
        }

        const fallbackAxes: TileSide[][] = [['a', 'd'], ['b', 'e'], ['c', 'f']];
        const seed = this.seedFromString(`${tile.q},${tile.r}`);
        return fallbackAxes[seed % fallbackAxes.length] ?? ['c', 'f'];
    }

    private traceHexClipPath(ctx: CanvasRenderingContext2D, x: number, y: number) {
        const drawX = x - this.HEX_SIZE;
        const drawY = y - this.HEX_SIZE;
        const w = this.TILE_DRAW_SIZE;
        const h = this.TILE_DRAW_SIZE;

        ctx.beginPath();
        ctx.moveTo(drawX + (0.5 * w), drawY);
        ctx.lineTo(drawX + w, drawY + (0.25 * h));
        ctx.lineTo(drawX + w, drawY + (0.75 * h));
        ctx.lineTo(drawX + (0.5 * w), drawY + h);
        ctx.lineTo(drawX, drawY + (0.75 * h));
        ctx.lineTo(drawX, drawY + (0.25 * h));
        ctx.closePath();
    }

    private getRoadCenter(x: number, y: number) {
        return {
            x: x - (this.HEX_SPACE * 0.5),
            y: y - (this.HEX_SPACE * 0.5),
        };
    }

    private getHexVertices(x: number, y: number) {
        const drawX = x - this.HEX_SIZE;
        const drawY = y - this.HEX_SIZE;
        const w = this.TILE_DRAW_SIZE;
        const h = this.TILE_DRAW_SIZE;

        return [
            { x: drawX + (0.5 * w), y: drawY },
            { x: drawX + w, y: drawY + (0.25 * h) },
            { x: drawX + w, y: drawY + (0.75 * h) },
            { x: drawX + (0.5 * w), y: drawY + h },
            { x: drawX, y: drawY + (0.75 * h) },
            { x: drawX, y: drawY + (0.25 * h) },
        ];
    }

    private getRoadAnchorPoint(x: number, y: number, side: TileSide) {
        const center = this.getRoadCenter(x, y);
        const vertices = this.getHexVertices(x, y);
        const edgeVertices: Record<TileSide, [number, number]> = {
            a: [5, 0],
            b: [0, 1],
            c: [1, 2],
            d: [2, 3],
            e: [3, 4],
            f: [4, 5],
        };
        const [startIndex, endIndex] = edgeVertices[side];
        const start = vertices[startIndex]!;
        const end = vertices[endIndex]!;
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const dx = midX - center.x;
        const dy = midY - center.y;
        const length = Math.hypot(dx, dy) || 1;

        const overshoot = 3;
        return {
            x: midX + ((dx / length) * overshoot),
            y: midY + ((dy / length) * overshoot),
        };
    }

    private getRoadInteriorAnchorPoint(x: number, y: number, side: TileSide) {
        const center = this.getRoadCenter(x, y);
        const vertices = this.getHexVertices(x, y);
        const edgeVertices: Record<TileSide, [number, number]> = {
            a: [5, 0],
            b: [0, 1],
            c: [1, 2],
            d: [2, 3],
            e: [3, 4],
            f: [4, 5],
        };
        const [startIndex, endIndex] = edgeVertices[side];
        const start = vertices[startIndex]!;
        const end = vertices[endIndex]!;
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const dx = midX - center.x;
        const dy = midY - center.y;
        const reach = 0.58;

        return {
            x: center.x + (dx * reach),
            y: center.y + (dy * reach),
        };
    }

    private getRoadHubCenter(
        tile: Tile,
        x: number,
        y: number,
        connectionSides: TileSide[],
        anchors: Array<{ side: TileSide; x: number; y: number }>
    ) {
        const center = this.getRoadCenter(x, y);
        if (!anchors.length) {
            return center;
        }

        let sumX = 0;
        let sumY = 0;
        for (const anchor of anchors) {
            const dx = anchor.x - center.x;
            const dy = anchor.y - center.y;
            const length = Math.hypot(dx, dy) || 1;
            sumX += dx / length;
            sumY += dy / length;
        }

        let offsetStrength = 0;
        if (anchors.length === 1) {
            offsetStrength = 3.8;
        } else if (anchors.length === 2) {
            offsetStrength = this.areOppositeRoadSides(connectionSides[0]!, connectionSides[1]!) ? 0 : 5.2;
        } else if (anchors.length === 3) {
            offsetStrength = 1.6;
        }

        const magnitude = Math.hypot(sumX, sumY);
        if (!offsetStrength || magnitude < 0.0001) {
            return center;
        }

        const dirX = sumX / magnitude;
        const dirY = sumY / magnitude;
        const seed = this.seedFromString(`${tile.q},${tile.r}:road-hub`);
        const wobble = ((((seed % 1000) / 999) - 0.5) * (anchors.length === 2 ? 0.9 : 0.45));
        const perpX = -dirY;
        const perpY = dirX;

        return {
            x: center.x + (dirX * offsetStrength) + (perpX * wobble),
            y: center.y + (dirY * offsetStrength) + (perpY * wobble),
        };
    }

    private areOppositeRoadSides(sideA: TileSide, sideB: TileSide) {
        return OPPOSITE_SIDE[sideA] === sideB;
    }

    private buildRoadBranch(
        tile: Tile,
        baseCenter: { x: number; y: number },
        hubCenter: { x: number; y: number },
        anchor: { side: TileSide; x: number; y: number },
        connectionSides: TileSide[]
    ): RoadBranch | null {
        const dx = anchor.x - hubCenter.x;
        const dy = anchor.y - hubCenter.y;
        const distance = Math.hypot(dx, dy);
        if (!distance) {
            return null;
        }

        const dirX = dx / distance;
        const dirY = dy / distance;
        const perpX = -dirY;
        const perpY = dirX;
        const straightPass = connectionSides.length === 2 && connectionSides.includes(OPPOSITE_SIDE[anchor.side]);
        const hubOffsetX = hubCenter.x - baseCenter.x;
        const hubOffsetY = hubCenter.y - baseCenter.y;
        const bendFromHub = (hubOffsetX * perpX) + (hubOffsetY * perpY);
        const seed = this.seedFromString(`${tile.q},${tile.r}:${anchor.side}`);
        const jitter = ((((seed % 1000) / 999) - 0.5) * (straightPass ? 0.55 : connectionSides.length === 2 ? 1.25 : 0.85));
        const bend = (bendFromHub * (straightPass ? 0.18 : 0.52)) + jitter;
        const control1Distance = Math.max(7, distance * 0.28);
        const control2Distance = Math.max(9, distance * 0.18);
        const bendScale = connectionSides.length === 2 ? 2.05 : 1.6;

        return {
            side: anchor.side,
            start: {
                x: hubCenter.x + (dirX * 0.3),
                y: hubCenter.y + (dirY * 0.3),
            },
            control1: {
                x: hubCenter.x + (dirX * control1Distance) + (perpX * bend * bendScale),
                y: hubCenter.y + (dirY * control1Distance) + (perpY * bend * bendScale),
            },
            control2: {
                x: anchor.x - (dirX * control2Distance),
                y: anchor.y - (dirY * control2Distance),
            },
            end: {
                x: anchor.x,
                y: anchor.y,
            },
            dirX,
            dirY,
            perpX,
            perpY,
            distance,
        };
    }

    private traceRoadBranchPath(
        ctx: CanvasRenderingContext2D,
        branch: RoadBranch,
        options: { lateralOffset?: number; startInset?: number; endInset?: number; controlTaper?: number } = {}
    ) {
        const lateralOffset = options.lateralOffset ?? 0;
        const startInset = options.startInset ?? 0;
        const endInset = options.endInset ?? 0;
        const controlTaper = options.controlTaper ?? 0.4;
        const start = {
            x: branch.start.x + (branch.dirX * startInset) + (branch.perpX * lateralOffset),
            y: branch.start.y + (branch.dirY * startInset) + (branch.perpY * lateralOffset),
        };
        const control1 = {
            x: branch.control1.x + (branch.perpX * lateralOffset),
            y: branch.control1.y + (branch.perpY * lateralOffset),
        };
        const control2 = {
            x: branch.control2.x + (branch.perpX * lateralOffset * controlTaper),
            y: branch.control2.y + (branch.perpY * lateralOffset * controlTaper),
        };
        const end = {
            x: branch.end.x - (branch.dirX * endInset),
            y: branch.end.y - (branch.dirY * endInset),
        };

        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
    }

    private drawProceduralRoad(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, opacity: number) {
        if (!isRoadTile(tile)) {
            return;
        }

        const baseCenter = this.getRoadCenter(x, y);
        const connectionSides = this.getRoadConnectionSides(tile);
        const edgeAnchors = connectionSides
            .map(side => {
                const point = this.getRoadAnchorPoint(x, y, side);
                return point ? { side, ...point } : null;
            })
            .filter((point): point is { side: TileSide; x: number; y: number } => !!point);

        const branchSides = edgeAnchors.length ? connectionSides : this.getRoadInteriorStubSides(tile);
        const anchors = edgeAnchors.length
            ? edgeAnchors
            : branchSides
                .map(side => {
                    const point = this.getRoadInteriorAnchorPoint(x, y, side);
                    return point ? { side, ...point } : null;
                })
                .filter((point): point is { side: TileSide; x: number; y: number } => !!point);

        if (!anchors.length) {
            return;
        }

        const hubCenter = this.getRoadHubCenter(tile, x, y, branchSides, anchors);
        const branches = anchors
            .map(anchor => this.buildRoadBranch(tile, baseCenter, hubCenter, anchor, branchSides))
            .filter((branch): branch is RoadBranch => !!branch);

        if (!branches.length) {
            return;
        }

        const straightPass = branchSides.length === 2 && this.areOppositeRoadSides(branchSides[0]!, branchSides[1]!);
        const strokeBranchSet = (
            lineWidth: number,
            strokeStyle: string | CanvasGradient,
            options: { lateralOffset?: number; startInset?: number; endInset?: number; controlTaper?: number } = {}
        ) => {
            ctx.beginPath();
            for (const branch of branches) {
                this.traceRoadBranchPath(ctx, branch, options);
            }
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
        };

        const hubSeed = this.seedFromString(`${tile.q},${tile.r}:road-pad`);
        const hubDirX = branches.reduce((total, branch) => total + branch.dirX, 0);
        const hubDirY = branches.reduce((total, branch) => total + branch.dirY, 0);
        const hubFallbackAngle = (hubSeed % 360) * Math.PI / 180;
        const hubAngle = straightPass
            ? Math.atan2(branches[0]!.dirY, branches[0]!.dirX)
            : Math.hypot(hubDirX, hubDirY) > 0.0001
                ? Math.atan2(hubDirY, hubDirX)
                : hubFallbackAngle;
        const hubRadiusX = anchors.length >= 3 ? 7.4 : straightPass ? 5.8 : 6.6;
        const hubRadiusY = anchors.length >= 3 ? 5.6 : straightPass ? 4.5 : 5.2;
        const hubBlendInset = Math.max(2.4, Math.min(4.2, hubRadiusX * 0.48));

        ctx.save();
        this.traceHexClipPath(ctx, x, y);
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const isStoneRoad = this.isStoneRoadTile(tile);
        const roadShadowColor = isStoneRoad
            ? `rgba(34, 40, 48, ${Math.min(1, opacity * 0.34)})`
            : `rgba(58, 38, 24, ${Math.min(1, opacity * 0.34)})`;
        const roadUnderbedColor = isStoneRoad
            ? `rgba(86, 96, 108, ${Math.min(1, opacity * 0.74)})`
            : `rgba(103, 72, 45, ${Math.min(1, opacity * 0.74)})`;

        strokeBranchSet(15, roadShadowColor, { startInset: hubBlendInset * 0.85 });
        strokeBranchSet(12.5, roadUnderbedColor, { startInset: hubBlendInset });

        for (const branch of branches) {
            const roadbedGradient = ctx.createLinearGradient(branch.start.x, branch.start.y, branch.end.x, branch.end.y);
            if (isStoneRoad) {
                roadbedGradient.addColorStop(0, `rgba(122, 132, 142, ${Math.min(1, opacity * 0.94)})`);
                roadbedGradient.addColorStop(0.45, `rgba(166, 174, 182, ${Math.min(1, opacity * 0.98)})`);
                roadbedGradient.addColorStop(1, `rgba(138, 146, 154, ${Math.min(1, opacity * 0.94)})`);
            } else {
                roadbedGradient.addColorStop(0, `rgba(132, 96, 60, ${Math.min(1, opacity * 0.94)})`);
                roadbedGradient.addColorStop(0.45, `rgba(171, 131, 84, ${Math.min(1, opacity * 0.98)})`);
                roadbedGradient.addColorStop(1, `rgba(194, 156, 109, ${Math.min(1, opacity * 0.94)})`);
            }

            ctx.beginPath();
            this.traceRoadBranchPath(ctx, branch, { startInset: hubBlendInset });
            ctx.lineWidth = straightPass ? 9 : 9.4;
            ctx.strokeStyle = roadbedGradient;
            ctx.stroke();

            const lightNormalX = -0.72;
            const lightNormalY = -0.68;
            const highlightOffset = ((branch.perpX * lightNormalX) + (branch.perpY * lightNormalY)) >= 0 ? 1 : -1;
            ctx.beginPath();
            this.traceRoadBranchPath(ctx, branch, { lateralOffset: highlightOffset, startInset: hubBlendInset + 0.4, endInset: 4.8, controlTaper: 0.18 });
            ctx.lineWidth = 1.45;
            ctx.strokeStyle = isStoneRoad
                ? `rgba(236, 240, 245, ${Math.min(1, opacity * 0.28)})`
                : `rgba(240, 215, 174, ${Math.min(1, opacity * 0.34)})`;
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(hubCenter.x, hubCenter.y);
        ctx.rotate(hubAngle);

        const hubBlendRadiusX = hubRadiusX + 2.8;
        const hubBlendRadiusY = hubRadiusY + 2;
        ctx.save();
        ctx.scale(1, hubBlendRadiusY / hubBlendRadiusX);
        const hubBlend = ctx.createRadialGradient(0, 0, 0, 0, 0, hubBlendRadiusX);
        if (isStoneRoad) {
            hubBlend.addColorStop(0, `rgba(180, 188, 194, ${Math.min(1, opacity * 0.24)})`);
            hubBlend.addColorStop(0.36, `rgba(150, 158, 168, ${Math.min(1, opacity * 0.16)})`);
            hubBlend.addColorStop(0.72, `rgba(88, 98, 108, ${Math.min(1, opacity * 0.08)})`);
            hubBlend.addColorStop(1, 'rgba(88, 98, 108, 0)');
        } else {
            hubBlend.addColorStop(0, `rgba(198, 156, 104, ${Math.min(1, opacity * 0.3)})`);
            hubBlend.addColorStop(0.36, `rgba(171, 131, 84, ${Math.min(1, opacity * 0.2)})`);
            hubBlend.addColorStop(0.72, `rgba(112, 79, 49, ${Math.min(1, opacity * 0.08)})`);
            hubBlend.addColorStop(1, 'rgba(112, 79, 49, 0)');
        }
        ctx.fillStyle = hubBlend;
        ctx.beginPath();
        ctx.arc(0, 0, hubBlendRadiusX, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(-0.6, -0.4);
        ctx.scale(1, Math.max(0.68, hubRadiusY / Math.max(1, hubRadiusX)));
        const hubCore = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(2.8, hubRadiusX - 0.6));
        if (isStoneRoad) {
            hubCore.addColorStop(0, `rgba(240, 244, 248, ${Math.min(1, opacity * 0.12)})`);
            hubCore.addColorStop(0.55, `rgba(168, 176, 184, ${Math.min(1, opacity * 0.07)})`);
            hubCore.addColorStop(1, 'rgba(168, 176, 184, 0)');
        } else {
            hubCore.addColorStop(0, `rgba(226, 192, 138, ${Math.min(1, opacity * 0.16)})`);
            hubCore.addColorStop(0.55, `rgba(189, 147, 94, ${Math.min(1, opacity * 0.08)})`);
            hubCore.addColorStop(1, 'rgba(189, 147, 94, 0)');
        }
        ctx.fillStyle = hubCore;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2.8, hubRadiusX - 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        for (const branch of branches) {
            ctx.beginPath();
            this.traceRoadBranchPath(ctx, branch, { lateralOffset: -1.55, startInset: hubBlendInset + 0.9, endInset: 7.4, controlTaper: 0.16 });
            ctx.lineWidth = 1.35;
            ctx.strokeStyle = isStoneRoad
                ? `rgba(92, 102, 114, ${Math.min(1, opacity * 0.24)})`
                : `rgba(102, 71, 44, ${Math.min(1, opacity * 0.25)})`;
            ctx.stroke();

            ctx.beginPath();
            this.traceRoadBranchPath(ctx, branch, { lateralOffset: 1.55, startInset: hubBlendInset + 0.9, endInset: 7.4, controlTaper: 0.16 });
            ctx.lineWidth = 1.35;
            ctx.strokeStyle = isStoneRoad
                ? `rgba(104, 116, 126, ${Math.min(1, opacity * 0.18)})`
                : `rgba(110, 78, 48, ${Math.min(1, opacity * 0.18)})`;
            ctx.stroke();
        }

        strokeBranchSet(
            2.4,
            isStoneRoad
                ? `rgba(250, 252, 255, ${Math.min(1, opacity * 0.16)})`
                : `rgba(239, 209, 164, ${Math.min(1, opacity * 0.18)})`,
            { startInset: hubBlendInset + 1.2, endInset: 8.5, controlTaper: 0.12 },
        );
        ctx.restore();
    }

    private drawProceduralBridge(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, opacity: number) {
        const isBridge = isBridgeTile(tile);
        const isTunnel = isTunnelTile(tile);
        if (!isBridge && !isTunnel) {
            return;
        }

        const connectionSides = isBridge ? getBridgeConnectionSides(tile) : getTunnelConnectionSides(tile);
        if (!connectionSides) {
            return;
        }

        const start = this.getRoadAnchorPoint(x, y, connectionSides[0]);
        const end = this.getRoadAnchorPoint(x, y, connectionSides[1]);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        if (!distance) {
            return;
        }

        const dirX = dx / distance;
        const dirY = dy / distance;
        const perpX = -dirY;
        const perpY = dirX;
        const inset = 3.4;
        const startX = start.x + (dirX * inset);
        const startY = start.y + (dirY * inset);
        const endX = end.x - (dirX * inset);
        const endY = end.y - (dirY * inset);

        ctx.save();
        this.traceHexClipPath(ctx, x, y);
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';

        if (isTunnel) {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.lineWidth = 19;
            ctx.strokeStyle = `rgba(8, 10, 14, ${Math.min(1, opacity * 0.52)})`;
            ctx.stroke();

            const tunnelGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            tunnelGradient.addColorStop(0, `rgba(72, 64, 58, ${Math.min(1, opacity * 0.96)})`);
            tunnelGradient.addColorStop(0.5, `rgba(104, 96, 88, ${Math.min(1, opacity * 0.96)})`);
            tunnelGradient.addColorStop(1, `rgba(76, 69, 63, ${Math.min(1, opacity * 0.96)})`);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.lineWidth = 12.2;
            ctx.strokeStyle = tunnelGradient;
            ctx.stroke();

            for (const railOffset of [-3.7, 3.7] as const) {
                ctx.beginPath();
                ctx.moveTo(startX + (perpX * railOffset), startY + (perpY * railOffset));
                ctx.lineTo(endX + (perpX * railOffset), endY + (perpY * railOffset));
                ctx.lineWidth = 1.9;
                ctx.strokeStyle = `rgba(54, 48, 44, ${Math.min(1, opacity * 0.74)})`;
                ctx.stroke();
            }

            const braceSpacing = 10.5;
            const braceHalfWidth = 4.9;
            const braceCount = Math.max(3, Math.floor(distance / braceSpacing));
            for (let i = 0; i <= braceCount; i++) {
                const t = braceCount === 0 ? 0.5 : i / braceCount;
                const px = startX + ((endX - startX) * t);
                const py = startY + ((endY - startY) * t);

                ctx.beginPath();
                ctx.moveTo(px - (perpX * braceHalfWidth), py - (perpY * braceHalfWidth));
                ctx.lineTo(px + (perpX * braceHalfWidth), py + (perpY * braceHalfWidth));
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = `rgba(138, 118, 90, ${Math.min(1, opacity * 0.4)})`;
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.moveTo(startX - (perpX * 1.8), startY - (perpY * 1.8));
            ctx.lineTo(endX - (perpX * 1.8), endY - (perpY * 1.8));
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(220, 212, 198, ${Math.min(1, opacity * 0.18)})`;
            ctx.stroke();

            ctx.restore();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineWidth = 17;
        ctx.strokeStyle = `rgba(24, 14, 8, ${Math.min(1, opacity * 0.26)})`;
        ctx.stroke();

        const deckGradient = ctx.createLinearGradient(startX, startY, endX, endY);
        deckGradient.addColorStop(0, `rgba(116, 82, 52, ${Math.min(1, opacity * 0.98)})`);
        deckGradient.addColorStop(0.5, `rgba(166, 123, 80, ${Math.min(1, opacity * 0.98)})`);
        deckGradient.addColorStop(1, `rgba(132, 96, 62, ${Math.min(1, opacity * 0.98)})`);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineWidth = 12.5;
        ctx.strokeStyle = deckGradient;
        ctx.stroke();

        for (const railOffset of [-4.2, 4.2] as const) {
            ctx.beginPath();
            ctx.moveTo(startX + (perpX * railOffset), startY + (perpY * railOffset));
            ctx.lineTo(endX + (perpX * railOffset), endY + (perpY * railOffset));
            ctx.lineWidth = 1.9;
            ctx.strokeStyle = `rgba(82, 54, 31, ${Math.min(1, opacity * 0.72)})`;
            ctx.stroke();
        }

        const plankSpacing = 9.5;
        const plankHalfWidth = 4.6;
        const plankCount = Math.max(3, Math.floor(distance / plankSpacing));
        for (let i = 0; i <= plankCount; i++) {
            const t = plankCount === 0 ? 0.5 : i / plankCount;
            const px = startX + ((endX - startX) * t);
            const py = startY + ((endY - startY) * t);

            ctx.beginPath();
            ctx.moveTo(px - (perpX * plankHalfWidth), py - (perpY * plankHalfWidth));
            ctx.lineTo(px + (perpX * plankHalfWidth), py + (perpY * plankHalfWidth));
            ctx.lineWidth = 1.45;
            ctx.strokeStyle = `rgba(92, 61, 36, ${Math.min(1, opacity * 0.52)})`;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(startX - (perpX * 1.6), startY - (perpY * 1.6));
        ctx.lineTo(endX - (perpX * 1.6), endY - (perpY * 1.6));
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = `rgba(236, 208, 168, ${Math.min(1, opacity * 0.28)})`;
        ctx.stroke();

        ctx.restore();
    }

    // RESTORED: original tile image key resolution (variant overrides base)
    private getTileImageKey(t: Tile): string | null {
        if (!t.terrain) return null;
        const def: any = (TERRAIN_DEFS as any)[t.terrain];
        if (isProceduralRoadVariant(t.variant)) {
            const baseKey = def?.assetKey || t.terrain;
            return this.tileImgSources[baseKey] ? baseKey : null;
        }
        if (t.variant) {
            const variantDef = def?.variations?.find((v: any) => v.key === t.variant);
            const vk = variantDef?.assetKey || t.variant;
            if (this.tileImgSources[vk]) return vk;
        }
        const decorative = getDecorativeSelectionForTile(t);
        if (decorative && this.tileImgSources[decorative.assetKey]) return decorative.assetKey;
        const baseKey = def?.assetKey || t.terrain;
        return this.tileImgSources[baseKey] ? baseKey : null;
    }

}
