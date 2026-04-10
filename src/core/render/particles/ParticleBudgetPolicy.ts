import type { RenderQualityProfile } from '../RenderTypes';

export function getParticleBudget(quality: RenderQualityProfile) {
    return quality.enableParticles && quality.particlesEnabled
        ? quality.maxParticles
        : 0;
}

export function clampParticleBudget(requestedCount: number, quality: RenderQualityProfile) {
    return Math.max(0, Math.min(requestedCount, getParticleBudget(quality)));
}
