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

function detectSafariBrowser() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const userAgent = navigator.userAgent;
    const vendor = navigator.vendor ?? '';
    const isAppleSafari = /Safari/i.test(userAgent) && /Apple/i.test(vendor);
    const hasChromiumMarker = /Chrome|CriOS|Chromium|Edg|OPR|Brave|Vivaldi/i.test(userAgent);
    const hasOtherEngineMarker = /Firefox|FxiOS|Android/i.test(userAgent);
    return isAppleSafari && !hasChromiumMarker && !hasOtherEngineMarker;
}

export const browserGraphicsProfile = {
    safariOptimized: detectSafariBrowser(),
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
    return graphicsStore.motionBlur && !browserGraphicsProfile.safariOptimized;
}

export function isBloomEffectEnabled() {
    return graphicsStore.bloom && !browserGraphicsProfile.safariOptimized;
}

export function shouldUseCanvasDropShadow() {
    return !browserGraphicsProfile.safariOptimized;
}

export function shouldUseEdgeVignette() {
    return !browserGraphicsProfile.safariOptimized;
}

export function shouldUseParticleGlowPass() {
    return !browserGraphicsProfile.safariOptimized;
}

export function getEffectiveParticleBudget() {
    return browserGraphicsProfile.safariOptimized ? 180 : 420;
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
