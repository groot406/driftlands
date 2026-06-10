import { reactive } from 'vue';
import type { RenderQualityName } from '../core/render/RenderTypes';

export interface RenderDebugState {
    stressTier: 0 | 1 | 2;
    qualityLabel: 'full' | 'reduced' | 'minimal';
    qualityProfileName: RenderQualityName;
    smoothedFrameMs: number;
    smoothedDrawIntervalMs: number;
    viewportWidth: number;
    viewportHeight: number;
    viewportDpr: number;
    windowDpr: number;
    canvasBackingWidth: number;
    canvasBackingHeight: number;
    canvasCssWidth: number;
    canvasCssHeight: number;
    canvasMegapixels: number;
    visibleTileCount: number;
    discoveredVisibleCount: number;
    worldRenderVersion: number;
    staticTerrainReused: boolean;
    staticTerrainReason: 'init' | 'world' | 'viewport' | 'radius' | 'drift' | 'shift' | 'patch' | 'reuse';
    staticTerrainRebuilds: number;
    staticTerrainPaddingPx: number;
    staticTerrainThresholdPx: number;
    staticTerrainShiftPx: number;
    motionBlurEnabled: boolean;
    motionBlurActive: boolean;
    motionBlurSamples: number;
    motionBlurStrength: number;
    bloomEnabled: boolean;
    cloudsEnabled: boolean;
    particlesEnabled: boolean;
    birdsEnabled: boolean;
    edgeVignetteEnabled: boolean;
    backdropGlowsEnabled: boolean;
    reachGlowEnabled: boolean;
    heroAurasEnabled: boolean;
    fogShimmerEnabled: boolean;
    tileReliefEnabled: boolean;
    manualShadowComposite: boolean;
    nativeMetalCompositeDispatched: boolean;
    particleCount: number;
    birdParticleCount: number;
    visibleChunkCount: number;
    dirtyChunkCount: number;
    terrainChunkRebuilds: number;
    passTimingsMs: Record<string, number>;
    settlementReachCount?: number;
    settlementReachInfo?: string;
}

export const renderDebugState = reactive<RenderDebugState>({
    stressTier: 0,
    qualityLabel: 'full',
    qualityProfileName: 'high',
    smoothedFrameMs: 0,
    smoothedDrawIntervalMs: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    viewportDpr: 1,
    windowDpr: 1,
    canvasBackingWidth: 0,
    canvasBackingHeight: 0,
    canvasCssWidth: 0,
    canvasCssHeight: 0,
    canvasMegapixels: 0,
    visibleTileCount: 0,
    discoveredVisibleCount: 0,
    worldRenderVersion: 0,
    staticTerrainReused: false,
    staticTerrainReason: 'init',
    staticTerrainRebuilds: 0,
    staticTerrainPaddingPx: 0,
    staticTerrainThresholdPx: 0,
    staticTerrainShiftPx: 0,
    motionBlurEnabled: false,
    motionBlurActive: false,
    motionBlurSamples: 0,
    motionBlurStrength: 0,
    bloomEnabled: false,
    cloudsEnabled: false,
    particlesEnabled: false,
    birdsEnabled: false,
    edgeVignetteEnabled: false,
    backdropGlowsEnabled: false,
    reachGlowEnabled: false,
    heroAurasEnabled: false,
    fogShimmerEnabled: false,
    tileReliefEnabled: false,
    manualShadowComposite: false,
    nativeMetalCompositeDispatched: false,
    particleCount: 0,
    birdParticleCount: 0,
    visibleChunkCount: 0,
    dirtyChunkCount: 0,
    terrainChunkRebuilds: 0,
    passTimingsMs: {},
    settlementReachCount: 0,
    settlementReachInfo: '',
});

export function updateRenderDebugState(next: Partial<RenderDebugState>) {
    Object.assign(renderDebugState, next);
}
