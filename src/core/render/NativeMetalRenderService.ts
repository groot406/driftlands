import type { RenderFrameContext } from './RenderPassContext';
import {
    getNativeMetalBridgePlugin,
    shouldUseNativeMetalPath,
} from '../../store/graphicsStore';

type NativeMetalCompositePayload = {
    width: number;
    height: number;
    dpr: number;
    viewportWidth: number;
    viewportHeight: number;
    qualityName: string;
    stressTier: number;
    visibleTiles: number;
    discoveredTiles: number;
    includeEffectSurface: boolean;
    includeMotionBlur: boolean;
    timestamp: number;
};

class NativeMetalRenderService {
    private readonly dispatchCounterPrefix = 'driftlands-native-metal-dispatch-';

    tryCompositeFrame(frame: RenderFrameContext, includeEffectSurface: boolean): boolean {
        if (!shouldUseNativeMetalPath()) {
            return false;
        }

        const plugin = getNativeMetalBridgePlugin();
        if (!plugin) {
            return false;
        }

        const method = plugin.compositeMapFrame
            ?? plugin.renderMapFrame
            ?? plugin.submitMapFrame;
        if (typeof method !== 'function') {
            return false;
        }

        const payload: NativeMetalCompositePayload = {
            width: frame.worldCanvas.width,
            height: frame.worldCanvas.height,
            dpr: frame.viewport.dpr,
            viewportWidth: frame.viewport.width,
            viewportHeight: frame.viewport.height,
            qualityName: frame.quality.name,
            stressTier: frame.stressTier,
            visibleTiles: frame.scene.visibleTiles.length,
            discoveredTiles: frame.scene.visibleTiles.filter((tile) => tile.discovered).length,
            includeEffectSurface,
            includeMotionBlur: frame.quality.enableMotionBlur,
            timestamp: performance.now(),
        };

        const id = `${this.dispatchCounterPrefix}${Math.floor(Math.random() * 1_000_000)}`;
        const callPayload = {
            ...payload,
            dispatchId: id,
            quality: frame.quality,
            target: {
                width: frame.viewport.width,
                height: frame.viewport.height,
                dpr: frame.viewport.dpr,
            },
        };

        void Promise.resolve(method(callPayload)).catch(() => {
            // Native bridge failures are non-fatal; keep web fallback alive.
        });
        return true;
    }
}

export const nativeMetalRenderService = new NativeMetalRenderService();
