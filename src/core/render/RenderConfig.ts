import {
    getEffectiveParticleBudget,
    graphicsStore,
    isBloomEffectEnabled,
    isMotionBlurEffectEnabled,
    shouldUseCanvasDropShadow,
    shouldUseEdgeVignette,
} from '../../store/graphicsStore';
import { isRenderFeatureForcedOn, resolveRenderFeatureEnabled } from '../../store/renderFeatureStore';
import type { DebugQualityLabel, RenderQualityName, RenderQualityProfile, RenderStressTier } from './RenderTypes';
import { GROWTH_HYBRID_STYLE } from './visualStyle';

export interface RenderQualityEnvironment {
    particlesEnabled: boolean;
    maxParticles: number;
    motionBlurEnabled: boolean;
    bloomEnabled: boolean;
    edgeVignetteEnabled: boolean;
    manualShadowComposite: boolean;
}

export interface RenderConfig {
    hexSize: number;
    hexSpace: number;
    tileDrawSize: number;
    terrainChunkSize: number;
    heroFrameSize: number;
    heroZoom: number;
    heroOffsetSpacing: number;
    staticTerrainPaddingPx: number;
    ambientParticleDensity: number;
    hexXFactor: number;
    hexYFactor: number;
}

const SQRT3 = Math.sqrt(3);
const HEX_SIZE = 34;
const HEX_SPACE = 2;
const TILE_DRAW_SIZE = (HEX_SIZE * 2) - HEX_SPACE;

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
    hexSize: HEX_SIZE,
    hexSpace: HEX_SPACE,
    tileDrawSize: TILE_DRAW_SIZE,
    terrainChunkSize: 16,
    heroFrameSize: 16,
    heroZoom: 2,
    heroOffsetSpacing: 14,
    staticTerrainPaddingPx: TILE_DRAW_SIZE * 7,
    ambientParticleDensity: GROWTH_HYBRID_STYLE.particles.ambientDensity,
    hexXFactor: (HEX_SIZE + (HEX_SIZE * 0.155)) * SQRT3,
    hexYFactor: HEX_SIZE * 3 / 2,
};

const BASE_RENDER_QUALITY_PROFILES: Record<RenderQualityName, RenderQualityProfile> = {
    low: {
        name: 'low',
        particlesEnabled: false,
        maxParticles: 100,
        bloomEnabled: false,
        cloudsEnabled: false,
        vignetteEnabled: false,
        fogShimmerEnabled: false,
        auraEnabled: false,
        softShadows: false,
        debugEnabledByDefault: false,
        enableBackdropGlows: false,
        enableMotionBlur: false,
        motionBlurStrength: 0,
        enableBloom: false,
        enableClouds: false,
        enableParticles: false,
        enableEdgeVignette: false,
        enableReachGlow: true,
        enableHeroAuras: false,
        enableFogShimmer: false,
        enableTileRelief: false,
        enableManualShadowComposite: true,
        particleBudgetScale: 0.25,
        overlaySoftness: 0,
        expensiveAtmosphere: false,
        useOffscreenCanvas: false,
        chunkPaddingTiles: 1,
        chunkRebuildPolicy: 'conservative',
    },
    medium: {
        name: 'medium',
        particlesEnabled: true,
        maxParticles: 190,
        bloomEnabled: true,
        cloudsEnabled: true,
        vignetteEnabled: true,
        fogShimmerEnabled: false,
        auraEnabled: true,
        softShadows: true,
        debugEnabledByDefault: false,
        enableBackdropGlows: true,
        enableMotionBlur: true,
        motionBlurStrength: 0.52,
        enableBloom: true,
        enableClouds: true,
        enableParticles: true,
        enableEdgeVignette: true,
        enableReachGlow: true,
        enableHeroAuras: true,
        enableFogShimmer: false,
        enableTileRelief: true,
        enableManualShadowComposite: true,
        particleBudgetScale: 0.48,
        overlaySoftness: 0.35,
        expensiveAtmosphere: false,
        useOffscreenCanvas: false,
        chunkPaddingTiles: 1,
        chunkRebuildPolicy: 'balanced',
    },
    high: {
        name: 'high',
        particlesEnabled: true,
        maxParticles: 330,
        bloomEnabled: true,
        cloudsEnabled: true,
        vignetteEnabled: true,
        fogShimmerEnabled: true,
        auraEnabled: true,
        softShadows: true,
        debugEnabledByDefault: false,
        enableBackdropGlows: true,
        enableMotionBlur: true,
        motionBlurStrength: 0.82,
        enableBloom: true,
        enableClouds: true,
        enableParticles: true,
        enableEdgeVignette: true,
        enableReachGlow: true,
        enableHeroAuras: true,
        enableFogShimmer: true,
        enableTileRelief: true,
        enableManualShadowComposite: true,
        particleBudgetScale: 0.72,
        overlaySoftness: 0.8,
        expensiveAtmosphere: true,
        useOffscreenCanvas: false,
        chunkPaddingTiles: 2,
        chunkRebuildPolicy: 'balanced',
    },
};

