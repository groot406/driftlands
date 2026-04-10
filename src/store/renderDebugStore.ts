import { reactive } from 'vue';
import type { RenderQualityName } from '../core/render/RenderTypes';

export interface RenderDebugState {
    stressTier: 0 | 1 | 2;
    qualityLabel: 'full' | 'reduced' | 'minimal';
    qualityProfileName: RenderQualityName;
    smoothedFrameMs: number;
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
    manualShadowComposite: boolean;
    particleCount: number;
    birdParticleCount: number;
    visibleChunkCount: number;
    dirtyChunkCount: number;
    terrainChunkRebuilds: number;
    passTimingsMs: Record<string, number>;
}

export const renderDebugState = reactive<RenderDebugState>({
    stressTier: 0,
    qualityLabel: 'full',
    qualityProfileName: 'high',
    smoothedFrameMs: 0,
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
    manualShadowComposite: false,
    particleCount: 0,
    birdParticleCount: 0,
    visibleChunkCount: 0,
    dirtyChunkCount: 0,
    terrainChunkRebuilds: 0,
    passTimingsMs: {},
});

export function updateRenderDebugState(next: Partial<RenderDebugState>) {
    Object.assign(renderDebugState, next);
}
