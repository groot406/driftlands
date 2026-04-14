import type { HeroMovementState } from '../types/Hero';
import type { ResourceAmount, ResourceType } from '../types/Resource';
import type { TileActivationState, TileSupportBand } from '../types/Tile';

export type RenderStressTier = 0 | 1 | 2;
export type RenderQualityName = 'low' | 'medium' | 'high';
export type DebugQualityLabel = 'full' | 'reduced' | 'minimal';
export type OverlayRenderType = 'hover' | 'selected' | 'path' | 'reach' | 'region' | 'marker';
export type OverlayRenderLayer = 'underlay' | 'overlay' | 'screen';

export interface AxialCoord {
    q: number;
    r: number;
}

export interface ViewportSnapshot {
    width: number;
    height: number;
    dpr: number;
    cameraX: number;
    cameraY: number;
    cameraQ: number;
    cameraR: number;
    radius: number;
    innerRadius: number;
    zoom: number;
    roll: number;
    offsetX: number;
    offsetY: number;
}

export interface TerrainTileFlags {
    discovered: boolean;
    hasVariant: boolean;
    inReach: boolean;
    hasTileOverlay: boolean;
    hasBuildingOverlay: boolean;
}

export interface TerrainTileRenderItem extends AxialCoord {
    tileId: string;
    worldX: number;
    worldY: number;
    terrainType: string | null;
    variantKey: string | null;
    activationState: TileActivationState | null;
    supportBand: TileSupportBand | null;
    flags: TerrainTileFlags;
}

export interface TerrainChunkRef {
    key: string;
    chunkQ: number;
    chunkR: number;
    minQ: number;
    maxQ: number;
    minR: number;
    maxR: number;
    worldX: number;
    worldY: number;
    width: number;
    height: number;
}

export interface EntityShadowSpec {
    opacity: number;
    widthFactor: number;
    heightFactor: number;
    yOffset: number;
}

export interface EntityRenderItem extends AxialCoord {
    entityId: string;
    kind: 'hero' | 'settler' | 'tileOverlay' | 'buildingOverlay' | 'prop';
    worldX: number;
    worldY: number;
    spriteKey: string;
    frameKey?: string;
    sortY: number;
    sortX: number;
    layer: number;
    opacity: number;
    scale: number;
    shadow: EntityShadowSpec | null;
    facing?: 'up' | 'down' | 'left' | 'right';
    movement?: HeroMovementState;
    currentTaskId?: string;
    carryingPayload?: ResourceAmount;
    payload?: Readonly<Record<string, unknown>>;
}

export interface OverlayRenderItem extends Partial<AxialCoord> {
    type: OverlayRenderType;
    layer: OverlayRenderLayer;
    worldX?: number;
    worldY?: number;
    styleKey: string;
    intensity?: number;
    payload?: Readonly<Record<string, unknown>>;
}

export interface ParticleRenderItem {
    particleId: string;
    worldX: number;
    worldY: number;
    size: number;
    alpha: number;
    glow: number;
    color: readonly [number, number, number];
    layer: 'underlay' | 'overlay';
    shape: 'circle' | 'diamond' | 'cloud' | 'ring' | 'bird';
}

export interface FrameInfo {
    effectNowMs: number;
    movementNowMs: number;
    perfNowMs: number;
    worldRenderVersion: number;
    stressTier: RenderStressTier;
    cameraMoving: boolean;
    qualityName: RenderQualityName;
}

export interface DebugRenderScene {
    visibleTileCount: number;
    visibleEntityCount: number;
    overlayCount: number;
    visibleChunkCount: number;
    dirtyChunkCount: number;
    selectedHeroId: string | null;
}

export interface RenderScene {
    viewport: ViewportSnapshot;
    visibleTiles: readonly TerrainTileRenderItem[];
    visibleChunks: readonly TerrainChunkRef[];
    visibleEntities: readonly EntityRenderItem[];
    overlays: readonly OverlayRenderItem[];
    particles: readonly ParticleRenderItem[];
    debug: DebugRenderScene;
    frameInfo: FrameInfo;
}

export interface RenderQualityProfile {
    name: RenderQualityName;
    particlesEnabled: boolean;
    maxParticles: number;
    bloomEnabled: boolean;
    cloudsEnabled: boolean;
    vignetteEnabled: boolean;
    fogShimmerEnabled: boolean;
    auraEnabled: boolean;
    softShadows: boolean;
    debugEnabledByDefault: boolean;
    enableBackdropGlows: boolean;
    enableMotionBlur: boolean;
    motionBlurStrength: number;
    enableBloom: boolean;
    enableClouds: boolean;
    enableParticles: boolean;
    enableEdgeVignette: boolean;
    enableReachGlow: boolean;
    enableHeroAuras: boolean;
    enableFogShimmer: boolean;
    enableManualShadowComposite: boolean;
    particleBudgetScale: number;
    overlaySoftness: number;
    expensiveAtmosphere: boolean;
    useOffscreenCanvas: boolean;
    chunkPaddingTiles: number;
    chunkRebuildPolicy: 'conservative' | 'balanced' | 'aggressive';
}

export interface HexMapDrawOptions {
    hoveredTile: {
        id: string;
        q: number;
        r: number;
        discovered: boolean;
    } | null;
    hoveredHero: {
        id: string;
    } | null;
    hoveredSettler?: {
        id: string;
    } | null;
    taskMenuTile: {
        id: string;
        q: number;
        r: number;
    } | null;
    pathCoords: readonly AxialCoord[];
    clusterBoundaryTiles?: readonly AxialCoord[];
    clusterTileIds?: ReadonlySet<string>;
    globalReachBoundary?: readonly AxialCoord[];
    globalReachTileIds?: ReadonlySet<string>;
    showSupportOverlay?: boolean;
    hoveredTileInReach?: boolean;
}

export interface FrameTimes {
    effectNowMs: number;
    movementNowMs: number;
    perfNowMs: number;
}

export interface ResourceFlightRenderItem extends AxialCoord {
    resourceType: ResourceType;
    icon: string;
    color: string;
    startedMs: number;
    durationMs: number;
    scatter: number;
}