export function getRenderQualityProfileName(stressTier: RenderStressTier): RenderQualityName {
    if (stressTier >= 2) {
        return 'low';
    }
    if (stressTier === 1) {
        return 'medium';
    }
    return 'high';
}

export function getRenderDebugLabelForQuality(name: RenderQualityName): DebugQualityLabel {
    if (name === 'high') {
        return 'full';
    }
    if (name === 'medium') {
        return 'reduced';
    }
    return 'minimal';
}

export function getBaseRenderQualityProfile(stressTier: RenderStressTier): RenderQualityProfile {
    return {
        ...BASE_RENDER_QUALITY_PROFILES[getRenderQualityProfileName(stressTier)],
    };
}

export function getDefaultRenderQualityEnvironment(): RenderQualityEnvironment {
    return {
        particlesEnabled: graphicsStore.particles,
        maxParticles: getEffectiveParticleBudget(),
        motionBlurEnabled: isMotionBlurEffectEnabled(),
        bloomEnabled: isBloomEffectEnabled(),
        edgeVignetteEnabled: shouldUseEdgeVignette(),
        manualShadowComposite: !shouldUseCanvasDropShadow(),
    };
}

export function getResolvedRenderQualityProfile(
    stressTier: RenderStressTier,
    environment: RenderQualityEnvironment = getDefaultRenderQualityEnvironment(),
): RenderQualityProfile {
    const baseProfile = getBaseRenderQualityProfile(stressTier);
    const motionBlurEnabled = baseProfile.enableMotionBlur && environment.motionBlurEnabled;
    const bloomEnabled = baseProfile.enableBloom && environment.bloomEnabled;
    const edgeVignetteEnabled = baseProfile.enableEdgeVignette && environment.edgeVignetteEnabled;
    const particlesEnabled = baseProfile.enableParticles && environment.particlesEnabled;

    return applyRenderFeatureOverrides({
        ...baseProfile,
        particlesEnabled: baseProfile.particlesEnabled && particlesEnabled,
        maxParticles: Math.min(baseProfile.maxParticles, environment.maxParticles),
        bloomEnabled: baseProfile.bloomEnabled && bloomEnabled,
        vignetteEnabled: baseProfile.vignetteEnabled && edgeVignetteEnabled,
        enableMotionBlur: motionBlurEnabled,
        motionBlurStrength: motionBlurEnabled ? baseProfile.motionBlurStrength : 0,
        enableBloom: bloomEnabled,
        enableParticles: particlesEnabled,
        enableEdgeVignette: edgeVignetteEnabled,
        enableManualShadowComposite: environment.manualShadowComposite,
    });
}

export function applyRenderFeatureOverrides(profile: RenderQualityProfile): RenderQualityProfile {
    const enableMotionBlur = resolveRenderFeatureEnabled('motionBlur', profile.enableMotionBlur);
    const enableParticles = resolveRenderFeatureEnabled('particles', profile.enableParticles);
    const particlesEnabled = enableParticles && profile.particlesEnabled;
    const maxParticles = particlesEnabled
        ? profile.maxParticles
        : 0;

    return {
        ...profile,
        particlesEnabled,
        maxParticles,
        enableBackdropGlows: resolveRenderFeatureEnabled('backdropGlows', profile.enableBackdropGlows),
        enableMotionBlur,
        motionBlurStrength: enableMotionBlur
            ? Math.max(profile.motionBlurStrength, isRenderFeatureForcedOn('motionBlur') ? 0.52 : 0)
            : 0,
        enableBloom: resolveRenderFeatureEnabled('bloom', profile.enableBloom),
        bloomEnabled: resolveRenderFeatureEnabled('bloom', profile.bloomEnabled),
        enableClouds: resolveRenderFeatureEnabled('clouds', profile.enableClouds),
        cloudsEnabled: resolveRenderFeatureEnabled('clouds', profile.cloudsEnabled),
        enableParticles,
        enableEdgeVignette: resolveRenderFeatureEnabled('edgeVignette', profile.enableEdgeVignette),
        vignetteEnabled: resolveRenderFeatureEnabled('edgeVignette', profile.vignetteEnabled),
        enableReachGlow: resolveRenderFeatureEnabled('reachGlow', profile.enableReachGlow),
        enableHeroAuras: resolveRenderFeatureEnabled('heroAuras', profile.enableHeroAuras),
        auraEnabled: resolveRenderFeatureEnabled('heroAuras', profile.auraEnabled),
        enableFogShimmer: resolveRenderFeatureEnabled('fogShimmer', profile.enableFogShimmer),
        fogShimmerEnabled: resolveRenderFeatureEnabled('fogShimmer', profile.fogShimmerEnabled),
        enableTileRelief: resolveRenderFeatureEnabled('tileRelief', profile.enableTileRelief),
        enableManualShadowComposite: resolveRenderFeatureEnabled('manualShadowComposite', profile.enableManualShadowComposite),
        particleBudgetScale: enableParticles
            ? Math.max(profile.particleBudgetScale, isRenderFeatureForcedOn('particles') ? 0.35 : 0)
            : 0,
    };
}
