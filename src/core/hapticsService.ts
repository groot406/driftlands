export type HapticPreset =
    | 'selection'
    | 'impact-light'
    | 'impact-medium'
    | 'impact-heavy'
    | 'success'
    | 'warning'
    | 'error';

type HapticOptions = {
    force?: boolean;
    cooldownMs?: number;
};

type CapacitorStyle = 'light' | 'medium' | 'heavy';
type CapacitorNotificationType = 'SUCCESS' | 'WARNING' | 'ERROR';

type NativeHapticsPlugin = {
    impact?: (options: { style: CapacitorStyle }) => Promise<unknown> | void;
    notification?: (options: { type: CapacitorNotificationType }) => Promise<unknown> | void;
    selectionStart?: () => Promise<unknown> | void;
    selectionChanged?: () => Promise<unknown> | void;
    selectionEnd?: () => Promise<unknown> | void;
};

type HapticsPluginCandidate = {
    Haptics?: NativeHapticsPlugin;
};

type AppWithHaptics = {
    Plugins?: HapticsPluginCandidate;
    Plugin?: HapticsPluginCandidate;
};

function isNavigatorAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.navigator !== 'undefined';
}

function getNowMs(): number {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function getPointerEventTarget(event: Event): EventTarget | null {
    return event.target ?? null;
}

class HapticsService {
    private readonly cooldownByPreset: Record<HapticPreset, number> = {
        selection: 40,
        'impact-light': 45,
        'impact-medium': 55,
        'impact-heavy': 65,
        success: 180,
        warning: 220,
        error: 240,
    };
    private readonly nativeFallbackVibrationMs: Record<HapticPreset, number | number[]> = {
        selection: 8,
        'impact-light': 14,
        'impact-medium': 22,
        'impact-heavy': 35,
        success: [12, 35, 12],
        warning: [22, 40, 22, 30],
        error: [10, 35, 18, 35, 28],
    };
    private readonly lastTriggerMsByPreset: Map<HapticPreset, number> = new Map();
    private tapListenerAttached = false;

    private canNativeTrigger(): boolean {
        return this.getNativeHaptics() !== null;
    }

    private canFallbackTrigger(): boolean {
        if (!isNavigatorAvailable()) {
            return false;
        }
        const navigatorRef = window.navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
        return typeof navigatorRef.vibrate === 'function';
    }

    private getNativeHaptics(): NativeHapticsPlugin | null {
        const cap = (window as unknown as { Capacitor?: AppWithHaptics }).Capacitor;
        if (!cap) {
            return null;
        }
        return cap.Plugins?.Haptics ?? cap.Plugin?.Haptics ?? null;
    }

    private isNativeContext(): boolean {
        if (!isNavigatorAvailable()) {
            return false;
        }
        const navigatorRef = window.navigator as Navigator & { standalone?: boolean };
        return window.matchMedia('(display-mode: standalone)').matches || navigatorRef.standalone === true;
    }

    trigger(preset: HapticPreset, options: HapticOptions = {}): void {
        if (!this.shouldTrigger(preset, options)) {
            return;
        }

        this.lastTriggerMsByPreset.set(preset, getNowMs());

        void this.triggerNative(preset).catch(() => {
            this.triggerFallback(preset);
        });
    }

    private shouldTrigger(preset: HapticPreset, options: HapticOptions): boolean {
        const cooldownMs = options.cooldownMs ?? this.cooldownByPreset[preset];
        const nowMs = getNowMs();
        const lastMs = this.lastTriggerMsByPreset.get(preset) ?? 0;

        if (nowMs - lastMs < cooldownMs) {
            return false;
        }

        if (options.force) {
            return this.canNativeTrigger() || this.canFallbackTrigger();
        }

        return (this.isNativeContext() || this.canFallbackTrigger()) && (this.canNativeTrigger() || this.canFallbackTrigger());
    }

    private async triggerNative(preset: HapticPreset): Promise<void> {
        const plugin = this.getNativeHaptics();
        if (!plugin) {
            this.triggerFallback(preset);
            return;
        }

        if (preset === 'selection') {
            if (typeof plugin.selectionEnd === 'function') {
                await plugin.selectionEnd();
            } else if (typeof plugin.selectionStart === 'function') {
                await plugin.selectionStart();
            } else if (typeof plugin.selectionChanged === 'function') {
                await plugin.selectionChanged();
            } else if (typeof plugin.impact === 'function') {
                await plugin.impact({style: 'light'});
            }
            return;
        }

        if (preset.startsWith('impact')) {
            const style = preset === 'impact-heavy' ? 'heavy' : preset === 'impact-medium' ? 'medium' : 'light';
            if (typeof plugin.impact === 'function') {
                await plugin.impact({style});
            }
            return;
        }

        if ((preset === 'success' || preset === 'warning' || preset === 'error') && typeof plugin.notification === 'function') {
            const type = preset === 'success' ? 'SUCCESS' : preset === 'warning' ? 'WARNING' : 'ERROR';
            await plugin.notification({type});
            return;
        }

        this.triggerFallback(preset);
    }

    private triggerFallback(preset: HapticPreset): void {
        if (!isNavigatorAvailable()) {
            return;
        }
        const navigatorRef = window.navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
        const vibrate = navigatorRef.vibrate;
        if (typeof vibrate !== 'function') {
            return;
        }
        vibrate(this.nativeFallbackVibrationMs[preset]);
    }

    attachInteractiveTapHaptics(root: Document | Element = document): void {
        if (this.tapListenerAttached || typeof document === 'undefined' || !root) {
            return;
        }

        const onPointerUp = (event: Event) => {
            const target = getPointerEventTarget(event);
            if (!target || !(target instanceof Element)) {
                return;
            }

            const interactive = target.closest(
                'button, [role="button"], [type="button"], [type="submit"], [href], [data-haptic-target]',
            );
            if (!interactive) {
                return;
            }

            if (interactive instanceof HTMLButtonElement && interactive.disabled) {
                return;
            }

            this.trigger('selection', {force: this.isNativeContext()});
        };

        root.addEventListener('pointerup', onPointerUp, {passive: true});
        this.tapListenerAttached = true;
    }
}

export const hapticsService = new HapticsService();

export function triggerSelectionHaptic(force = false): void {
    hapticsService.trigger('selection', {force});
}

export function triggerImpactHaptic(level: 'light' | 'medium' | 'heavy' = 'light', force = false): void {
    const preset = level === 'heavy'
        ? 'impact-heavy'
        : level === 'medium'
            ? 'impact-medium'
            : 'impact-light';
    hapticsService.trigger(preset, {force});
}

export function triggerSuccessHaptic(force = false): void {
    hapticsService.trigger('success', {force});
}

export function triggerWarningHaptic(force = false): void {
    hapticsService.trigger('warning', {force});
}

export function attachInteractiveTapHaptics(): void {
    if (!isNavigatorAvailable() || typeof document === 'undefined') {
        return;
    }
    hapticsService.attachInteractiveTapHaptics(document);
}
