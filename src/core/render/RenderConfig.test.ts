import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFeatureOverrideStore } from '../../store/renderFeatureStore';
import { getResolvedRenderQualityProfile, type RenderQualityEnvironment } from './RenderConfig';

function resetRenderFeatureOverrides() {
    renderFeatureOverrideStore.backdropGlows = 'auto';
    renderFeatureOverrideStore.motionBlur = 'auto';
    renderFeatureOverrideStore.bloom = 'auto';
    renderFeatureOverrideStore.particles = 'auto';
    renderFeatureOverrideStore.birds = 'auto';
    renderFeatureOverrideStore.clouds = 'auto';
    renderFeatureOverrideStore.edgeVignette = 'auto';
    renderFeatureOverrideStore.reachGlow = 'auto';
    renderFeatureOverrideStore.heroAuras = 'auto';
    renderFeatureOverrideStore.fogShimmer = 'auto';
    renderFeatureOverrideStore.tileRelief = 'auto';
    renderFeatureOverrideStore.manualShadowComposite = 'auto';
}

function makeEnvironment(overrides: Partial<RenderQualityEnvironment> = {}): RenderQualityEnvironment {
    return {
        particlesEnabled: true,
        maxParticles: 420,
        motionBlurEnabled: true,
        bloomEnabled: true,
        edgeVignetteEnabled: true,
        manualShadowComposite: true,
        ...overrides,
    };
}

test('getResolvedRenderQualityProfile keeps motion blur enabled when the graphics environment supports it', () => {
    resetRenderFeatureOverrides();

    const profile = getResolvedRenderQualityProfile(0, makeEnvironment({
        motionBlurEnabled: true,
    }));

    assert.equal(profile.name, 'high');
    assert.equal(profile.enableMotionBlur, true);
    assert.ok(profile.motionBlurStrength > 0);
});

test('getResolvedRenderQualityProfile disables motion blur and bloom when the graphics environment does not support them', () => {
    resetRenderFeatureOverrides();

    const profile = getResolvedRenderQualityProfile(0, makeEnvironment({
        motionBlurEnabled: false,
        bloomEnabled: false,
        edgeVignetteEnabled: false,
    }));

    assert.equal(profile.enableMotionBlur, false);
    assert.equal(profile.motionBlurStrength, 0);
    assert.equal(profile.enableBloom, false);
    assert.equal(profile.bloomEnabled, false);
    assert.equal(profile.enableEdgeVignette, false);
    assert.equal(profile.vignetteEnabled, false);
});

test('getResolvedRenderQualityProfile enables clouds for high quality and respects overrides', () => {
    resetRenderFeatureOverrides();

    const profile = getResolvedRenderQualityProfile(0, makeEnvironment());
    assert.equal(profile.enableClouds, true);
    assert.equal(profile.cloudsEnabled, true);

    renderFeatureOverrideStore.clouds = 'off';
    const disabledProfile = getResolvedRenderQualityProfile(0, makeEnvironment());
    assert.equal(disabledProfile.enableClouds, false);
    assert.equal(disabledProfile.cloudsEnabled, false);
});

test('getResolvedRenderQualityProfile exposes tile relief as a feature override', () => {
    resetRenderFeatureOverrides();

    const profile = getResolvedRenderQualityProfile(0, makeEnvironment());
    assert.equal(profile.enableTileRelief, true);

    renderFeatureOverrideStore.tileRelief = 'off';
    const disabledProfile = getResolvedRenderQualityProfile(0, makeEnvironment());
    assert.equal(disabledProfile.enableTileRelief, false);
});
