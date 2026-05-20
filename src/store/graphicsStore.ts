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

export type GraphicsDiagnosticOverrideMode = 'auto' | 'off' | 'on';
export type CanvasDprOverrideMode = 'auto' | 'low' | '1x' | 'native';
export type GraphicsDiagnosticTechniqueKey =
    | 'windowsPresentationSafeMode'
    | 'browserLightRendering'
    | 'desynchronizedCanvas'
    | 'rescueTimer'
    | 'canvasDpr';

export const graphicsDiagnosticOverrideStore = reactive<{
    windowsPresentationSafeMode: GraphicsDiagnosticOverrideMode;
    browserLightRendering: GraphicsDiagnosticOverrideMode;
    desynchronizedCanvas: GraphicsDiagnosticOverrideMode;
    rescueTimer: GraphicsDiagnosticOverrideMode;
    canvasDpr: CanvasDprOverrideMode;
}>({
    windowsPresentationSafeMode: 'auto',
    browserLightRendering: 'auto',
    desynchronizedCanvas: 'auto',
    rescueTimer: 'auto',
    canvasDpr: 'auto',
});

function resolveDiagnosticBooleanOverride(
    key: Exclude<GraphicsDiagnosticTechniqueKey, 'canvasDpr'>,
    autoValue: boolean,
) {
    const mode = graphicsDiagnosticOverrideStore[key];
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return autoValue;
}

export function cycleGraphicsDiagnosticOverride(key: GraphicsDiagnosticTechniqueKey) {
    if (key === 'canvasDpr') {
        const current = graphicsDiagnosticOverrideStore.canvasDpr;
        graphicsDiagnosticOverrideStore.canvasDpr = current === 'auto'
            ? 'low'
            : current === 'low'
                ? '1x'
                : current === '1x'
                    ? 'native'
                    : 'auto';
        return;
    }

    const current = graphicsDiagnosticOverrideStore[key];
    graphicsDiagnosticOverrideStore[key] = current === 'auto'
        ? 'off'
        : current === 'off'
            ? 'on'
            : 'auto';
}

export function isSafariBrowser() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const ua = navigator.userAgent;
    return /Safari/i.test(ua)
        && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);
}

export function isFirefoxBrowser() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    return /Firefox|FxiOS/i.test(navigator.userAgent);
}

export function isChromiumBrowser() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    return /Chrome|Chromium|CriOS|Edg|OPR/i.test(navigator.userAgent)
        && !/Firefox|FxiOS/i.test(navigator.userAgent);
}

export function isWindowsBrowser() {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const uaDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
    const platform = uaDataPlatform ?? navigator.platform ?? '';
    return /Windows/i.test(platform) || /Windows NT/i.test(navigator.userAgent);
}

function getAutoWindowsPresentationSafeMode() {
    return isWindowsBrowser() && (isChromiumBrowser() || isFirefoxBrowser());
}

export function shouldUseWindowsPresentationSafeMode() {
    return resolveDiagnosticBooleanOverride('windowsPresentationSafeMode', getAutoWindowsPresentationSafeMode());
}

export function shouldUseBrowserLightRendering() {
    return resolveDiagnosticBooleanOverride(
        'browserLightRendering',
        isSafariBrowser() || isFirefoxBrowser() || shouldUseWindowsPresentationSafeMode(),
    );
}

export function shouldUseSafariLightRendering() {
    return shouldUseBrowserLightRendering();
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

export function shouldUseDesynchronizedCanvas() {
    return resolveDiagnosticBooleanOverride('desynchronizedCanvas', !shouldUseWindowsPresentationSafeMode());
}

export function shouldUseWindowsRescueTimer() {
    return resolveDiagnosticBooleanOverride('rescueTimer', shouldUseWindowsPresentationSafeMode());
}

export function getEffectiveCanvasDpr() {
    const mode = graphicsDiagnosticOverrideStore.canvasDpr;
    const windowDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

    if (mode === 'low') return 0.75;
    if (mode === '1x') return 1;
    if (mode === 'native') return Math.max(0.5, Math.min(2, windowDpr));
    return 1;
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
