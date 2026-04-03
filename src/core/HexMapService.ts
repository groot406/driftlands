import {
    axialKey,
    clearPendingRenderDirtyTiles,
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
import {TERRAIN_DEFS} from './terrainDefs';
import { selectedHeroId } from '../store/uiStore';
import {heroAnimationSet, heroAnimName, resolveActivity, shouldFlip} from './heroSprite';
import {taskStore} from '../store/taskStore';
import { worldOuterRadius } from './world';
import {getTextIndicators} from "./textIndicators.ts";
import type { PathCoord } from './PathService';
import { OPPOSITE_SIDE, SIDE_NAMES, type Tile, type TileSide } from "./types/Tile.ts";
import type {Hero} from "./types/Hero.ts";
import type {ResourceType} from "./types/Resource.ts";
import type {TaskInstance} from "./types/Task.ts";
import {getDecorativeSelectionForTile} from './tileVisuals';
import {
    getEffectiveParticleBudget,
    graphicsStore,
    isBloomEffectEnabled,
    isMotionBlurEffectEnabled,
    shouldUseCanvasDropShadow,
    shouldUseEdgeVignette,
    shouldUseParticleGlowPass,
} from '../store/graphicsStore';
import { updateRenderDebugState } from '../store/renderDebugStore';
import {
    isRenderFeatureForcedOn,
    resolveRenderFeatureEnabled,
} from '../store/renderFeatureStore';
import { getStorageFreeCapacity, getStorageUsedCapacity, storageInventories } from '../store/resourceStore';
import { getBuildingDefinitionForTile } from '../shared/buildings/registry';
import { canUseWarehouseAtTile, getStorageKindForTile } from '../shared/buildings/storage';
import { getStorageCapacity } from '../shared/game/storage';
import { getDistanceToNearestTowncenter } from '../shared/game/worldQueries';
import {
    consumePendingCameraNudges,
    consumePendingTerrainBursts,
    getActiveImpactRings,
    getActiveResourceFlights,
    getActiveTileFlashes,
    getHeroImpactOffset,
    getResourceTargetCenter,
} from './gameFeel';
import { isHeroWorkingTask } from '../shared/game/heroTaskState';
import { isProceduralRoadVariant, isRoadConnectionTarget, isRoadTile } from '../shared/game/roads';
import { getClimateProfile, hash32 } from './worldVariation';

type GlowColor = readonly [number, number, number];

const TILE_SIDE_DELTAS: Record<TileSide, readonly [number, number]> = {
    a: [0, -1],
    b: [1, -1],
    c: [1, 0],
    d: [0, 1],
    e: [-1, 1],
    f: [-1, 0],
};

const TILE_SIDE_INDEX: Record<TileSide, number> = {
    a: 0,
    b: 1,
    c: 2,
    d: 3,
    e: 4,
    f: 5,
};

const SHORELINE_EDGE_ALPHA_BY_SIDE: Record<TileSide, number> = {
    a: 1,
    b: 0.94,
    c: 0.78,
    d: 0.62,
    e: 0.74,
    f: 0.94,
};

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

interface DrawOptions {
    hoveredTile: Tile | null;
    hoveredHero: Hero | null;
    taskMenuTile: Tile | null;
    pathCoords: PathCoord[];
    clusterBoundaryTiles?: Tile[]; // boundary tiles of same-terrain cluster for menu highlighting
    clusterTileIds?: Set<string>; // all tile ids in cluster to suppress interior edges
    globalReachBoundary?: Array<{q: number; r: number}>; // always-visible reach outline (all TCs, dimmed)
    globalReachTileIds?: Set<string>;
    hoveredReachBoundary?: Array<{q: number; r: number}>; // hover-highlighted reach outline (specific TC)
    hoveredReachTileIds?: Set<string>;
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

interface FrameTimes {
    effectNowMs: number;
    movementNowMs: number;
    perfNowMs: number;
}

interface RenderFrameContext {
    finalCtx: CanvasRenderingContext2D;
    worldCtx: CanvasRenderingContext2D;
    worldCanvas: HTMLCanvasElement;
    sceneCtx: CanvasRenderingContext2D;
    sceneCanvas: HTMLCanvasElement;
    cameraFx: CameraCompositeState;
    effectNowMs: number;
    movementNowMs: number;
    perfNowMs: number;
    visibleTiles: Tile[];
    quality: RenderQualityProfile;
    stressTier: RenderStressState['tier'];
    cameraMoving: boolean;
}

interface RenderQualityProfile {
    enableBackdropGlows: boolean;
    enableMotionBlur: boolean;
    motionBlurStrength: number;
    enableBloom: boolean;
    enableParticles: boolean;
    enableEdgeVignette: boolean;
    enableReachGlow: boolean;
    enableHeroAuras: boolean;
    enableFogShimmer: boolean;
    enableManualShadowComposite: boolean;
    particleBudgetScale: number;
}

interface StaticTerrainLayerState {
    worldVersion: number;
    anchorWorldX: number;
    anchorWorldY: number;
    viewportWidth: number;
    viewportHeight: number;
    terrainCanvasWidth: number;
    terrainCanvasHeight: number;
    cameraRadius: number;
}

interface BufferRegion {
    x: number;
    y: number;
    width: number;
    height: number;
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
    shape: 'circle' | 'diamond' | 'cloud' | 'ring';
    renderMode?: 'glow' | 'smoke';
    growth?: number;
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

interface BackdropPaletteWeights {
    lush: number;
    water: number;
    cold: number;
    warm: number;
    stone: number;
    ember: number;
}

interface RenderStressState {
    tier: 0 | 1 | 2;
    smoothedFrameMs: number;
}

interface BackdropPaletteCache {
    key: string;
    expiresAtMs: number;
    weights: BackdropPaletteWeights;
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

const DEFAULT_RENDER_QUALITY: RenderQualityProfile = {
    enableBackdropGlows: true,
    enableMotionBlur: true,
    motionBlurStrength: 1,
    enableBloom: true,
    enableParticles: true,
    enableEdgeVignette: true,
    enableReachGlow: true,
    enableHeroAuras: true,
    enableFogShimmer: true,
    enableManualShadowComposite: true,
    particleBudgetScale: 1,
};

export class HexMapService {

    readonly HEX_SIZE = 34;
    readonly HEX_SPACE = 2;

    // Config constants (exposed for potential external tuning later)
    readonly TILE_DRAW_SIZE = (this.HEX_SIZE * 2) - this.HEX_SPACE;
    readonly heroFrameSize = heroAnimationSet.size;
    // Removed fixed heroFrames/speed/row in favor of animation definitions
    readonly heroZoom = 2;
    readonly HERO_OFFSET_SPACING = 14;

    readonly heroShadowOpacity = 0.6; // base opacity before fade scaling
    readonly heroShadowWidthFactor = 0.6; // relative to heroFrameSize * zoom
    readonly heroShadowHeightFactor = 0.20; // relative to heroFrameSize * zoom
    readonly heroShadowYOffset = 0.13; // move shadow up relative to tile center (in heroFrameSize units)
    readonly STATIC_TERRAIN_PADDING_PX = this.TILE_DRAW_SIZE * 7;
    readonly AMBIENT_PARTICLE_DENSITY = 0.58;
    private _canvas: HTMLCanvasElement | null = null;
    private _container: HTMLDivElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _terrainCanvas: HTMLCanvasElement | null = null;
    private _terrainCtx: CanvasRenderingContext2D | null = null;
    private _terrainScratchCanvas: HTMLCanvasElement | null = null;
    private _terrainScratchCtx: CanvasRenderingContext2D | null = null;
    private _worldCanvas: HTMLCanvasElement | null = null;
    private _worldCtx: CanvasRenderingContext2D | null = null;
    private _layerCanvas: HTMLCanvasElement | null = null;
    private _layerCtx: CanvasRenderingContext2D | null = null;
    private _bloomCanvas: HTMLCanvasElement | null = null;
    private _bloomCtx: CanvasRenderingContext2D | null = null;
    private _dpr = 1;

    private _images: Record<string, HTMLImageElement> = {};
    private _maskedImages: Record<string, HTMLCanvasElement> = {};
    private _imagesLoaded = false;
    private _heroImages: Record<string, HTMLImageElement> = {};
    private _pendingHeroImageLoads = new Map<string, Promise<void>>();
    private _heroImagesLoaded = false;

    private _heroLayouts: Map<string, Record<string, { x: number; y: number }>> = new Map();

    private _heroMasksByRow: Record<string, Record<number, Uint8Array[]>> = {};
    private _heroEdgePixelsByRow: Record<string, Record<number, { x: number; y: number }[][]>> = {};

    private _heroAnimStart = Date.now();
    private _lastHeroFrame = 0;

    private _tileAnimStart = Date.now();
    private _particles: Particle[] = [];
    private _lastParticleUpdateMs = Date.now();
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
    private _backdropPaletteCache: BackdropPaletteCache | null = null;
    private _hoveredReachAlpha = 0; // animated 0→0.7 for smooth TC hover transition
    private _lastHoveredReachBoundary: Array<{q: number; r: number}> = [];
    private _lastHoveredReachTileIds: Set<string> = new Set();
    private _tileColorVariantCache = new Map<string, HTMLCanvasElement>();
    private _tileShaderCache = new Map<string, HTMLCanvasElement>();
    private _tileShorelineCache = new Map<string, HTMLCanvasElement>();
    private _tileOverlayShaderCache = new Map<string, HTMLCanvasElement>();
    private _tileOverlayAlphaBoundsCache = new Map<string, { top: number; bottom: number } | null>();
    private _terrainLayerState: StaticTerrainLayerState | null = null;
    private _currentRenderQuality: RenderQualityProfile = { ...DEFAULT_RENDER_QUALITY };
    private _staticTerrainRebuilds = 0;
    private _lastStaticTerrainReused = false;
    private _lastStaticTerrainReason: 'init' | 'world' | 'viewport' | 'radius' | 'drift' | 'shift' | 'patch' | 'reuse' = 'init';
    private _lastStaticTerrainShiftPx = 0;

    //stores heroes in the exact draw layering order (top drawn first, bottom drawn last)
    private _sortedHeroes: Hero[] = [];

    // Asset sources
    private readonly tileImgSources: Record<string, string> = buildTileSources();
    private readonly heroImgSources: Record<string, string> = buildHeroSources();

    async init(canvasEl: HTMLCanvasElement, containerEl: HTMLDivElement) {
        this._canvas = canvasEl;
        this._container = containerEl;
        this._dpr = 1;
        this.setupCanvas();
        await this.loadTileImages();
        await this.ensureHeroAssets();
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
        this._terrainScratchCanvas = null;
        this._terrainScratchCtx = null;
        this._worldCanvas = null;
        this._worldCtx = null;
        this._layerCanvas = null;
        this._layerCtx = null;
        this._bloomCanvas = null;
        this._bloomCtx = null;
        this._heroLayouts.clear();
        this._particles = [];
        this._lastParticleUpdateMs = Date.now();
        this._heroTrailEmitMs.clear();
        this._taskParticleEmitMs.clear();
        this._pendingHeroImageLoads.clear();
        this._fogTileCanvas = null;
        this._proceduralRoadCache.clear();
        this._tileColorVariantCache.clear();
        this._tileShaderCache.clear();
        this._tileShorelineCache.clear();
        this._tileOverlayShaderCache.clear();
        this._tileOverlayAlphaBoundsCache.clear();
        this._backdropPaletteCache = null;
        this._terrainLayerState = null;
        this._staticTerrainRebuilds = 0;
        this._lastStaticTerrainReused = false;
        this._lastStaticTerrainReason = 'init';
        this._lastStaticTerrainShiftPx = 0;
        this._renderStress = {
            tier: 0,
            smoothedFrameMs: 5.5,
        };
        this.resetCameraCompositeState();
        this._currentRenderQuality = { ...DEFAULT_RENDER_QUALITY };
    }

    resize() {
        if (!this._canvas || !this._container) return;
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        this._dpr = 1;
        this._canvas.width = w * this._dpr;
        this._canvas.height = h * this._dpr;
        this._canvas.style.width = w + 'px';
        this._canvas.style.height = h + 'px';
        this._ctx = this.get2dContext(this._canvas);
        if (this._ctx) this._ctx.imageSmoothingEnabled = false;
        if (!this._terrainCanvas) this._terrainCanvas = document.createElement('canvas');
        this._terrainCanvas.width = this._canvas.width + (Math.round(this.STATIC_TERRAIN_PADDING_PX * 2 * this._dpr));
        this._terrainCanvas.height = this._canvas.height + (Math.round(this.STATIC_TERRAIN_PADDING_PX * 2 * this._dpr));
        this._terrainCtx = this.get2dContext(this._terrainCanvas);
        if (this._terrainCtx) this._terrainCtx.imageSmoothingEnabled = false;
        if (!this._terrainScratchCanvas) this._terrainScratchCanvas = document.createElement('canvas');
        this._terrainScratchCanvas.width = this._terrainCanvas.width;
        this._terrainScratchCanvas.height = this._terrainCanvas.height;
        this._terrainScratchCtx = this.get2dContext(this._terrainScratchCanvas);
        if (this._terrainScratchCtx) this._terrainScratchCtx.imageSmoothingEnabled = false;
        if (!this._worldCanvas) this._worldCanvas = document.createElement('canvas');
        this._worldCanvas.width = this._canvas.width;
        this._worldCanvas.height = this._canvas.height;
        this._worldCtx = this.get2dContext(this._worldCanvas);
        if (this._worldCtx) this._worldCtx.imageSmoothingEnabled = false;
        if (!this._layerCanvas) this._layerCanvas = document.createElement('canvas');
        this._layerCanvas.width = this._canvas.width;
        this._layerCanvas.height = this._canvas.height;
        this._layerCtx = this.get2dContext(this._layerCanvas);
        if (this._layerCtx) this._layerCtx.imageSmoothingEnabled = false;
        if (!this._bloomCanvas) this._bloomCanvas = document.createElement('canvas');
        this._bloomCanvas.width = this._canvas.width;
        this._bloomCanvas.height = this._canvas.height;
        this._bloomCtx = this.get2dContext(this._bloomCanvas);
        if (this._bloomCtx) this._bloomCtx.imageSmoothingEnabled = true;
        this._terrainLayerState = null;
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
        const renderStartMs = performance.now();
        const frame = this.createRenderFrameContext(frameTimes);
        if (!frame) return;

        this.prepareFinalFrame(frame);
        this.renderBackdropStage(frame);
        this.renderStaticTerrainStage(frame);
        this.renderSceneStage(frame, opts);
        this.compositeSceneStage(frame);
        const motionBlur = this.renderPostProcessStage(frame, opts);
        const renderCostMs = performance.now() - renderStartMs;
        this.recordRenderStress(renderCostMs);
        this.publishRenderDebugInfo(frame, motionBlur);
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
        const sx = screenX - rect.left;
        const sy = screenY - rect.top;
        // Iterate in reverse of draw order so visually top hero is picked first
        const layer = this._sortedHeroes.length ? this._sortedHeroes : heroes;
        for (let i = layer.length - 1; i >= 0; i--) {
            const h = layer[i]!;
            const {x, y} = this.worldToScreen(h.q, h.r);
            const layout = this._heroLayouts.get(axialKey(h.q, h.r)) || {};
            const pos = layout[h.id] || {x: 0, y: 0};
            const left = x - (this.heroFrameSize * this.heroZoom) / 2 + pos.x - (this.heroFrameSize / 2);
            const top = y - (this.heroFrameSize * 2) + (this.heroFrameSize / 2) + pos.y;
            const w = this.heroFrameSize * this.heroZoom;
            const hH = this.heroFrameSize * this.heroZoom;
            if (sx < left || sx > left + w || sy < top || sy > top + hH) continue;
            const localX = Math.floor((sx - left) / this.heroZoom);
            const localY = Math.floor((sy - top) / this.heroZoom);
            if (localX < 0 || localX >= this.heroFrameSize || localY < 0 || localY >= this.heroFrameSize) continue;
            const frameIndex = this._lastHeroFrame;
            const facingRowMap: Record<string, number> = {right: 2, left: 2, up: 5, down: 8};
            const row = facingRowMap[h.facing] ?? 8;
            const rowMasks = this._heroMasksByRow[h.avatar]?.[row];
            const mask = rowMasks ? rowMasks[Math.min(frameIndex, rowMasks.length - 1)] : null;
            if (!mask) continue;
            if (mask[localY * this.heroFrameSize + localX]) return h;
        }
        return null;
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

    private publishRenderDebugInfo(
        frame: RenderFrameContext,
        motionBlur: {
            samples: number;
            strength: number;
        } | null,
    ) {
        updateRenderDebugState({
            stressTier: frame.stressTier,
            qualityLabel: frame.stressTier === 0 ? 'full' : frame.stressTier === 1 ? 'reduced' : 'minimal',
            smoothedFrameMs: Number(this._renderStress.smoothedFrameMs.toFixed(1)),
            visibleTileCount: frame.visibleTiles.length,
            discoveredVisibleCount: frame.visibleTiles.reduce((count, tile) => count + (tile.discovered ? 1 : 0), 0),
            worldRenderVersion: getWorldRenderVersion(),
            staticTerrainReused: this._lastStaticTerrainReused,
            staticTerrainReason: this._lastStaticTerrainReason,
            staticTerrainRebuilds: this._staticTerrainRebuilds,
            staticTerrainPaddingPx: this.STATIC_TERRAIN_PADDING_PX,
            staticTerrainThresholdPx: Math.round(this.getStaticTerrainRefreshThreshold()),
            staticTerrainShiftPx: Math.round(this._lastStaticTerrainShiftPx),
            motionBlurEnabled: frame.quality.enableMotionBlur,
            motionBlurActive: !!motionBlur,
            motionBlurSamples: motionBlur?.samples ?? 0,
            motionBlurStrength: Number((motionBlur?.strength ?? frame.quality.motionBlurStrength).toFixed(2)),
            bloomEnabled: frame.quality.enableBloom,
            particlesEnabled: frame.quality.enableParticles,
            edgeVignetteEnabled: frame.quality.enableEdgeVignette,
            backdropGlowsEnabled: frame.quality.enableBackdropGlows,
            reachGlowEnabled: frame.quality.enableReachGlow,
            heroAurasEnabled: frame.quality.enableHeroAuras,
            fogShimmerEnabled: frame.quality.enableFogShimmer,
            manualShadowComposite: frame.quality.enableManualShadowComposite,
        });
    }

    private createRenderFrameContext(frameTimes: FrameTimes): RenderFrameContext | null {
        if (!this._ctx || !this._canvas || !this._terrainCtx || !this._terrainCanvas || !this._worldCtx || !this._worldCanvas || !this._layerCtx || !this._layerCanvas) return null;
        if (!this._imagesLoaded) return null;

        const { effectNowMs, movementNowMs, perfNowMs } = frameTimes;
        const cameraFx = this.updateCameraCompositeState(perfNowMs);
        const cq = Math.round(camera.q);
        const cr = Math.round(camera.r);
        const radiusTiles = getTilesInRadius(cq, cr, camera.radius);
        const visibleTiles = this.filterTilesToViewport(radiusTiles, cameraFx);
        const discoveredVisibleCount = visibleTiles.reduce((count, tile) => count + (tile.discovered ? 1 : 0), 0);
        const cameraMoving = isCameraMoving();

        const stressTier = this.updateRenderStress(visibleTiles.length, discoveredVisibleCount);
        const quality = this.getRenderQualityProfile(stressTier);
        this._currentCameraFx = cameraFx;
        this._currentRenderQuality = quality;
        this.applyPendingCameraNudges(cameraFx);

        return {
            finalCtx: this._ctx,
            worldCtx: this._worldCtx,
            worldCanvas: this._worldCanvas,
            sceneCtx: this._layerCtx,
            sceneCanvas: this._layerCanvas,
            cameraFx,
            effectNowMs,
            movementNowMs,
            perfNowMs,
            visibleTiles,
            quality,
            stressTier,
            cameraMoving,
        };
    }

    private prepareFinalFrame(frame: RenderFrameContext) {
        if (!this._canvas) return;

        frame.finalCtx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        if (this._canvas.style.filter) this._canvas.style.filter = 'none';
    }

    private getRenderQualityProfile(stressTier: RenderStressState['tier']): RenderQualityProfile {
        const baseProfile = stressTier === 2
            ? {
                enableBackdropGlows: false,
                enableMotionBlur: false,
                motionBlurStrength: 0,
                enableBloom: false,
                enableParticles: false,
                enableEdgeVignette: false,
                enableReachGlow: false,
                enableHeroAuras: true,
                enableFogShimmer: false,
                enableManualShadowComposite: false,
                particleBudgetScale: 0,
            }
            : stressTier === 1
                ? {
                    enableBackdropGlows: false,
                    enableMotionBlur: isMotionBlurEffectEnabled(),
                    motionBlurStrength: 0.52,
                    enableBloom: false,
                    enableParticles: graphicsStore.particles,
                    enableEdgeVignette: false,
                    enableReachGlow: false,
                    enableHeroAuras: true,
                    enableFogShimmer: false,
                    enableManualShadowComposite: false,
                    particleBudgetScale: 0.35,
                }
                : {
                    enableBackdropGlows: true,
                    enableMotionBlur: isMotionBlurEffectEnabled(),
                    motionBlurStrength: 1.18,
                    enableBloom: isBloomEffectEnabled(),
                    enableParticles: graphicsStore.particles,
                    enableEdgeVignette: shouldUseEdgeVignette(),
                    enableReachGlow: true,
                    enableHeroAuras: true,
                    enableFogShimmer: true,
                    enableManualShadowComposite: !shouldUseCanvasDropShadow(),
                    particleBudgetScale: 1,
                };

        return this.applyManualRenderFeatureOverrides(baseProfile);
    }

    private applyManualRenderFeatureOverrides(profile: RenderQualityProfile): RenderQualityProfile {
        const enableMotionBlur = resolveRenderFeatureEnabled('motionBlur', profile.enableMotionBlur);
        const enableParticles = resolveRenderFeatureEnabled('particles', profile.enableParticles);

        return {
            ...profile,
            enableBackdropGlows: resolveRenderFeatureEnabled('backdropGlows', profile.enableBackdropGlows),
            enableMotionBlur,
            motionBlurStrength: enableMotionBlur
                ? Math.max(profile.motionBlurStrength, isRenderFeatureForcedOn('motionBlur') ? 0.52 : 0)
                : 0,
            enableBloom: resolveRenderFeatureEnabled('bloom', profile.enableBloom),
            enableParticles,
            enableEdgeVignette: resolveRenderFeatureEnabled('edgeVignette', profile.enableEdgeVignette),
            enableReachGlow: resolveRenderFeatureEnabled('reachGlow', profile.enableReachGlow),
            enableHeroAuras: resolveRenderFeatureEnabled('heroAuras', profile.enableHeroAuras),
            enableFogShimmer: resolveRenderFeatureEnabled('fogShimmer', profile.enableFogShimmer),
            enableManualShadowComposite: resolveRenderFeatureEnabled('manualShadowComposite', profile.enableManualShadowComposite),
            particleBudgetScale: enableParticles
                ? Math.max(profile.particleBudgetScale, isRenderFeatureForcedOn('particles') ? 0.35 : 0)
                : 0,
        };
    }

    private renderBackdropStage(frame: RenderFrameContext) {
        this.drawAtmosphericBackdrop(frame.finalCtx, frame.visibleTiles, frame.effectNowMs, frame.cameraFx, frame.quality);
    }

    private renderStaticTerrainStage(frame: RenderFrameContext) {
        if (!this._terrainCtx || !this._terrainCanvas) return;

        if (!this.shouldRefreshStaticTerrainLayer()) {
            this._lastStaticTerrainReused = true;
            this._lastStaticTerrainReason = 'reuse';
            return;
        }

        const anchor = axialToPixel(camera.q, camera.r);
        if (this._lastStaticTerrainReason === 'drift' && this.shiftStaticTerrainLayer(anchor, frame.effectNowMs)) {
            this._lastStaticTerrainReused = false;
            this._lastStaticTerrainReason = 'shift';
            this._lastStaticTerrainShiftPx = 0;
            return;
        }

        if (this._lastStaticTerrainReason === 'world' && this.patchStaticTerrainLayerForWorldChanges(anchor, frame.effectNowMs)) {
            this._lastStaticTerrainReused = false;
            this._lastStaticTerrainReason = 'patch';
            this._lastStaticTerrainShiftPx = 0;
            return;
        }

        this.rebuildStaticTerrainLayer(anchor, frame.effectNowMs);
    }

    private rebuildStaticTerrainLayer(anchor: { x: number; y: number }, effectNowMs: number) {
        if (!this._terrainCtx || !this._terrainCanvas) return;

        const bufferWidth = this._terrainCanvas.width / this._dpr;
        const bufferHeight = this._terrainCanvas.height / this._dpr;
        const bufferCenterX = bufferWidth / 2;
        const bufferCenterY = bufferHeight / 2;
        const terrainTiles = getTilesInRadius(
            Math.round(camera.q),
            Math.round(camera.r),
            camera.radius + this.getStaticTerrainRadiusPadding(),
        );

        this._terrainCtx.clearRect(0, 0, this._terrainCanvas.width, this._terrainCanvas.height);
        this._terrainCtx.save();
        this._terrainCtx.scale(this._dpr, this._dpr);
        this._terrainCtx.translate(bufferCenterX - anchor.x, bufferCenterY - anchor.y);
        this.drawDiscoveredTerrainTiles(this._terrainCtx, terrainTiles, effectNowMs, false);
        this._terrainCtx.restore();

        clearPendingRenderDirtyTiles();
        this.updateStaticTerrainLayerState(anchor);
        this._lastStaticTerrainReused = false;
        this._lastStaticTerrainShiftPx = 0;
        this._staticTerrainRebuilds++;
    }

    private patchStaticTerrainLayerForWorldChanges(_anchor: { x: number; y: number }, effectNowMs: number) {
        if (!this._terrainCtx || !this._terrainCanvas || !this._terrainLayerState) {
            return false;
        }

        const dirtyTiles = consumePendingRenderDirtyTiles();
        if (!dirtyTiles.length) {
            return false;
        }
        if (dirtyTiles.length > 24) {
            return false;
        }

        const bufferWidth = this._terrainCanvas.width / this._dpr;
        const bufferHeight = this._terrainCanvas.height / this._dpr;
        const bufferCenterX = bufferWidth / 2;
        const bufferCenterY = bufferHeight / 2;
        // Patch into the cached terrain buffer using the anchor the buffer was
        // actually rendered with. Re-anchoring here causes partial redraws to
        // land a few pixels off from the existing cached terrain.
        const bufferAnchor = {
            x: this._terrainLayerState.anchorWorldX,
            y: this._terrainLayerState.anchorWorldY,
        };
        const clearPadding = 3;
        const dirtyRegions: BufferRegion[] = [];

        for (const tile of dirtyTiles) {
            if (!tile.discovered) {
                continue;
            }

            const world = axialToPixel(tile.q, tile.r);
            const drawX = bufferCenterX + (world.x - bufferAnchor.x) - this.HEX_SIZE;
            const drawY = bufferCenterY + (world.y - bufferAnchor.y) - this.HEX_SIZE;
            if (
                drawX + this.TILE_DRAW_SIZE + clearPadding < 0
                || drawY + this.TILE_DRAW_SIZE + clearPadding < 0
                || drawX - clearPadding > bufferWidth
                || drawY - clearPadding > bufferHeight
            ) {
                continue;
            }

            dirtyRegions.push({
                x: drawX - clearPadding,
                y: drawY - clearPadding,
                width: this.TILE_DRAW_SIZE + (clearPadding * 2),
                height: this.TILE_DRAW_SIZE + (clearPadding * 2),
            });
        }

        if (!dirtyRegions.length) {
            this.updateStaticTerrainLayerState(bufferAnchor);
            return true;
        }

        const terrainTiles = getTilesInRadius(
            Math.round(camera.q),
            Math.round(camera.r),
            camera.radius + this.getStaticTerrainRadiusPadding(),
        );

        this._terrainCtx.save();
        this._terrainCtx.scale(this._dpr, this._dpr);
        this._terrainCtx.translate(bufferCenterX - bufferAnchor.x, bufferCenterY - bufferAnchor.y);

        for (const region of dirtyRegions) {
            this._terrainCtx.clearRect(
                region.x + bufferAnchor.x - bufferCenterX,
                region.y + bufferAnchor.y - bufferCenterY,
                region.width,
                region.height,
            );
        }

        this.drawDiscoveredTerrainTilesInRegions(
            this._terrainCtx,
            terrainTiles,
            effectNowMs,
            dirtyRegions,
            bufferAnchor,
            bufferCenterX,
            bufferCenterY,
        );

        this._terrainCtx.restore();
        this.updateStaticTerrainLayerState(bufferAnchor);
        return true;
    }

    private renderSceneStage(frame: RenderFrameContext, opts: DrawOptions) {
        const suppressWorldUi = frame.cameraMoving && frame.visibleTiles.length >= 180;
        frame.sceneCtx.clearRect(0, 0, frame.sceneCanvas.width, frame.sceneCanvas.height);
        this.drawTilesAndActors(
            frame.sceneCtx,
            opts,
            false,
            false,
            frame.cameraFx,
            frame.effectNowMs,
            frame.movementNowMs,
            frame.visibleTiles,
            false,
            suppressWorldUi,
        );
    }

    private compositeSceneStage(frame: RenderFrameContext) {
        frame.worldCtx.clearRect(0, 0, frame.worldCanvas.width, frame.worldCanvas.height);
        frame.worldCtx.globalAlpha = 1;
        frame.worldCtx.filter = 'none';
        frame.worldCtx.imageSmoothingEnabled = false;
        this.drawStaticTerrainLayer(frame.worldCtx, frame);
        frame.worldCtx.drawImage(frame.sceneCanvas, 0, 0);

        const ctx = frame.finalCtx;
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = false;

        if (frame.quality.enableManualShadowComposite) {
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.shadowBlur = 5;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.drawImage(frame.worldCanvas, 0, 0);

            ctx.shadowOffsetX = 15;
            ctx.shadowOffsetY = 35;
            ctx.shadowBlur = 25;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.drawImage(frame.worldCanvas, 0, 0);

            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            return;
        }

        ctx.drawImage(frame.worldCanvas, 0, 0);
    }

    private renderPostProcessStage(frame: RenderFrameContext, opts: DrawOptions) {
        const motionBlur = frame.quality.enableMotionBlur ? this.getMotionBlurState() : null;
        if (motionBlur) {
            this.drawMotionTrail(frame.finalCtx, frame.worldCanvas, motionBlur);
        }

        if (frame.quality.enableBloom && this._bloomCtx && this._bloomCanvas) {
            this._bloomCtx.clearRect(0, 0, this._bloomCanvas.width, this._bloomCanvas.height);
            this.drawBloomLayer(
                this._bloomCtx,
                opts,
                frame.cameraFx,
                frame.effectNowMs,
                frame.movementNowMs,
                frame.visibleTiles,
            );
            this.compositeBloom(frame.finalCtx, this._bloomCanvas);
        }

        this.drawResourceFlights(frame.finalCtx, frame.cameraFx, frame.effectNowMs);
        if (frame.quality.enableEdgeVignette) {
            this.applyCameraEdgeVignette(frame.finalCtx, frame.cameraFx);
        }
        return motionBlur;
    }

    private getStaticTerrainRadiusPadding() {
        return Math.max(3, Math.ceil(this.STATIC_TERRAIN_PADDING_PX / (this.HEX_SIZE * 1.5)));
    }

    private getStaticTerrainRefreshThreshold() {
        return this.STATIC_TERRAIN_PADDING_PX * (isCameraMoving() ? 0.86 : 0.72);
    }

    private shouldRefreshStaticTerrainLayer() {
        if (!this._terrainLayerState || !this._terrainCanvas || !this._canvas) {
            this._lastStaticTerrainReason = 'init';
            return true;
        }

        const state = this._terrainLayerState;
        if (state.worldVersion !== getWorldRenderVersion()) {
            this._lastStaticTerrainReason = 'world';
            return true;
        }
        if (state.viewportWidth !== this._canvas.width || state.viewportHeight !== this._canvas.height) {
            this._lastStaticTerrainReason = 'viewport';
            return true;
        }
        if (state.terrainCanvasWidth !== this._terrainCanvas.width || state.terrainCanvasHeight !== this._terrainCanvas.height) {
            this._lastStaticTerrainReason = 'viewport';
            return true;
        }
        if (state.cameraRadius !== Math.round(camera.radius)) {
            this._lastStaticTerrainReason = 'radius';
            return true;
        }

        const current = axialToPixel(camera.q, camera.r);
        const driftX = Math.abs(current.x - state.anchorWorldX);
        const driftY = Math.abs(current.y - state.anchorWorldY);
        const refreshThreshold = this.getStaticTerrainRefreshThreshold();
        const maxDrift = Math.max(driftX, driftY);
        this._lastStaticTerrainShiftPx = maxDrift;
        if (maxDrift >= refreshThreshold) {
            this._lastStaticTerrainReason = 'drift';
            return true;
        }

        this._lastStaticTerrainReason = 'reuse';
        return false;
    }

    private shiftStaticTerrainLayer(anchor: { x: number; y: number }, effectNowMs: number) {
        if (!this._terrainCtx || !this._terrainCanvas || !this._terrainScratchCanvas || !this._terrainScratchCtx || !this._terrainLayerState) {
            return false;
        }

        const previousAnchorX = this._terrainLayerState.anchorWorldX;
        const previousAnchorY = this._terrainLayerState.anchorWorldY;
        const shiftX = previousAnchorX - anchor.x;
        const shiftY = previousAnchorY - anchor.y;
        const shiftDeviceX = shiftX * this._dpr;
        const shiftDeviceY = shiftY * this._dpr;

        if (Math.abs(shiftDeviceX) >= this._terrainCanvas.width || Math.abs(shiftDeviceY) >= this._terrainCanvas.height) {
            return false;
        }

        const bufferWidth = this._terrainCanvas.width / this._dpr;
        const bufferHeight = this._terrainCanvas.height / this._dpr;
        const dirtyRegions = this.getShiftDirtyRegions(shiftX, shiftY, bufferWidth, bufferHeight);
        if (!dirtyRegions.length) {
            this.updateStaticTerrainLayerState(anchor);
            return true;
        }

        this._terrainScratchCtx.clearRect(0, 0, this._terrainScratchCanvas.width, this._terrainScratchCanvas.height);
        this._terrainScratchCtx.drawImage(this._terrainCanvas, 0, 0);
        this._terrainCtx.clearRect(0, 0, this._terrainCanvas.width, this._terrainCanvas.height);
        this._terrainCtx.drawImage(this._terrainScratchCanvas, shiftDeviceX, shiftDeviceY);

        const terrainTiles = getTilesInRadius(
            Math.round(camera.q),
            Math.round(camera.r),
            camera.radius + this.getStaticTerrainRadiusPadding(),
        );
        const bufferCenterX = bufferWidth / 2;
        const bufferCenterY = bufferHeight / 2;

        this._terrainCtx.save();
        this._terrainCtx.scale(this._dpr, this._dpr);
        this._terrainCtx.translate(bufferCenterX - anchor.x, bufferCenterY - anchor.y);
        this.drawDiscoveredTerrainTilesInRegions(
            this._terrainCtx,
            terrainTiles,
            effectNowMs,
            dirtyRegions,
            anchor,
            bufferCenterX,
            bufferCenterY,
        );
        this._terrainCtx.restore();

        this.updateStaticTerrainLayerState(anchor);
        return true;
    }

    private getShiftDirtyRegions(shiftX: number, shiftY: number, bufferWidth: number, bufferHeight: number): BufferRegion[] {
        const regions: BufferRegion[] = [];

        if (shiftX > 0) {
            regions.push({ x: 0, y: 0, width: Math.min(bufferWidth, shiftX), height: bufferHeight });
        } else if (shiftX < 0) {
            const width = Math.min(bufferWidth, Math.abs(shiftX));
            regions.push({ x: Math.max(0, bufferWidth - width), y: 0, width, height: bufferHeight });
        }

        if (shiftY > 0) {
            regions.push({ x: 0, y: 0, width: bufferWidth, height: Math.min(bufferHeight, shiftY) });
        } else if (shiftY < 0) {
            const height = Math.min(bufferHeight, Math.abs(shiftY));
            regions.push({ x: 0, y: Math.max(0, bufferHeight - height), width: bufferWidth, height });
        }

        return regions.filter((region) => region.width > 0 && region.height > 0);
    }

    private drawDiscoveredTerrainTilesInRegions(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        now: number,
        regions: BufferRegion[],
        anchor: { x: number; y: number },
        bufferCenterX: number,
        bufferCenterY: number,
    ) {
        for (const tile of tiles) {
            if (!tile.discovered) continue;

            const world = axialToPixel(tile.q, tile.r);
            const drawX = bufferCenterX + (world.x - anchor.x) - this.HEX_SIZE;
            const drawY = bufferCenterY + (world.y - anchor.y) - this.HEX_SIZE;
            if (!this.tileIntersectsDirtyRegions(drawX, drawY, regions)) continue;

            this.drawTile(tile, now, ctx, 1);
        }
    }

    private tileIntersectsDirtyRegions(drawX: number, drawY: number, regions: BufferRegion[]) {
        for (const region of regions) {
            if (
                drawX < region.x + region.width
                && drawX + this.TILE_DRAW_SIZE > region.x
                && drawY < region.y + region.height
                && drawY + this.TILE_DRAW_SIZE > region.y
            ) {
                return true;
            }
        }

        return false;
    }

    private updateStaticTerrainLayerState(anchor: { x: number; y: number }) {
        this._terrainLayerState = {
            worldVersion: getWorldRenderVersion(),
            anchorWorldX: anchor.x,
            anchorWorldY: anchor.y,
            viewportWidth: this._canvas?.width ?? 0,
            viewportHeight: this._canvas?.height ?? 0,
            terrainCanvasWidth: this._terrainCanvas?.width ?? 0,
            terrainCanvasHeight: this._terrainCanvas?.height ?? 0,
            cameraRadius: Math.round(camera.radius),
        };
    }

    private filterTilesToViewport(tiles: Tile[], cameraFx: CameraCompositeState) {
        if (!this._canvas || !tiles.length) {
            return tiles;
        }

        const margin = Math.max(this.TILE_DRAW_SIZE * 1.5, 72);
        const minX = -margin;
        const maxX = (this._canvas.width / this._dpr) + margin;
        const minY = -margin;
        const maxY = (this._canvas.height / this._dpr) + margin;
        const camPx = axialToPixel(camera.q, camera.r);
        const { cx, cy } = this.getCanvasCenter();
        const zoom = cameraFx.zoom;
        const cos = Math.cos(cameraFx.roll);
        const sin = Math.sin(cameraFx.roll);

        return tiles.filter((tile) => {
            const world = axialToPixel(tile.q, tile.r);
            const relX = (world.x - camPx.x) * zoom;
            const relY = (world.y - camPx.y) * zoom;
            const screenX = cx + cameraFx.offsetX + ((relX * cos) - (relY * sin));
            const screenY = cy + cameraFx.offsetY + ((relX * sin) + (relY * cos));
            return screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY;
        });
    }

    private drawStaticTerrainLayer(ctx: CanvasRenderingContext2D, frame: RenderFrameContext) {
        if (!this._terrainCanvas || !this._terrainLayerState) return;

        const state = this._terrainLayerState;
        const current = axialToPixel(camera.q, camera.r);
        const paddingPx = this.STATIC_TERRAIN_PADDING_PX * this._dpr;
        const drawX = -paddingPx + ((state.anchorWorldX - current.x + frame.cameraFx.offsetX) * this._dpr);
        const drawY = -paddingPx + ((state.anchorWorldY - current.y + frame.cameraFx.offsetY) * this._dpr);
        this._lastStaticTerrainShiftPx = Math.max(
            Math.abs(current.x - state.anchorWorldX),
            Math.abs(current.y - state.anchorWorldY),
        );
        ctx.drawImage(this._terrainCanvas, drawX, drawY);
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

    private getActorOpacity(dist: number, applyCameraFade: boolean) {
        if (!applyCameraFade) return 1;
        return this.computeFade(dist, camera.innerRadius, camera.radius);
    }

    private getMotionBlurState() {
        if (!this._currentRenderQuality.enableMotionBlur || !this._worldCanvas) return null;

        const SPEED_THRESHOLD = 70;
        const MAX_SPEED_FOR_SCALING = 1100;
        const screenSpeed = Math.hypot(camera.screenVelocityX, camera.screenVelocityY);

        if (screenSpeed <= SPEED_THRESHOLD) {
            return null;
        }

        const rawNorm = Math.min(1, (screenSpeed - SPEED_THRESHOLD) / (MAX_SPEED_FOR_SCALING - SPEED_THRESHOLD));
        const norm = rawNorm * rawNorm * (3 - (2 * rawNorm));
        const dirX = camera.screenVelocityX / screenSpeed;
        const dirY = camera.screenVelocityY / screenSpeed;
        const strength = this._currentRenderQuality.motionBlurStrength;
        const streakLength = (7 + norm * 29) * (0.58 + (strength * 0.48));
        const samples = Math.max(3, Math.round((4 + norm * 7.5) * (0.68 + (strength * 0.36))));

        return {
            offsetX: -dirX * streakLength,
            offsetY: -dirY * streakLength,
            samples,
            alpha: (0.09 + norm * 0.16) * strength,
            crispAlpha: (0.032 + norm * 0.045) * strength,
            softness: 1 + (norm * (1.55 * strength)),
            strength,
        };
    }

    private drawMotionTrail(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, motion: {
        offsetX: number;
        offsetY: number;
        samples: number;
        alpha: number;
        crispAlpha: number;
        softness: number;
        strength: number;
    }) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.filter = `blur(${motion.softness.toFixed(2)}px)`;

        for (let i = motion.samples; i >= 1; i--) {
            const t = i / motion.samples;
            const weight = motion.alpha * (0.35 + ((1 - t) * 0.65));
            ctx.globalAlpha = weight;
            ctx.drawImage(source, motion.offsetX * t, motion.offsetY * t);
        }

        ctx.filter = 'none';
        for (let i = motion.samples; i >= 1; i--) {
            const t = i / motion.samples;
            ctx.globalAlpha = motion.crispAlpha * (1 - (t * 0.7));
            ctx.drawImage(source, motion.offsetX * t, motion.offsetY * t);
        }
        ctx.restore();
    }

    private applyCameraEdgeVignette(ctx: CanvasRenderingContext2D, cameraFx: CameraCompositeState) {
        if (!this._canvas) return;

        const width = this._canvas.width;
        const height = this._canvas.height;
        const centerX = (width / 2) + (cameraFx.vignetteBiasX * this._dpr);
        const centerY = (height / 2) + (cameraFx.vignetteBiasY * this._dpr);
        const baseRadius = Math.min(width, height) * (0.84 - (cameraFx.speedNorm * 0.035));
        const scaleX = width >= height ? Math.min(1.45, width / height) : 1;
        const scaleY = height > width ? Math.min(1.45, height / width) : 1;
        const drawWidth = width / scaleX;
        const drawHeight = height / scaleY;
        const edgeBoost = 1 + (cameraFx.speedNorm * 0.35);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scaleX, scaleY);

        const broadVignette = ctx.createRadialGradient(0, 0, baseRadius * 0.2, 0, 0, baseRadius);
        broadVignette.addColorStop(0, 'rgba(7, 11, 18, 0)');
        broadVignette.addColorStop(0.42, 'rgba(7, 11, 18, 0.008)');
        broadVignette.addColorStop(0.68, this.toRgba([7, 11, 18], 0.045 * edgeBoost));
        broadVignette.addColorStop(0.86, this.toRgba([7, 11, 18], 0.12 * edgeBoost));
        broadVignette.addColorStop(1, this.toRgba([6, 9, 15], 0.24 + (cameraFx.speedNorm * 0.08)));
        ctx.fillStyle = broadVignette;
        ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

        const edgeVignette = ctx.createRadialGradient(0, 0, baseRadius * 0.72, 0, 0, baseRadius * 1.02);
        edgeVignette.addColorStop(0, 'rgba(6, 9, 15, 0)');
        edgeVignette.addColorStop(0.82, 'rgba(6, 9, 15, 0)');
        edgeVignette.addColorStop(0.94, this.toRgba([6, 9, 15], 0.08 * edgeBoost));
        edgeVignette.addColorStop(1, this.toRgba([5, 7, 12], 0.22 + (cameraFx.speedNorm * 0.09)));
        ctx.fillStyle = edgeVignette;
        ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

        ctx.restore();
    }

    private drawBloomLayer(
        ctx: CanvasRenderingContext2D,
        opts: DrawOptions,
        cameraFx: CameraCompositeState,
        effectNowMs: number,
        movementNowMs: number = effectNowMs,
        tiles: Tile[] = [],
    ) {
        if (!this._canvas) return;

        const camPx = axialToPixel(camera.q, camera.r);
        const {cx, cy} = this.getCanvasCenter();
        const translateX = cx - camPx.x;
        const translateY = cy - camPx.y;

        ctx.save();
        ctx.scale(this._dpr, this._dpr);
        this.applyWorldTransform(ctx, translateX, translateY, cameraFx);

        for (const tile of tiles) {
            if (!tile.discovered) continue;

            const dist = hexDistance(camera, tile);
            const opacity = (() => {
                const f = this.computeFade(dist, camera.innerRadius, camera.radius);
                return f * f;
            })();

            if (opacity <= 0.04) continue;

            const bloomSpec = this.getTileBloomSpec(tile);
            if (bloomSpec) {
                const {x, y} = axialToPixel(tile.q, tile.r);
                this.drawGlow(ctx, x, y + bloomSpec.yOffset, bloomSpec.radius, bloomSpec.color, bloomSpec.strength * opacity);
            }

            const activeTasksForTile = taskStore.tasksByTile[tile.id];
            if (activeTasksForTile) {
                const pulse = 0.12 + (((Math.sin(effectNowMs / 400) + 1) / 2) * 0.08);
                const {x, y} = axialToPixel(tile.q, tile.r);
                this.drawGlow(ctx, x, y, this.HEX_SIZE * 0.95, [96, 228, 255], opacity * pulse);
            }
        }

        this.drawBloomOverlayHighlights(ctx, opts, movementNowMs);
        ctx.restore();
    }

    private compositeBloom(ctx: CanvasRenderingContext2D, bloomCanvas: HTMLCanvasElement) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.26;
        ctx.filter = 'blur(7px) brightness(82%) saturate(172%) contrast(112%)';
        ctx.drawImage(bloomCanvas, 0, 0);
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.18;
        ctx.filter = 'saturate(188%) contrast(108%)';
        ctx.drawImage(bloomCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.08;
        ctx.filter = 'blur(2px) saturate(160%)';
        ctx.drawImage(bloomCanvas, 0, 0);
        ctx.restore();
    }

    private drawBloomOverlayHighlights(ctx: CanvasRenderingContext2D, opts: DrawOptions, nowMs: number) {
        if (opts.hoveredTile) {
            const {x, y} = axialToPixel(opts.hoveredTile.q, opts.hoveredTile.r);
            const opacity = this.computeFade(hexDistance(camera, opts.hoveredTile), camera.innerRadius, camera.radius);
            const inReach = opts.hoveredTileInReach !== false;
            const glowColor: [number, number, number] = inReach ? [255, 226, 122] : [100, 60, 60];
            this.drawGlow(ctx, x, y, this.HEX_SIZE, glowColor, opacity * 0.2);
        }

        if (opts.taskMenuTile) {
            const {x, y} = axialToPixel(opts.taskMenuTile.q, opts.taskMenuTile.r);
            const opacity = this.computeFade(hexDistance(camera, opts.taskMenuTile), camera.innerRadius, camera.radius);
            this.drawGlow(ctx, x, y, this.HEX_SIZE * 1.05, [145, 250, 49], opacity * 0.22);
        }

        const selectedHero = selectedHeroId.value ? heroes.find(h => h.id === selectedHeroId.value) || null : null;
        if (selectedHero) {
            const opacity = this.computeFade(hexDistance(camera, selectedHero), camera.innerRadius, camera.radius);
            const interp = this.getHeroInterpolatedPixelPosition(selectedHero, nowMs);
            this.drawGlow(ctx, interp.x + 12, interp.y - 22, this.HEX_SIZE * 0.95, [255, 214, 122], opacity * 0.32);
            this.drawGlow(ctx, interp.x + 8, interp.y - 18, this.HEX_SIZE * 0.72, [126, 255, 214], opacity * 0.22);
        }
    }

    private getTileBloomSpec(t: Tile): { color: GlowColor; radius: number; strength: number; yOffset: number } | null {
        const baseKey = this.getTileImageKey(t);
        const overlayKey = this.getTileOverlayKey(t);

        if (t.terrain === 'vulcano' || baseKey === 'vulcano' || overlayKey === 'vulcano_overhang') {
            return { color: [255, 145, 92], radius: this.HEX_SIZE * 1.05, strength: 0.24, yOffset: -6 };
        }

        if (t.terrain === 'towncenter') {
            return { color: [255, 190, 118], radius: this.HEX_SIZE * 0.98, strength: 0.18, yOffset: -4 };
        }

        if (baseKey === 'grain_bloom') {
            return { color: [255, 219, 120], radius: this.HEX_SIZE * 0.95, strength: 0.2, yOffset: -5 };
        }

        if (baseKey === 'water_lily') {
            return { color: [178, 255, 224], radius: this.HEX_SIZE * 0.82, strength: 0.14, yOffset: -2 };
        }

        if (baseKey === 'water_reflections') {
            return { color: [130, 222, 255], radius: this.HEX_SIZE, strength: 0.18, yOffset: -1 };
        }

        return null;
    }

    private drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: GlowColor, opacity: number) {
        if (opacity <= 0) return;

        const gradient = ctx.createRadialGradient(x, y, radius * 0.12, x, y, radius);
        gradient.addColorStop(0, this.toRgba(color, opacity));
        gradient.addColorStop(0.42, this.toRgba(color, opacity * 0.45));
        gradient.addColorStop(1, this.toRgba(color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    private sampleBackdropPalette(tiles: Tile[]): BackdropPaletteWeights {
        const weights: BackdropPaletteWeights = {
            lush: 0,
            water: 0,
            cold: 0,
            warm: 0,
            stone: 0,
            ember: 0,
        };

        if (!tiles.length) {
            return weights;
        }

        const sampleCap = 120;
        const step = Math.max(1, Math.floor(tiles.length / sampleCap));
        let samples = 0;

        for (let i = 0; i < tiles.length; i += step) {
            const tile = tiles[i];
            if (!tile?.discovered || !tile.terrain) continue;

            const climate = getClimateProfile(tile.q, tile.r);
            const fertilityBoost = 0.82 + (climate.fertility * 0.45);

            switch (tile.terrain) {
                case 'forest':
                    weights.lush += 1.15 * fertilityBoost;
                    weights.cold += Math.max(0, 0.45 - climate.temperature) * 0.18;
                    break;
                case 'plains':
                    weights.lush += 0.92 * fertilityBoost;
                    weights.warm += climate.temperature * 0.12;
                    break;
                case 'grain':
                    weights.lush += 0.74 * fertilityBoost;
                    weights.warm += 0.34 + (climate.temperature * 0.16);
                    break;
                case 'water':
                    weights.water += 1.2 + (climate.moisture * 0.28);
                    weights.cold += Math.max(0, 0.58 - climate.temperature) * 0.26;
                    weights.warm += Math.max(0, climate.temperature - 0.58) * 0.18;
                    break;
                case 'snow':
                    weights.cold += 1.28;
                    weights.stone += 0.18 + (climate.ruggedness * 0.14);
                    break;
                case 'mountain':
                    weights.stone += 1.14 + (climate.ruggedness * 0.24);
                    weights.cold += Math.max(0, 0.5 - climate.temperature) * 0.18;
                    break;
                case 'dirt':
                    weights.warm += 0.48 + (climate.temperature * 0.12);
                    weights.stone += 0.34;
                    break;
                case 'dessert':
                    weights.warm += 1.18;
                    weights.stone += 0.2;
                    break;
                case 'vulcano':
                    weights.ember += 1.38;
                    weights.stone += 0.48;
                    weights.warm += 0.36;
                    break;
                case 'towncenter':
                    weights.warm += 0.82;
                    weights.lush += 0.22;
                    weights.water += 0.12;
                    break;
            }

            samples++;
        }

        if (!samples) {
            return weights;
        }

        return {
            lush: Math.min(1.2, weights.lush / samples),
            water: Math.min(1.2, weights.water / samples),
            cold: Math.min(1.2, weights.cold / samples),
            warm: Math.min(1.2, weights.warm / samples),
            stone: Math.min(1.2, weights.stone / samples),
            ember: Math.min(1.2, weights.ember / samples),
        };
    }

    private drawAtmosphericBackdrop(
        ctx: CanvasRenderingContext2D,
        visibleTiles: Tile[],
        nowMs: number,
        cameraFx: CameraCompositeState,
        quality: RenderQualityProfile = this._currentRenderQuality,
    ) {
        if (!this._canvas) return;

        const width = this._canvas.width / this._dpr;
        const height = this._canvas.height / this._dpr;
        const weights = this.getBackdropPaletteWeights(visibleTiles, nowMs);
        const pulse = 0.78 + (Math.sin(nowMs / 2600) * 0.06);

        const topColor: GlowColor = [
            Math.round(20 + (weights.warm * 94) + (weights.ember * 118) + (weights.lush * 34)),
            Math.round(28 + (weights.lush * 94) + (weights.water * 52) + (weights.warm * 34)),
            Math.round(46 + (weights.water * 122) + (weights.cold * 96) + (weights.stone * 32)),
        ];
        const bottomColor: GlowColor = [
            Math.round(8 + (weights.stone * 64) + (weights.ember * 40) + (weights.warm * 22)),
            Math.round(12 + (weights.water * 22) + (weights.lush * 26) + (weights.stone * 34)),
            Math.round(20 + (weights.water * 68) + (weights.cold * 72) + (weights.stone * 56)),
        ];

        ctx.save();
        ctx.imageSmoothingEnabled = true;

        const wash = ctx.createLinearGradient(0, 0, width, height);
        wash.addColorStop(0, this.toRgba(topColor, 0.18));
        wash.addColorStop(0.52, this.toRgba(topColor, 0.08));
        wash.addColorStop(1, this.toRgba(bottomColor, 0.26));
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, width, height);

        if (quality.enableBackdropGlows) {
            ctx.globalCompositeOperation = 'screen';
            this.drawGlow(
                ctx,
                (width * 0.26) + (cameraFx.vignetteBiasX * 0.1),
                (height * 0.3) + (cameraFx.vignetteBiasY * 0.08),
                Math.min(width, height) * (0.34 + (weights.lush * 0.08)),
                [120, 188, 144],
                (0.03 + (weights.lush * 0.11)) * pulse,
            );
            this.drawGlow(
                ctx,
                (width * 0.34) - (cameraFx.vignetteBiasX * 0.06),
                height * 0.26,
                Math.min(width, height) * (0.28 + (weights.water * 0.08)),
                [96, 182, 226],
                (0.03 + (weights.water * 0.12) + (weights.cold * 0.02)) * pulse,
            );
            this.drawGlow(
                ctx,
                width * 0.74,
                (height * 0.22) + (cameraFx.vignetteBiasY * 0.06),
                Math.min(width, height) * (0.24 + (weights.warm * 0.06)),
                [255, 191, 122],
                (0.025 + (weights.warm * 0.09) + (weights.ember * 0.05)) * pulse,
            );
            if (weights.ember > 0.02) {
                this.drawGlow(
                    ctx,
                    width * 0.82,
                    height * 0.16,
                    Math.min(width, height) * 0.2,
                    [255, 128, 82],
                    (0.02 + (weights.ember * 0.11)) * pulse,
                );
            }
        }

        ctx.globalCompositeOperation = 'multiply';
        const floorShadow = ctx.createLinearGradient(0, height * 0.18, 0, height);
        floorShadow.addColorStop(0, 'rgba(5, 8, 14, 0)');
        floorShadow.addColorStop(0.64, 'rgba(5, 8, 14, 0.1)');
        floorShadow.addColorStop(1, 'rgba(5, 8, 14, 0.22)');
        ctx.fillStyle = floorShadow;
        ctx.fillRect(0, 0, width, height);

        ctx.restore();
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

    private getBackdropPaletteWeights(visibleTiles: Tile[], nowMs: number) {
        const cacheDurationMs = 240;
        const key = `${Math.round(camera.q / 2)},${Math.round(camera.r / 2)}:${visibleTiles.length}`;
        if (
            this._backdropPaletteCache
            && this._backdropPaletteCache.key === key
            && this._backdropPaletteCache.expiresAtMs >= nowMs
        ) {
            return this._backdropPaletteCache.weights;
        }

        const weights = this.sampleBackdropPalette(visibleTiles);
        this._backdropPaletteCache = {
            key,
            expiresAtMs: nowMs + cacheDurationMs,
            weights,
        };
        return weights;
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

    private smoothStep(value: number) {
        const clamped = Math.max(0, Math.min(1, value));
        return clamped * clamped * (3 - (2 * clamped));
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
        const {cx, cy} = this.getCanvasCenter();
        const scaledX = relX * cameraFx.zoom;
        const scaledY = relY * cameraFx.zoom;
        const cos = Math.cos(cameraFx.roll);
        const sin = Math.sin(cameraFx.roll);
        const rotatedX = (scaledX * cos) - (scaledY * sin);
        const rotatedY = (scaledX * sin) + (scaledY * cos);

        return {
            x: cx + cameraFx.offsetX + rotatedX,
            y: cy + cameraFx.offsetY + rotatedY,
        };
    }

    private projectWorldToScreenPixels(worldX: number, worldY: number, cameraFx: CameraCompositeState = this._currentCameraFx) {
        const camPx = axialToPixel(camera.q, camera.r);
        return this.projectRelativeToScreen(worldX - camPx.x, worldY - camPx.y, cameraFx);
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

    private drawResourceFlights(ctx: CanvasRenderingContext2D, cameraFx: CameraCompositeState, nowMs: number) {
        const flights = getActiveResourceFlights(nowMs);
        if (!flights.length) return;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const flight of flights) {
            if (nowMs < flight.startedMs) continue;

            const target = getResourceTargetCenter(flight.resourceType);
            if (!target) continue;

            const progress = Math.min(1, Math.max(0, (nowMs - flight.startedMs) / flight.durationMs));
            const eased = this.smoothStep(progress);
            const world = axialToPixel(flight.q, flight.r);
            const start = this.projectWorldToScreenPixels(world.x, world.y, cameraFx);
            const controlX = ((start.x + target.x) / 2) + flight.scatter;
            const controlY = Math.min(start.y, target.y) - (68 + (Math.abs(flight.scatter) * 0.35));
            const point = this.getQuadraticPoint(start.x, start.y, controlX, controlY, target.x, target.y, eased);
            const alpha = 1 - (progress * 0.55);
            const scale = 0.72 + ((1 - progress) * 0.55);
            const glowRadius = 10 + ((1 - progress) * 5);

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, glowRadius);
            glow.addColorStop(0, this.toRgba(this.hexToColor(flight.color), alpha * 0.9));
            glow.addColorStop(0.45, this.toRgba(this.hexToColor(flight.color), alpha * 0.4));
            glow.addColorStop(1, this.toRgba(this.hexToColor(flight.color), 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(point.x, point.y);
            ctx.scale(scale, scale);
            ctx.font = "18px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
            ctx.fillText(flight.icon, 0, 0);
            ctx.restore();
        }

        ctx.restore();
    }

    private getQuadraticPoint(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number) {
        const inv = 1 - t;
        return {
            x: (inv * inv * x0) + (2 * inv * t * cx) + (t * t * x1),
            y: (inv * inv * y0) + (2 * inv * t * cy) + (t * t * y1),
        };
    }

    private hexToColor(hex: string): GlowColor {
        const normalized = hex.replace('#', '');
        const value = normalized.length === 3
            ? normalized.split('').map((part) => part + part).join('')
            : normalized.padEnd(6, '0').slice(0, 6);
        const parsed = Number.parseInt(value, 16);
        return [
            (parsed >> 16) & 255,
            (parsed >> 8) & 255,
            parsed & 255,
        ];
    }

    private screenToWorld(x: number, y: number) {
        const camPx = axialToPixel(camera.q, camera.r);
        const {cx, cy} = this.getCanvasCenter();
        const cameraFx = this._currentCameraFx;
        const dx = x - (cx + cameraFx.offsetX);
        const dy = y - (cy + cameraFx.offsetY);
        const cos = Math.cos(cameraFx.roll);
        const sin = Math.sin(cameraFx.roll);
        const relX = ((dx * cos) + (dy * sin)) / cameraFx.zoom;
        const relY = ((dy * cos) - (dx * sin)) / cameraFx.zoom;
        const worldX = camPx.x + relX;
        const worldY = camPx.y + relY;
        return {worldX, worldY};
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
        const tilePx = axialToPixel(q, r);
        return this.projectWorldToScreenPixels(tilePx.x, tilePx.y);
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
            if (!this._currentRenderQuality.enableReachGlow) {
                ctx.globalAlpha = alpha * 0.9;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = hovered ? 'rgba(255,230,80,0.72)' : 'rgba(210,190,70,0.58)';
                ctx.lineWidth = hovered ? 2.4 : 1.4;
                this.strokeSmoothLoop(ctx, loop);
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
            this.strokeSmoothLoop(ctx, loop);

            // Diffuse glow pass
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.globalAlpha = alpha;
            ctx.shadowColor = hovered ? 'rgba(220,200,60,0.7)' : 'rgba(180,160,50,0.6)';
            ctx.shadowBlur = hovered ? 24 : 18;
            ctx.strokeStyle = hovered ? 'rgba(220,200,60,0.5)' : 'rgba(180,160,50,0.4)';
            ctx.lineWidth = hovered ? 7 : 5;
            this.strokeSmoothLoop(ctx, loop);

            // Core line — bright and crisp
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.globalAlpha = alpha * 0.85;
            ctx.strokeStyle = hovered ? 'rgba(255,230,80,0.6)' : 'rgba(210,190,70,0.5)';
            ctx.lineWidth = hovered ? 2.5 : 1.5;
            this.strokeSmoothLoop(ctx, loop);
        }
        ctx.restore();
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
        const visibleTiles = precomputedVisibleTiles ?? getTilesInRadius(cq, cr, camera.radius);
        const allowInteractiveHighlights = !forMotionBlur;
        const allowPersistentWorldUi = allowInteractiveHighlights && !suppressWorldUi;
        ctx.save();
        ctx.scale(this._dpr, this._dpr);
        this.applyWorldTransform(ctx, translateX, translateY, cameraFx);

        const overlayRecords: Array<{ img: HTMLImageElement; x: number; y: number; q: number; r: number; opacity: number; z: number }> = [];
        this.drawTiles(ctx, overlayRecords, visibleTiles, effectNowMs, applyCameraFade, opts.globalReachTileIds, includeDiscoveredTerrain, suppressWorldUi);
        if (allowPersistentWorldUi) {
            this.drawGameplayWorldImpacts(ctx, effectNowMs, applyCameraFade);
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
            // Animate hovered reach alpha (smooth ease-in / ease-out)
            const hasHovered = !!(opts.hoveredReachBoundary && opts.hoveredReachBoundary.length);
            if (hasHovered) {
                this._lastHoveredReachBoundary = opts.hoveredReachBoundary!;
                this._lastHoveredReachTileIds = new Set(opts.hoveredReachTileIds);
            }
            const targetAlpha = hasHovered ? 0.9 : 0;
            const lerpSpeed = hasHovered ? 0.06 : 0.1;
            this._hoveredReachAlpha += (targetAlpha - this._hoveredReachAlpha) * lerpSpeed;
            if (Math.abs(this._hoveredReachAlpha - targetAlpha) < 0.005) this._hoveredReachAlpha = targetAlpha;

            // Global reach (all TCs combined) — always visible
            if (opts.globalReachBoundary && opts.globalReachBoundary.length) {
                const reachSet = opts.globalReachTileIds || new Set<string>();
                this.drawReachOutline(ctx, opts.globalReachBoundary, reachSet, 0.45, false);
            }

            // Hovered TC reach — brighter overlay on top, smoothly faded
            if (this._hoveredReachAlpha > 0.005 && this._lastHoveredReachBoundary.length) {
                this.drawReachOutline(ctx, this._lastHoveredReachBoundary, this._lastHoveredReachTileIds, this._hoveredReachAlpha, true);
            }
        }

        // Heroes & overlays combined layering
        this.drawHeroes(ctx, forMotionBlur ? null : opts.hoveredHero, overlayRecords, applyCameraFade, movementNowMs);
        if (allowPersistentWorldUi) {
            this.drawTaskIndicators(ctx, visibleTiles, applyCameraFade);
        }
        ctx.restore();

        if (allowPersistentWorldUi) {
            ctx.save();
            ctx.scale(this._dpr, this._dpr);
            this.drawTextIndicators(ctx, effectNowMs, cameraFx);
            ctx.restore();
        }
    }

    private drawDiscoveredTerrainTiles(
        ctx: CanvasRenderingContext2D,
        tiles: Tile[],
        now: number,
        applyCameraFade: boolean = true,
    ) {
        for (const t of tiles) {
            if (!t.discovered) continue;
            const dist = hexDistance(camera, t);
            const opacity = this.getTileOpacity(dist, applyCameraFade);
            this.drawTile(t, now, ctx, opacity);
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
        for (const t of tiles) {
            const dist = hexDistance(camera, t);
            const opacity = this.getTileOpacity(dist, applyCameraFade);

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
                const overlayKey = this.getTileOverlayKey(t);
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
        }
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

    private drawTaskIndicators(ctx: CanvasRenderingContext2D, tiles: Tile[], applyCameraFade: boolean = true) {
        for (const t of tiles) {
            const dist = hexDistance(camera, t);
            const opacity = this.getTileOpacity(dist, applyCameraFade);

            if (canUseWarehouseAtTile(t)) {
                this.drawStorageIndicator(ctx, t, opacity);
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

    private drawStorageIndicator(ctx: CanvasRenderingContext2D, tile: Tile, opacity: number) {
        const storageKind = getStorageKindForTile(tile);
        if (!storageKind) return;

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

        ctx.globalAlpha = opacity * 0.72;
        this.drawRoundedRect(ctx, drawX, drawY, width, height, 6);
        ctx.fillStyle = 'rgba(7, 16, 29, 0.88)';
        ctx.fill();

        ctx.globalAlpha = opacity * 0.95;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.globalAlpha = opacity;
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
        this._heroTrailEmitMs.clear();
        this._taskParticleEmitMs.clear();
        this._lastParticleUpdateMs = now;
    }

    private updateParticles(deltaMs: number, now: number) {
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
        this._particles.push(particle);
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
        const existingCanvas = this._maskedImages[cacheKey];
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
        this._maskedImages[cacheKey] = c;
        return c;
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

    private getTileNeighbor(tile: Tile, side: TileSide) {
        const direct = tile.neighbors?.[side];
        if (direct) {
            return direct;
        }

        const [dq, dr] = TILE_SIDE_DELTAS[side];
        return tileIndex[axialKey(tile.q + dq, tile.r + dr)] ?? null;
    }

    private getTileShorelineSignature(tile: Tile): string | null {
        if (!tile.discovered || !tile.terrain || tile.terrain === 'water') {
            return null;
        }

        let signature = '';
        let hasShoreline = false;
        for (const side of SIDE_NAMES) {
            const neighbor = this.getTileNeighbor(tile, side);
            const isShoreline = neighbor?.discovered && neighbor.terrain === 'water';
            signature += isShoreline ? side : '-';
            hasShoreline = hasShoreline || isShoreline;
        }
        return hasShoreline ? signature : null;
    }

    private getTileShaderCacheKey(tile: Tile, key: string) {
        const terrain = tile.terrain ?? 'plains';
        const variant = this.getTileShaderVariant(tile, key);
        const reliefMode = this.shouldUseOverlaySafeTileShader(tile) ? 'overlay-safe' : 'full';
        return `v${HexMapService.TILE_SHADER_VERSION}:${terrain}:${key}:${reliefMode}:r${variant.regionBucket}:a${variant.accentBucket}`;
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
        const accent = ctx.createRadialGradient(
            geometry.accentX,
            geometry.accentY,
            0,
            geometry.accentX,
            geometry.accentY,
            geometry.accentRadius,
        );
        accent.addColorStop(0, this.toRgba(palette.patch, palette.patchAlpha * 1.42));
        accent.addColorStop(0.62, this.toRgba(palette.regionGlow, palette.regionGlowAlpha * 0.9));
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
        accentTwo.addColorStop(0, this.toRgba(palette.highlight, palette.highlightAlpha * 1.45));
        accentTwo.addColorStop(0.74, this.toRgba(palette.patch, palette.patchAlpha * 0.82));
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

    private getTileShorelinePalette(terrain: string) {
        if (terrain === 'dirt' || terrain === 'dessert') {
            return {
                outerLand: [175, 136, 80] as GlowColor,
                innerLand: [201, 163, 100] as GlowColor,
                sand: [226, 177, 120] as GlowColor,
            };
        }

        if (terrain === 'snow') {
            return {
                outerLand: [172, 196, 206] as GlowColor,
                innerLand: [198, 220, 226] as GlowColor,
                sand: [220, 214, 186] as GlowColor,
            };
        }

        if (terrain === 'mountain' || terrain === 'vulcano') {
            return {
                outerLand: [116, 130, 112] as GlowColor,
                innerLand: [148, 158, 126] as GlowColor,
                sand: [206, 182, 126] as GlowColor,
            };
        }

        return {
            outerLand: [123, 184, 70] as GlowColor,
            innerLand: [154, 205, 90] as GlowColor,
            sand: [221, 172, 113] as GlowColor,
        };
    }

    private buildTileShorelineCanvas(terrain: string, shorelineSignature: string): HTMLCanvasElement | null {
        const cacheKey = `v${HexMapService.TILE_SHORELINE_VERSION}:${terrain}:${shorelineSignature}`;
        const cached = this.getCachedCanvas(this._tileShorelineCache, cacheKey);
        if (cached) {
            return cached;
        }

        const geometry = this.getTileShaderGeometry(
            { accentBucket: 0, accentVariant: 0, regionBucket: 0, regionVariant: 0 },
            this.TILE_DRAW_SIZE,
            this.TILE_DRAW_SIZE,
        );
        const canvas = this.createTileSizedCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        const vertices = [
            { x: geometry.width * 0.5, y: 0 },
            { x: geometry.width, y: geometry.height * 0.25 },
            { x: geometry.width, y: geometry.height * 0.75 },
            { x: geometry.width * 0.5, y: geometry.height },
            { x: 0, y: geometry.height * 0.75 },
            { x: 0, y: geometry.height * 0.25 },
        ];
        const centerX = geometry.width * 0.5;
        const centerY = geometry.height * 0.5;
        const palette = this.getTileShorelinePalette(terrain);
        const outerLandDepth = geometry.width * 0.22;
        const innerLandDepth = geometry.width * 0.15;
        const sandDepth = geometry.width * 0.075;

        ctx.save();
        this.traceHexClipPath(ctx, this.HEX_SIZE, this.HEX_SIZE);
        ctx.clip();

        for (const side of SIDE_NAMES) {
            if (shorelineSignature[TILE_SIDE_INDEX[side]] !== side) {
                continue;
            }

            const sideIndex = TILE_SIDE_INDEX[side];
            const edgeAlpha = SHORELINE_EDGE_ALPHA_BY_SIDE[side];
            const start = vertices[(sideIndex + 5) % 6]!;
            const end = vertices[sideIndex]!;
            const midX = (start.x + end.x) * 0.5;
            const midY = (start.y + end.y) * 0.5;
            const inwardX = centerX - midX;
            const inwardY = centerY - midY;
            const inwardLength = Math.hypot(inwardX, inwardY) || 1;
            const nx = inwardX / inwardLength;
            const ny = inwardY / inwardLength;

            const snapPoint = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) });
            const edgeStart = snapPoint(start.x, start.y);
            const edgeEnd = snapPoint(end.x, end.y);
            const outerLandStart = snapPoint(start.x + (nx * outerLandDepth), start.y + (ny * outerLandDepth));
            const outerLandEnd = snapPoint(end.x + (nx * outerLandDepth), end.y + (ny * outerLandDepth));
            const innerLandStart = snapPoint(start.x + (nx * innerLandDepth), start.y + (ny * innerLandDepth));
            const innerLandEnd = snapPoint(end.x + (nx * innerLandDepth), end.y + (ny * innerLandDepth));
            const sandStart = snapPoint(start.x + (nx * sandDepth), start.y + (ny * sandDepth));
            const sandEnd = snapPoint(end.x + (nx * sandDepth), end.y + (ny * sandDepth));

            ctx.fillStyle = this.toRgba(palette.outerLand, 0.46 * edgeAlpha);
            ctx.beginPath();
            ctx.moveTo(edgeStart.x, edgeStart.y);
            ctx.lineTo(edgeEnd.x, edgeEnd.y);
            ctx.lineTo(outerLandEnd.x, outerLandEnd.y);
            ctx.lineTo(outerLandStart.x, outerLandStart.y);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = this.toRgba(palette.innerLand, 0.52 * edgeAlpha);
            ctx.beginPath();
            ctx.moveTo(edgeStart.x, edgeStart.y);
            ctx.lineTo(edgeEnd.x, edgeEnd.y);
            ctx.lineTo(innerLandEnd.x, innerLandEnd.y);
            ctx.lineTo(innerLandStart.x, innerLandStart.y);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = this.toRgba(palette.sand, 0.88 * edgeAlpha);
            ctx.beginPath();
            ctx.moveTo(edgeStart.x, edgeStart.y);
            ctx.lineTo(edgeEnd.x, edgeEnd.y);
            ctx.lineTo(sandEnd.x, sandEnd.y);
            ctx.lineTo(sandStart.x, sandStart.y);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
        return this.storeCachedCanvas(
            this._tileShorelineCache,
            cacheKey,
            canvas,
            HexMapService.TILE_SHORELINE_CACHE_MAX,
        );
    }

    private buildTileShaderCanvas(tile: Tile, key: string): HTMLCanvasElement | null {
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

        ctx.globalAlpha = state.opacity;
        ctx.drawImage(shaderCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
    }

    private drawTileProceduralStage(ctx: CanvasRenderingContext2D, state: TileRenderState) {
        const proceduralRoadCanvas = this.getProceduralRoadCanvas(state.tile);
        if (proceduralRoadCanvas) {
            ctx.drawImage(proceduralRoadCanvas, state.x - this.HEX_SIZE, state.y - this.HEX_SIZE);
        }
    }

    private drawTile(t: Tile, now: number, ctx: CanvasRenderingContext2D, opacity: number) {
        const state = this.createTileRenderState(t, now, opacity);
        if (!state) return;

        this.drawTileBaseStage(ctx, state);
        this.drawTileShaderStage(ctx, state);
        this.drawTileProceduralStage(ctx, state);
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
                if (data[((y * sourceWidth) + x) * 4 + 3] > 0) {
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
    private _fogTileCanvas: HTMLCanvasElement | null = null;
    private _proceduralRoadCache = new Map<string, HTMLCanvasElement>();
    private static readonly PROCEDURAL_ROAD_CACHE_MAX = 768;
    private static readonly TILE_COLOR_VARIANT_VERSION = 7;
    private static readonly TILE_COLOR_VARIANT_CACHE_MAX = 2048;
    private static readonly TILE_SHADER_VERSION = 3;
    private static readonly TILE_SHADER_CACHE_MAX = 192;
    private static readonly TILE_SHORELINE_VERSION = 2;
    private static readonly TILE_SHORELINE_CACHE_MAX = 96;
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

        // Soft procedural fog clouds using overlapping radial gradients
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
            // Per-tile variation: subtle shimmer using deterministic offset
            const shimmerSeed = ((t.q * 374761393) ^ (t.r * 668265263)) >>> 0;
            const shimmerX = ((shimmerSeed % 100) / 100) * this.TILE_DRAW_SIZE * 0.4 + this.TILE_DRAW_SIZE * 0.2;
            const shimmerY = (((shimmerSeed >> 8) % 100) / 100) * this.TILE_DRAW_SIZE * 0.4 + this.TILE_DRAW_SIZE * 0.2;
            const shimmerR = this.TILE_DRAW_SIZE * 0.18 + (((shimmerSeed >> 16) % 50) / 50) * this.TILE_DRAW_SIZE * 0.12;
            ctx.save();
            ctx.beginPath();
            this.drawHexPath(ctx, x, y);
            ctx.clip();
            const shimGrad = ctx.createRadialGradient(
                x - this.HEX_SIZE + shimmerX, y - this.HEX_SIZE + shimmerY, 0,
                x - this.HEX_SIZE + shimmerX, y - this.HEX_SIZE + shimmerY, shimmerR,
            );
            shimGrad.addColorStop(0, 'rgba(160, 180, 220, 0.09)');
            shimGrad.addColorStop(1, 'rgba(120, 140, 180, 0)');
            ctx.fillStyle = shimGrad;
            ctx.globalAlpha = reachDim;
            ctx.fill();
            ctx.restore();
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
                this.drawHeroSelectionAura(ctx, interp, pos, opacity, selected, now);
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

    private drawHeroSelectionAura(
        ctx: CanvasRenderingContext2D,
        interp: { x: number; y: number },
        pos: { x: number; y: number },
        opacity: number,
        selected: boolean,
        now: number,
    ) {
        const pulse = 0.5 + (0.5 * Math.sin(now / 280));
        const spin = now / 760;
        const centerX = interp.x + pos.x - 15;
        const centerY = interp.y + pos.y + (this.heroFrameSize * this.heroShadowYOffset) - 3;
        const outerWidth = selected ? 21.5 + (pulse * 2.6) : 17.8 + (pulse * 1.2);
        const outerHeight = selected ? 8.4 + (pulse * 0.9) : 6.9 + (pulse * 0.45);
        const baseAlpha = opacity * (selected ? 1 : 0.76);

        ctx.save();
        ctx.imageSmoothingEnabled = true;

        const aura = ctx.createRadialGradient(centerX, centerY + 0.8, 0, centerX, centerY + 0.8, outerWidth * 1.28);
        if (selected) {
            aura.addColorStop(0, this.toRgba([255, 221, 144], baseAlpha * 0.52));
            aura.addColorStop(0.46, this.toRgba([120, 255, 214], baseAlpha * 0.28));
            aura.addColorStop(1, this.toRgba([120, 255, 214], 0));
        } else {
            aura.addColorStop(0, this.toRgba([180, 235, 255], baseAlpha * 0.14));
            aura.addColorStop(1, this.toRgba([180, 235, 255], 0));
        }
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 0.8, outerWidth * 1.28, outerHeight * 1.28, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = selected ? 2.6 : 1.55;
        ctx.strokeStyle = selected
            ? this.toRgba([244, 197, 102], baseAlpha * 0.72)
            : this.toRgba([164, 228, 255], baseAlpha * 0.48);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 1.15, outerWidth, outerHeight, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (selected) {
            const sparkAngles = [spin * 1.25, (spin * 1.25) + ((Math.PI * 2) / 3), (spin * 1.25) + ((Math.PI * 4) / 3)];
            for (let i = 0; i < sparkAngles.length; i++) {
                const angle = sparkAngles[i]!;
                const px = centerX + (Math.cos(angle) * (outerWidth + 2.2));
                const py = centerY + 1.2 + (Math.sin(angle) * (outerHeight + 1.0));
                const radius = i === 0 ? 1.8 + (pulse * 0.3) : 1.35 + ((1 - pulse) * 0.24);
                const color: GlowColor = i === 0 ? [255, 241, 196] : i === 1 ? [166, 255, 228] : [255, 219, 137];

                ctx.fillStyle = this.toRgba(color, baseAlpha * 0.95);
                ctx.shadowColor = this.toRgba(color, baseAlpha * 0.85);
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    RESOURCE_ICON_MAP: Record<ResourceType, string> = {
        wood: '🪵',
        ore: '⛏️',
        stone: '🪨',
        food: '🍎',
        crystal: '🔮',
        artifact: '🗿',
        water: '💧',
        grain: '🌾',
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
        const canvasCache: Record<string, HTMLCanvasElement> = {};
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
            canvasCache[key] = c;
        }
        this._maskedImages = canvasCache;
        this._imagesLoaded = true;
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
            const attachedHero = ind.heroId ? heroes.find(hero => hero.id === ind.heroId) || null : null;
            const anchorQ = attachedHero?.q ?? ind.position.q;
            const anchorR = attachedHero?.r ?? ind.position.r;
            if (attachedHero || !ind.worldAnchor) {
                const dist = hexDistance(camera, {q: anchorQ, r: anchorR});
                if (dist > camera.radius + 1) continue;
            }

            let worldAnchor = ind.worldAnchor;

            if (attachedHero) {
                const interp = this.getHeroInterpolatedPixelPosition(attachedHero, nowMs);
                const heroImpactOffset = getHeroImpactOffset(attachedHero.id, attachedHero.facing, nowMs);
                const layout = this._heroLayouts.get(axialKey(attachedHero.q, attachedHero.r)) || {};
                const pos = layout[attachedHero.id] || attachedHero.currentOffset || {x: 0, y: 0};
                worldAnchor = {
                    x: interp.x + heroImpactOffset.x + pos.x - (this.heroFrameSize / 2),
                    y: interp.y + heroImpactOffset.y + pos.y - (this.heroFrameSize * 1.5) - 8,
                };
            } else if (!worldAnchor) {
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
                return ['a', 'd'];
            case 'road_be':
                return ['b', 'e'];
            case 'road_ce':
                return ['c', 'e'];
            case 'road_cf':
                return ['c', 'f'];
            default:
                return null;
        }
    }

    private getRoadConnectionSides(tile: Tile): TileSide[] {
        const connections = SIDE_NAMES.filter(side => isRoadConnectionTarget(tile.neighbors?.[side], OPPOSITE_SIDE[side]));
        if (connections.length >= 2) {
            return connections;
        }

        if (connections.length === 1) {
            return [connections[0]];
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

        strokeBranchSet(15, `rgba(58, 38, 24, ${Math.min(1, opacity * 0.34)})`, { startInset: hubBlendInset * 0.85 });
        strokeBranchSet(12.5, `rgba(103, 72, 45, ${Math.min(1, opacity * 0.74)})`, { startInset: hubBlendInset });

        for (const branch of branches) {
            const roadbedGradient = ctx.createLinearGradient(branch.start.x, branch.start.y, branch.end.x, branch.end.y);
            roadbedGradient.addColorStop(0, `rgba(132, 96, 60, ${Math.min(1, opacity * 0.94)})`);
            roadbedGradient.addColorStop(0.45, `rgba(171, 131, 84, ${Math.min(1, opacity * 0.98)})`);
            roadbedGradient.addColorStop(1, `rgba(194, 156, 109, ${Math.min(1, opacity * 0.94)})`);

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
            ctx.strokeStyle = `rgba(240, 215, 174, ${Math.min(1, opacity * 0.34)})`;
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
        hubBlend.addColorStop(0, `rgba(198, 156, 104, ${Math.min(1, opacity * 0.3)})`);
        hubBlend.addColorStop(0.36, `rgba(171, 131, 84, ${Math.min(1, opacity * 0.2)})`);
        hubBlend.addColorStop(0.72, `rgba(112, 79, 49, ${Math.min(1, opacity * 0.08)})`);
        hubBlend.addColorStop(1, 'rgba(112, 79, 49, 0)');
        ctx.fillStyle = hubBlend;
        ctx.beginPath();
        ctx.arc(0, 0, hubBlendRadiusX, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(-0.6, -0.4);
        ctx.scale(1, Math.max(0.68, hubRadiusY / Math.max(1, hubRadiusX)));
        const hubCore = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(2.8, hubRadiusX - 0.6));
        hubCore.addColorStop(0, `rgba(226, 192, 138, ${Math.min(1, opacity * 0.16)})`);
        hubCore.addColorStop(0.55, `rgba(189, 147, 94, ${Math.min(1, opacity * 0.08)})`);
        hubCore.addColorStop(1, 'rgba(189, 147, 94, 0)');
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
            ctx.strokeStyle = `rgba(102, 71, 44, ${Math.min(1, opacity * 0.25)})`;
            ctx.stroke();

            ctx.beginPath();
            this.traceRoadBranchPath(ctx, branch, { lateralOffset: 1.55, startInset: hubBlendInset + 0.9, endInset: 7.4, controlTaper: 0.16 });
            ctx.lineWidth = 1.35;
            ctx.strokeStyle = `rgba(110, 78, 48, ${Math.min(1, opacity * 0.18)})`;
            ctx.stroke();
        }

        strokeBranchSet(2.4, `rgba(239, 209, 164, ${Math.min(1, opacity * 0.18)})`, { startInset: hubBlendInset + 1.2, endInset: 8.5, controlTaper: 0.12 });
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
