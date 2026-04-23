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

export function isMotionBlurEffectEnabled() {
    return graphicsStore.motionBlur;
}

export function isBloomEffectEnabled() {
    return graphicsStore.bloom;
}

export function shouldUseCanvasDropShadow() {
    return false;
}

export function shouldUseEdgeVignette() {
    return true;
}

export function shouldUseParticleGlowPass() {
    return true;
}

export function getEffectiveParticleBudget() {
    return 420;
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
