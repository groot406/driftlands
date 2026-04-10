import type { ParticleRenderItem, RenderQualityProfile } from '../RenderTypes';
import { clampParticleBudget } from './ParticleBudgetPolicy';

export class ParticleSystem {
    private particles: ParticleRenderItem[] = [];

    reset() {
        this.particles = [];
    }

    setParticles(particles: readonly ParticleRenderItem[], quality: RenderQualityProfile) {
        const budget = clampParticleBudget(particles.length, quality);
        this.particles = [...particles.slice(0, budget)];
    }

    getParticles() {
        return this.particles;
    }
}
