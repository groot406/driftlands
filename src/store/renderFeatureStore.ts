import { reactive } from 'vue';

export type RenderFeatureKey =
    | 'backdropGlows'
    | 'motionBlur'
    | 'bloom'
    | 'particles'
    | 'edgeVignette'
    | 'reachGlow'
    | 'heroAuras'
    | 'fogShimmer'
    | 'manualShadowComposite';

export type RenderFeatureOverrideMode = 'auto' | 'off' | 'on';

export const renderFeatureOverrideStore = reactive<Record<RenderFeatureKey, RenderFeatureOverrideMode>>({
    backdropGlows: 'auto',
    motionBlur: 'auto',
    bloom: 'auto',
    particles: 'auto',
    edgeVignette: 'auto',
    reachGlow: 'auto',
    heroAuras: 'auto',
    fogShimmer: 'auto',
    manualShadowComposite: 'auto',
});

export function cycleRenderFeatureOverride(feature: RenderFeatureKey) {
    const current = renderFeatureOverrideStore[feature];
    renderFeatureOverrideStore[feature] = current === 'auto'
        ? 'off'
        : current === 'off'
            ? 'on'
            : 'auto';
}

export function resolveRenderFeatureEnabled(feature: RenderFeatureKey, enabled: boolean) {
    const mode = renderFeatureOverrideStore[feature];
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return enabled;
}

export function isRenderFeatureForcedOn(feature: RenderFeatureKey) {
    return renderFeatureOverrideStore[feature] === 'on';
}
