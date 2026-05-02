import { reactive } from 'vue';

export interface GraphicsSettingsData {
    screenShake: boolean;
    motionBlur: boolean;
    bloom: boolean;
    particles: boolean;
}

export const GRAPHICS_SETTINGS_KEY = 'driftlands-graphics-settings';

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettingsData = {
    screenShake: true,
    motionBlur: true,
    bloom: true,
    particles: true,
};

function loadGraphicsSettings(): GraphicsSettingsData {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_GRAPHICS_SETTINGS };
    }

    try {
        const saved = localStorage.getItem(GRAPHICS_SETTINGS_KEY);
        if (!saved) {
            return { ...DEFAULT_GRAPHICS_SETTINGS };
        }

        const parsed = JSON.parse(saved);

        return {
            screenShake: parsed.screenShake ?? parsed.cameraDynamics ?? DEFAULT_GRAPHICS_SETTINGS.screenShake,
            motionBlur: parsed.motionBlur ?? DEFAULT_GRAPHICS_SETTINGS.motionBlur,
            bloom: parsed.bloom ?? DEFAULT_GRAPHICS_SETTINGS.bloom,
            particles: parsed.particles ?? DEFAULT_GRAPHICS_SETTINGS.particles,
        };
    } catch (error) {
        console.warn('Failed to load graphics settings:', error);
        return { ...DEFAULT_GRAPHICS_SETTINGS };
    }
}

export const graphicsStore = reactive<GraphicsSettingsData>(loadGraphicsSettings());

export function isSafariBrowser() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const ua = navigator.userAgent;
    return /Safari/i.test(ua)
        && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);
}

export function shouldUseSafariLightRendering() {
    return isSafariBrowser();
}

export function isMotionBlurEffectEnabled() {
    return graphicsStore.motionBlur && !shouldUseSafariLightRendering();
}

export function isBloomEffectEnabled() {
    return graphicsStore.bloom && !shouldUseSafariLightRendering();
}

export function shouldUseCanvasDropShadow() {
    return false;
}

export function shouldUseManualCanvasShadowComposite() {
    return !shouldUseSafariLightRendering();
}

export function shouldUseEdgeVignette() {
    return !shouldUseSafariLightRendering();
}

export function shouldUseParticleGlowPass() {
    return !shouldUseSafariLightRendering();
}

export function getEffectiveParticleBudget() {
    return shouldUseSafariLightRendering() ? 160 : 420;
}

export function persistGraphicsSettings() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        localStorage.setItem(GRAPHICS_SETTINGS_KEY, JSON.stringify(graphicsStore));
    } catch (error) {
        console.warn('Failed to save graphics settings:', error);
    }
}
